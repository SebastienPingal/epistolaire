-- Connexion par e-mail : un lien et un code à 6 chiffres, puis une session de plusieurs mois.
-- Ni le code, ni le lien, ni la session ne sont rangés en clair : la base n'en garde
-- qu'une empreinte, inutilisable par qui la lirait.

-- Une demande de connexion : elle porte à la fois le code et le lien du même e-mail.
create table demandes_connexion (
    id            uuid primary key default gen_random_uuid(),
    compte_id     uuid not null references comptes (id) on delete cascade,
    code_hash     text not null,
    lien_hash     text not null unique,
    -- Nombre de codes faux essayés sur cette demande.
    essais        integer not null default 0,
    expire_le     timestamptz not null,
    utilisee_le   timestamptz,
    cree_le       timestamptz not null default now()
);

create index demandes_connexion_compte on demandes_connexion (compte_id, cree_le);

create table sessions (
    id          uuid primary key default gen_random_uuid(),
    compte_id   uuid not null references comptes (id) on delete cascade,
    jeton_hash  text not null unique,
    expire_le   timestamptz not null,
    vue_le      timestamptz not null default now(),
    cree_le     timestamptz not null default now()
);

create index sessions_compte on sessions (compte_id);
