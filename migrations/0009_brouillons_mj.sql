-- Les brouillons et les modèles du MJ.
--
-- Un brouillon du MJ est un document qu'il n'a pas encore envoyé : tout ce que l'écran
-- Documents permet de choisir, rangé tel quel, même incomplet. Ce n'est pas encore un pli :
-- il ne vit pas dans `plis`, et rien n'en sort vers un joueur. À l'envoi, il devient un pli
-- par `rediger`, et le brouillon disparaît dans le même geste.
--
-- La réponse d'un PNJ écrite sous une lettre de la file est un brouillon comme les autres,
-- rattaché à cette lettre par `reponse_a`. Quand la lettre quitte la file sans que la
-- réponse soit partie, le rattachement est défait : la réponse reste un brouillon ordinaire.
--
-- Un modèle est un document de départ, nommé par le MJ : sans destinataires ni dates.
-- Partir d'un modèle crée un brouillon ; le modèle ne change pas.
--
-- Rien n'est supprimé ici : deux tables nouvelles.

create table brouillons_mj (
    id                uuid primary key default gen_random_uuid(),
    -- La lettre de la file à laquelle ce brouillon répond. Vide : un document ordinaire.
    reponse_a         uuid unique references plis (id),
    -- Le PNJ au nom de qui le MJ écrit. Un PNJ supprimé laisse un brouillon sans expéditeur choisi.
    auteur_id         uuid references personnages (id) on delete set null,
    sans_expediteur   boolean not null default false,
    gabarit           text not null default 'billet'
        check (gabarit in ('billet', 'lettre_longue', 'gazette', 'acte', 'rapport', 'carte')),
    -- Les cases du gabarit, même vides.
    contenu           jsonb not null default '{}',
    signe             boolean not null default true,
    sceau_id          uuid references sceaux (id) on delete set null,
    ecriture_id       uuid references ecritures (id) on delete set null,
    -- [{ "personnage_id": …, "livraison_le": … | null }]. Un personnage supprimé depuis
    -- est retiré à la relecture.
    destinataires     jsonb not null default '[]',
    -- La date d'arrivée commune. Vide : le délai habituel, plus ou moins le hasard.
    livraison_commune timestamptz,
    cree_le           timestamptz not null default now(),
    modifie_le        timestamptz not null default now()
);

create table modeles (
    id              uuid primary key default gen_random_uuid(),
    nom             text not null,
    auteur_id       uuid references personnages (id) on delete set null,
    sans_expediteur boolean not null default false,
    gabarit         text not null default 'billet'
        check (gabarit in ('billet', 'lettre_longue', 'gazette', 'acte', 'rapport', 'carte')),
    contenu         jsonb not null default '{}',
    signe           boolean not null default true,
    sceau_id        uuid references sceaux (id) on delete set null,
    ecriture_id     uuid references ecritures (id) on delete set null,
    cree_le         timestamptz not null default now(),
    modifie_le      timestamptz not null default now()
);

-- Deux modèles ne portent pas le même nom : enregistrer sous un nom déjà pris remplace.
create unique index modeles_nom on modeles (lower(nom));
