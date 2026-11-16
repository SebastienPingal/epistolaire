-- Étape 10 : les altérations.
--
--   * les passages abîmés d'un exemplaire, toujours visibles du destinataire, jamais lisibles ;
--   * qui a falsifié : un personnage, ou personne de connu (une main inconnue) ;
--   * la porte des joueurs voile les passages abîmés avant de laisser sortir le texte.
--
-- Rien n'est supprimé ni déplacé : deux colonnes s'ajoutent, avec une valeur par défaut qui
-- laisse les plis en route tels qu'ils sont.

-- ---------------------------------------------------------------------------
-- Les passages abîmés de la version livrée.
--
-- Le format d'un passage est le même partout (passages réécrits compris) :
--   { "champ": "texte", "debut": 12, "fin": 30 }
-- « debut » et « fin » comptent les caractères (pas les octets), « fin » exclue.
-- « champ » nomme la case du gabarit. Un passage enregistré sans « champ » vaut « texte ».
-- ---------------------------------------------------------------------------
alter table exemplaires
    add column passages_abimes jsonb not null default '[]';

-- Qui a falsifié. Visible du seul MJ. Vide : personne, ou une main inconnue.
-- L'écriture du faussaire, elle, reste dans faussaire_ecriture_id : c'est la sienne s'il
-- est désigné ici, ou celle que le MJ a choisie pour une main inconnue.
alter table exemplaires
    add column faussaire_personnage_id uuid references personnages (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- Voile les passages abîmés d'un contenu : chaque caractère d'un passage devient « · ».
-- La longueur ne change pas, pour que les positions des autres passages restent justes,
-- et les retours à la ligne restent, pour que la lettre garde sa forme.
--
-- Un passage mal formé ne laisse rien passer : toute la case est voilée.
-- ---------------------------------------------------------------------------
create function voiler_passages(p_contenu jsonb, p_passages jsonb) returns jsonb
language plpgsql immutable as $$
declare
    v_contenu jsonb := p_contenu;
    v_passage jsonb;
    v_champ   text;
    v_texte   text;
    v_debut   integer;
    v_fin     integer;
begin
    if p_passages is null or p_passages = '[]'::jsonb then
        return p_contenu;
    end if;
    if jsonb_typeof(p_passages) <> 'array' then
        return jsonb_set(
            p_contenu, '{texte}',
            to_jsonb(regexp_replace(coalesce(p_contenu->>'texte', ''), '[^\n\r]', '·', 'g'))
        );
    end if;

    for v_passage in select * from jsonb_array_elements(p_passages) loop
        v_champ := coalesce(v_passage->>'champ', 'texte');
        v_texte := v_contenu->>v_champ;
        continue when v_texte is null;

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
        v_contenu := jsonb_set(v_contenu, array[v_champ], to_jsonb(v_texte));
    end loop;

    return v_contenu;
end;
$$;

-- ---------------------------------------------------------------------------
-- La porte des joueurs, mise à jour.
--
-- Mêmes colonnes, dans le même ordre. Deux changements :
--   * « contenu » sort voilé : le texte d'un passage abîmé ne quitte jamais la base par ici ;
--   * une colonne s'ajoute en dernier, « passages_abimes » : où sont les taches. Elle est
--     toujours transmise, que l'altération soit remarquée ou non.
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
    e.passages_abimes
from exemplaires e
join plis p on p.id = e.pli_id
left join sceaux s on s.id = e.sceau_id
where e.acheminement = 'en_route'
  and e.livraison_le <= now()
  and e.detruit_le is null;
