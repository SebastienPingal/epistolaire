-- Étape 8 : les notifications.
--
-- Une tâche planifiée passe régulièrement et prévient de ce qui est arrivé depuis son
-- dernier passage. Ces colonnes et ces tables ne vont jamais dans la vue plis_recus :
-- un joueur ne sait pas quand on l'a prévenu.

-- Les choix de chaque compte. Sans ligne, ou choisi_le vide : le choix n'a pas encore été fait.
create table preferences_notification (
    compte_id      uuid primary key references comptes (id) on delete cascade,
    -- Prévenir sur les navigateurs abonnés de ce compte.
    navigateur     boolean not null default false,
    -- Un e-mail à chaque arrivée (pour le MJ : à chaque nouvelle lettre ou alerte).
    email_arrivee  boolean not null default false,
    -- Un e-mail de rappel quand un pli reste fermé plus de rappel_heures.
    email_rappel   boolean not null default false,
    rappel_heures  integer not null default 24 check (rappel_heures between 1 and 168),
    choisi_le      timestamptz
);

-- Les navigateurs abonnés aux notifications. Un compte peut en avoir plusieurs :
-- téléphone, ordinateur.
create table abonnements_navigateur (
    id          uuid primary key default gen_random_uuid(),
    compte_id   uuid not null references comptes (id) on delete cascade,
    -- L'adresse du service de notifications du navigateur, à qui l'on remet le message.
    endpoint    text not null unique,
    -- Les clés du navigateur, pour chiffrer le message (RFC 8291).
    cle_p256dh  text not null,
    cle_auth    text not null,
    cree_le     timestamptz not null default now()
);

create index abonnements_compte on abonnements_navigateur (compte_id);

-- Ce qui a déjà été signalé, pour ne jamais prévenir deux fois.
alter table exemplaires
    add column notifie_le timestamptz,
    add column rappele_le timestamptz;

alter table plis
    add column mj_prevenu_le timestamptz,
    add column mj_alerte_le  timestamptz;

-- Ce qui reste à signaler, pour que la tâche le trouve vite.
create index exemplaires_a_signaler on exemplaires (livraison_le)
    where notifie_le is null and acheminement = 'en_route';

-- Tout ce qui existe déjà est considéré comme signalé : la première tâche ne doit pas
-- envoyer tout l'historique d'un coup.
update exemplaires
set notifie_le = now()
where acheminement = 'en_route' and livraison_le <= now();

update plis
set mj_prevenu_le = now()
where etat = 'a_traiter';

update plis
set mj_alerte_le = now()
where etat = 'a_traiter' and date_proposee <= now() + interval '2 hours';
