-- Étape 7 : le joueur reçoit.
--
--   * qui signe un exemplaire, pour enrichir le carnet à l'ouverture ;
--   * la destruction d'un pli par son destinataire : le pli disparaît pour lui, jamais de la base ;
--   * les bonds dans le temps, datés : chacun compte à partir de son jour ;
--   * les gestes du joueur sur son courrier, sous forme de fonctions : la porte des joueurs
--     ne touche jamais la table exemplaires.

-- ---------------------------------------------------------------------------
-- Qui signe. Visible du seul MJ : la vue plis_recus n'en montre que le nom.
-- À l'étape 10, une signature contrefaite désignera ici la personne imitée.
-- ---------------------------------------------------------------------------
alter table exemplaires
    add column signature_personnage_id uuid references personnages (id) on delete restrict;

update exemplaires x
set signature_personnage_id = p.auteur_id
from plis p
where p.id = x.pli_id
  and x.signature_etat = 'intacte';

-- ---------------------------------------------------------------------------
-- La destruction. Un joueur peut détruire un pli reçu, un par un ou en supprimant
-- un dossier. Le pli sort de sa vue, mais la base le garde, et le MJ le voit encore.
-- ---------------------------------------------------------------------------
alter table exemplaires
    add column detruit_le timestamptz;

create index exemplaires_detruits on exemplaires (detruit_le) where detruit_le is not null;

-- ---------------------------------------------------------------------------
-- Les bonds dans le temps. Un bond ne change que les jours à partir de sa date :
-- un pli reçu avant garde la date qu'il avait.
--
-- La colonne reglages.calendrier_bonds (un total unique, qui décalait aussi les dates
-- passées) est remplacée par cette table. Elle est gardée, car on ne supprime pas
-- de colonne, mais le site ne la lit plus.
-- ---------------------------------------------------------------------------
create table bonds_calendrier (
    id           uuid primary key default gen_random_uuid(),
    -- Le jour réel à partir duquel le bond compte.
    a_partir_du  date not null,
    jours        integer not null check (jours <> 0),
    note         text not null default '',
    cree_le      timestamptz not null default now()
);

insert into bonds_calendrier (a_partir_du, jours, note)
select calendrier_debut, calendrier_bonds, 'Repris de l''ancien réglage'
from reglages
where calendrier_bonds <> 0;

comment on column reglages.calendrier_bonds is
    'Remplacée par la table bonds_calendrier (migration 0005). Gardée, mais plus lue.';

-- ---------------------------------------------------------------------------
-- La porte des joueurs, mise à jour : un pli détruit n'y est plus.
-- Mêmes colonnes, dans le même ordre ; seul le filtre change.
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
    e.contenu,
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
                                                         as reecriture_ecriture_id
from exemplaires e
join plis p on p.id = e.pli_id
left join sceaux s on s.id = e.sceau_id
where e.acheminement = 'en_route'
  and e.livraison_le <= now()
  and e.detruit_le is null;

-- ---------------------------------------------------------------------------
-- Les gestes du joueur sur son courrier.
--
-- Chacune de ces fonctions vérifie d'abord, par la vue plis_recus, que le pli est arrivé,
-- qu'il n'est pas détruit, et qu'il est bien à ce destinataire. Sinon elle renvoie false
-- et ne change rien.
-- ---------------------------------------------------------------------------

-- Ouvre un pli. À la première ouverture seulement, le carnet s'enrichit du propriétaire
-- d'origine du sceau et de la personne qui signe, s'il ne les connaît pas déjà.
create function ouvrir_pli(p_exemplaire uuid, p_destinataire uuid) returns boolean
language plpgsql as $$
begin
    if not exists (
        select 1 from plis_recus where id = p_exemplaire and destinataire_id = p_destinataire
    ) then
        return false;
    end if;

    -- Deux ouvertures simultanées : la seconde attend la première, puis ne trouve plus rien.
    update exemplaires set ouvert_le = now()
    where id = p_exemplaire and ouvert_le is null;

    if found then
        insert into contacts (proprietaire_id, personnage_id, origine)
        select p_destinataire, s.proprietaire_origine_id, 'sceau'
        from exemplaires x
        join sceaux s on s.id = x.sceau_id
        where x.id = p_exemplaire
          and s.proprietaire_origine_id is not null
          and s.proprietaire_origine_id <> p_destinataire
        on conflict do nothing;

        insert into contacts (proprietaire_id, personnage_id, origine)
        select p_destinataire, x.signature_personnage_id, 'signature'
        from exemplaires x
        where x.id = p_exemplaire
          and x.signature_etat in ('intacte', 'contrefaite')
          and x.signature_personnage_id is not null
          and x.signature_personnage_id <> p_destinataire
        on conflict do nothing;
    end if;

    return true;
end;
$$;

-- Range un pli dans un dossier de ce joueur, ou dans la Réception (dossier vide).
create function ranger_pli(p_exemplaire uuid, p_destinataire uuid, p_dossier uuid)
returns boolean
language plpgsql as $$
begin
    if not exists (
        select 1 from plis_recus where id = p_exemplaire and destinataire_id = p_destinataire
    ) then
        return false;
    end if;

    if p_dossier is not null and not exists (
        select 1 from dossiers where id = p_dossier and proprietaire_id = p_destinataire
    ) then
        return false;
    end if;

    update exemplaires set dossier_id = p_dossier where id = p_exemplaire;
    return true;
end;
$$;

-- Détruit un pli pour son destinataire. Il sort de la vue plis_recus, mais reste dans
-- la base, et l'historique du pli garde la trace du geste.
create function detruire_pli(p_exemplaire uuid, p_destinataire uuid) returns boolean
language plpgsql as $$
declare
    v_pli     uuid;
    v_dossier uuid;
    v_ouvert  boolean;
begin
    if not exists (
        select 1 from plis_recus where id = p_exemplaire and destinataire_id = p_destinataire
    ) then
        return false;
    end if;

    -- Deux destructions simultanées : la seconde attend la première, puis ne trouve plus rien.
    select pli_id, dossier_id, ouvert_le is not null
    into v_pli, v_dossier, v_ouvert
    from exemplaires
    where id = p_exemplaire and detruit_le is null
    for update;

    if not found then
        return false;
    end if;

    insert into evenements (pli_id, exemplaire_id, compte_id, genre, details)
    select v_pli, p_exemplaire, d.compte_id, 'destruction',
           jsonb_build_object(
               'dossier', (select nom from dossiers where id = v_dossier),
               'ouvert', v_ouvert
           )
    from personnages d
    where d.id = p_destinataire;

    update exemplaires set detruit_le = now(), dossier_id = null
    where id = p_exemplaire;
    return true;
end;
$$;
