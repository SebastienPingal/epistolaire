-- Étape 11 : documents et gabarits.
--
--   * les images des documents (cartes, illustrations) et des sceaux ;
--   * l'écriture d'un document sans expéditeur ;
--   * les passages abîmés de toutes les cases d'un gabarit, pas seulement du texte d'un billet.
--
-- Rien n'est supprimé ni déplacé. Les billets existants ({ "texte": … }) restent tels quels.

-- ---------------------------------------------------------------------------
-- Les images. Le fichier lui-même est dans le stockage Vercel Blob, en accès privé :
-- cette table n'en garde que la fiche. Ni le chemin ni l'adresse ne sortent vers un joueur :
-- le site sert l'image lui-même, après avoir vérifié qu'il a le droit de la voir.
-- ---------------------------------------------------------------------------
create table images (
    id           uuid primary key default gen_random_uuid(),
    chemin_blob  text not null unique,
    url_blob     text not null,
    type_mime    text not null
        check (type_mime in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
    -- En octets.
    taille       integer not null check (taille > 0),
    -- En pixels.
    largeur      integer not null check (largeur > 0),
    hauteur      integer not null check (hauteur > 0),
    cree_le      timestamptz not null default now()
);

-- L'image d'un sceau. Vide : le sceau est dessiné à partir de ses initiales.
alter table sceaux
    add column image_id uuid references images (id) on delete restrict;

comment on column sceaux.image_url is
    'Remplacée par image_id (migration 0008). Gardée, mais plus lue.';

-- ---------------------------------------------------------------------------
-- L'écriture d'un document sans expéditeur (une lettre trouvée, un acte anonyme).
-- Quand le pli a un auteur, c'est son écriture qui compte, et cette colonne reste vide.
-- ---------------------------------------------------------------------------
alter table plis
    add column ecriture_id uuid references ecritures (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Voile tout un contenu : chaque texte devient une suite de « · », quelle que soit sa case.
-- Les retours à la ligne restent, et l'identifiant d'une image aussi (ce n'est pas un texte).
-- Sert quand la liste des passages abîmés est mal formée : rien ne doit passer.
-- ---------------------------------------------------------------------------
create function voiler_tout(p_valeur jsonb) returns jsonb
language plpgsql immutable as $$
begin
    case jsonb_typeof(p_valeur)
        when 'string' then
            return to_jsonb(regexp_replace(p_valeur #>> '{}', '[^\n\r]', '·', 'g'));
        when 'array' then
            return coalesce(
                (select jsonb_agg(voiler_tout(t.element) order by t.rang)
                 from jsonb_array_elements(p_valeur) with ordinality as t(element, rang)),
                '[]'::jsonb
            );
        when 'object' then
            return coalesce(
                (select jsonb_object_agg(
                            t.cle,
                            case when t.cle = 'image' then t.valeur else voiler_tout(t.valeur) end
                        )
                 from jsonb_each(p_valeur) as t(cle, valeur)),
                '{}'::jsonb
            );
        else
            return p_valeur;
    end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- Voile les passages abîmés d'un contenu, mis à jour pour tous les gabarits.
--
-- « champ » est désormais le chemin d'une case : « texte », « articles.2.texte »,
-- « rubriques.0.titre »… Un passage enregistré sans « champ » vaut toujours « texte ».
--
-- Comme avant : chaque caractère d'un passage devient « · », la longueur ne change pas,
-- les retours à la ligne restent. Et un passage mal formé ne laisse rien passer : s'il ne
-- désigne pas un texte, ou si la liste n'en est pas une, tout le contenu est voilé.
-- ---------------------------------------------------------------------------
create or replace function voiler_passages(p_contenu jsonb, p_passages jsonb) returns jsonb
language plpgsql immutable as $$
declare
    v_contenu jsonb := p_contenu;
    v_passage jsonb;
    v_chemin  text[];
    v_case    jsonb;
    v_texte   text;
    v_debut   integer;
    v_fin     integer;
begin
    if p_passages is null or p_passages = '[]'::jsonb then
        return p_contenu;
    end if;
    if jsonb_typeof(p_passages) <> 'array' then
        return voiler_tout(p_contenu);
    end if;

    for v_passage in select * from jsonb_array_elements(p_passages) loop
        if jsonb_typeof(v_passage) <> 'object' then
            return voiler_tout(p_contenu);
        end if;

        v_chemin := string_to_array(coalesce(v_passage->>'champ', 'texte'), '.');
        v_case := v_contenu #> v_chemin;
        -- Une case qui n'existe pas dans ce contenu : il n'y a rien à voiler.
        continue when v_case is null or jsonb_typeof(v_case) = 'null';
        if jsonb_typeof(v_case) <> 'string' then
            return voiler_tout(p_contenu);
        end if;
        v_texte := v_case #>> '{}';

        if jsonb_typeof(v_passage->'debut') = 'number'
           and jsonb_typeof(v_passage->'fin') = 'number' then
            v_debut := greatest(floor((v_passage->>'debut')::numeric)::integer, 0);
            v_fin := least(ceil((v_passage->>'fin')::numeric)::integer, char_length(v_texte));
        else
            v_debut := 0;
            v_fin := char_length(v_texte);
        end if;
        continue when v_fin <= v_debut;

        v_texte := left(v_texte, v_debut)
            || regexp_replace(substr(v_texte, v_debut + 1, v_fin - v_debut), '[^\n\r]', '·', 'g')
            || substr(v_texte, v_fin + 1);
        v_contenu := jsonb_set(v_contenu, v_chemin, to_jsonb(v_texte));
    end loop;

    return v_contenu;
end;
$$;

-- ---------------------------------------------------------------------------
-- La porte des joueurs, mise à jour.
--
-- Mêmes colonnes, dans le même ordre. Une colonne s'ajoute en dernier, « sceau_image_id » :
-- l'image du sceau qui ferme le pli, s'il en a une. Comme le nom gravé, elle se voit avant
-- l'ouverture. L'ancienne colonne « sceau_image » reste, toujours vide.
-- ---------------------------------------------------------------------------
create or replace view plis_recus as
select
    e.id,
    e.destinataire_id,
    p.gabarit,
    p.envoye_le                                          as ecrit_le,
    e.livraison_le                                       as arrive_le,
    e.ouvert_le,
    e.dossier_id,
    voiler_passages(e.contenu, e.passages_abimes)        as contenu,
    e.ecriture_id,
    s.nom_grave                                          as sceau_nom,
    s.initiales                                          as sceau_initiales,
    s.image_url                                          as sceau_image,
    case
        when e.sceau_id is null then null
        when e.remarque_sceau then e.sceau_etat
        else 'intact'
    end                                                  as sceau_etat,
    case when e.signature_etat in ('intacte', 'contrefaite') then e.signature_nom end
                                                         as signature_nom,
    case
        when e.signature_etat not in ('intacte', 'contrefaite') then null
        when e.signature_etat = 'contrefaite' and e.remarque_signature then e.faussaire_ecriture_id
        else e.signature_ecriture_id
    end                                                  as signature_ecriture_id,
    case when e.remarque_texte then e.passages_reecrits else '[]'::jsonb end
                                                         as passages_reecrits,
    case when e.remarque_texte then e.faussaire_ecriture_id end
                                                         as reecriture_ecriture_id,
    e.passages_abimes,
    s.image_id                                           as sceau_image_id
from exemplaires e
join plis p on p.id = e.pli_id
left join sceaux s on s.id = e.sceau_id
where e.acheminement = 'en_route'
  and e.livraison_le <= now()
  and e.detruit_le is null;
