-- Structure de départ : toutes les tables du tableau « Données » de DECISIONS.md.
--
-- Règles tenues par cette structure :
--   * un pli est écrit une fois, chaque destinataire a son exemplaire ;
--   * l'original (plis) et la version livrée (exemplaires) sont séparés ;
--   * rien ne supprime un pli par ricochet : les références vers plis sont « restrict » ;
--   * ce qu'un joueur a le droit de voir passe par la vue plis_recus, en bas de ce fichier.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Comptes : une adresse e-mail, MJ ou joueur. Rien d'autre n'est stocké.
-- ---------------------------------------------------------------------------
create table comptes (
    id       uuid primary key default gen_random_uuid(),
    email    citext not null unique,
    role     text not null check (role in ('mj', 'joueur')),
    cree_le  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Écritures : une police manuscrite.
-- ---------------------------------------------------------------------------
create table ecritures (
    id         uuid primary key default gen_random_uuid(),
    nom        text not null unique,
    -- Le nom de la police, que le thème sait afficher.
    police     text not null,
    -- Une écriture générique peut servir à plusieurs PNJ secondaires.
    generique  boolean not null default false,
    cree_le    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Personnages : ceux des joueurs et les PNJ (institutions comprises).
-- ---------------------------------------------------------------------------
create table personnages (
    id           uuid primary key default gen_random_uuid(),
    nom          text not null,
    genre        text not null check (genre in ('joueur', 'pnj')),
    -- Un joueur, un personnage. Un PNJ n'a jamais de compte.
    compte_id    uuid unique references comptes (id) on delete restrict,
    ecriture_id  uuid references ecritures (id) on delete restrict,
    -- La fiche, en texte libre. Visible du joueur concerné.
    role         text not null default '',
    domaine      text not null default '',
    aptitudes    text not null default '',
    objectifs    text not null default '',
    -- Visible du seul MJ.
    notes_mj     text not null default '',
    -- Quota propre à ce personnage. Vide : le réglage général s'applique.
    quota_hebdo  integer check (quota_hebdo >= 0),
    cree_le      timestamptz not null default now(),
    check (genre = 'joueur' or compte_id is null)
);

-- Deux joueurs ne partagent jamais la même écriture.
create unique index personnages_ecriture_de_joueur
    on personnages (ecriture_id)
    where genre = 'joueur';

-- ---------------------------------------------------------------------------
-- Sceaux : des objets possédés, que le MJ attribue, retire ou transfère.
-- ---------------------------------------------------------------------------
create table sceaux (
    id                     uuid primary key default gen_random_uuid(),
    -- Le nom gravé reste celui du propriétaire d'origine, même si le sceau est volé.
    nom_grave              text not null,
    initiales              text not null default '',
    -- Vide : le sceau est généré à partir des initiales.
    image_url              text,
    proprietaire_origine_id uuid references personnages (id) on delete set null,
    detenteur_id           uuid references personnages (id) on delete set null,
    cree_le                timestamptz not null default now()
);

create index sceaux_detenteur on sceaux (detenteur_id);

-- ---------------------------------------------------------------------------
-- Carnets d'adresses : chacun ne sait que ce qu'on lui a dit.
-- ---------------------------------------------------------------------------
create table contacts (
    id              uuid primary key default gen_random_uuid(),
    proprietaire_id uuid not null references personnages (id) on delete cascade,
    personnage_id   uuid not null references personnages (id) on delete cascade,
    -- « Bertrand, trésorier » : la qualité telle que ce joueur la connaît.
    qualite         text,
    -- Comment le contact est entré dans le carnet.
    origine         text not null default 'mj' check (origine in ('mj', 'sceau', 'signature')),
    cree_le         timestamptz not null default now(),
    unique (proprietaire_id, personnage_id),
    check (proprietaire_id <> personnage_id)
);

-- ---------------------------------------------------------------------------
-- Dossiers du joueur. La Réception n'est pas une ligne : c'est l'absence de dossier.
-- ---------------------------------------------------------------------------
create table dossiers (
    id              uuid primary key default gen_random_uuid(),
    proprietaire_id uuid not null references personnages (id) on delete cascade,
    nom             text not null,
    rang            integer not null default 0,
    cree_le         timestamptz not null default now(),
    unique (proprietaire_id, nom)
);

-- ---------------------------------------------------------------------------
-- Plis : ce qui a été écrit, dans sa version originale. Visible du seul MJ.
-- ---------------------------------------------------------------------------
create table plis (
    id                  uuid primary key default gen_random_uuid(),
    -- L'auteur réel. Pour un document du MJ : le PNJ ou l'institution au nom de qui il écrit.
    auteur_id           uuid references personnages (id) on delete restrict,
    redige_par_mj       boolean not null default false,
    gabarit             text not null
        check (gabarit in ('billet', 'lettre_longue', 'gazette', 'acte', 'rapport', 'carte')),
    -- Le destinataire visé par l'auteur. Le MJ en fait ce qu'il veut.
    destinataire_genre  text check (destinataire_genre in ('personnage', 'gazette', 'libre')),
    destinataire_id     uuid references personnages (id) on delete restrict,
    destinataire_libre  text,
    -- Les cases du gabarit, version originale.
    contenu             jsonb not null default '{}',
    -- Le sceau apposé par l'auteur, s'il a scellé.
    sceau_id            uuid references sceaux (id) on delete restrict,
    signe               boolean not null default false,
    etat                text not null default 'brouillon'
        check (etat in ('brouillon', 'a_traiter', 'traite', 'ecarte')),
    envoye_le           timestamptz,
    -- La date de livraison que le site propose au MJ.
    date_proposee       timestamptz,
    cree_le             timestamptz not null default now(),
    modifie_le          timestamptz not null default now(),
    check ((etat = 'brouillon') = (envoye_le is null)),
    -- Un personnage a son identifiant, une adresse libre a son texte, la gazette n'a ni l'un
    -- ni l'autre. Sans genre (brouillon sans destinataire, document du MJ) : rien non plus.
    check (
        (destinataire_genre = 'personnage'
            and destinataire_id is not null and destinataire_libre is null)
        or (destinataire_genre = 'libre'
            and destinataire_libre is not null and destinataire_id is null)
        or (coalesce(destinataire_genre, 'gazette') = 'gazette'
            and destinataire_id is null and destinataire_libre is null)
    )
);

-- Le quota : les envois d'un auteur depuis lundi.
create index plis_auteur_envoi on plis (auteur_id, envoye_le);
-- La file du MJ.
create index plis_etat on plis (etat, envoye_le);

-- ---------------------------------------------------------------------------
-- Exemplaires : ce que reçoit un destinataire précis, dans sa version livrée.
-- ---------------------------------------------------------------------------
create table exemplaires (
    id                      uuid primary key default gen_random_uuid(),
    pli_id                  uuid not null references plis (id) on delete restrict,
    destinataire_id         uuid not null references personnages (id) on delete restrict,
    -- Pourquoi cet exemplaire existe.
    origine                 text not null default 'destinataire'
        check (origine in ('destinataire', 'redirection', 'copie')),

    -- La version livrée, telle qu'elle paraît si rien n'est remarqué.
    contenu                 jsonb not null default '{}',
    ecriture_id             uuid references ecritures (id) on delete restrict,
    sceau_id                uuid references sceaux (id) on delete restrict,
    signature_nom           text,
    signature_ecriture_id   uuid references ecritures (id) on delete restrict,

    -- Ce que le MJ a fait. Le destinataire ne le voit que s'il le remarque.
    sceau_etat              text check (sceau_etat in ('intact', 'brise', 'recolle', 'contrefait')),
    signature_etat          text not null default 'absente'
        check (signature_etat in ('absente', 'intacte', 'retiree', 'contrefaite')),
    -- Les passages réécrits, repérés par le site.
    passages_reecrits       jsonb not null default '[]',
    faussaire_ecriture_id   uuid references ecritures (id) on delete restrict,

    -- Ce que ce destinataire remarque. Par défaut : rien.
    remarque_texte          boolean not null default false,
    remarque_sceau          boolean not null default false,
    remarque_signature      boolean not null default false,

    -- L'acheminement. « Livré » n'est pas un état : c'est en_route avec une date passée.
    acheminement            text not null default 'en_route'
        check (acheminement in ('en_route', 'retenu', 'perdu')),
    livraison_le            timestamptz,
    ouvert_le               timestamptz,
    -- Vide : l'exemplaire est dans la Réception.
    dossier_id              uuid references dossiers (id) on delete set null,

    cree_le                 timestamptz not null default now(),
    modifie_le              timestamptz not null default now(),
    check ((sceau_id is null) = (sceau_etat is null)),
    check (acheminement <> 'en_route' or livraison_le is not null)
);

create index exemplaires_pli on exemplaires (pli_id);
-- La Réception d'un personnage, par ordre d'arrivée.
create index exemplaires_reception on exemplaires (destinataire_id, livraison_le);

-- ---------------------------------------------------------------------------
-- Gazette : des numéros composés par le MJ.
-- ---------------------------------------------------------------------------
create table numeros_gazette (
    id          uuid primary key default gen_random_uuid(),
    numero      integer not null unique,
    titre       text not null default '',
    speciale    boolean not null default false,
    -- Les articles, nouvelles et annonces du MJ.
    articles    jsonb not null default '[]',
    parution_le timestamptz,
    -- Une fois paru, le numéro est un pli comme les autres, avec un exemplaire par joueur.
    pli_id      uuid unique references plis (id) on delete restrict,
    cree_le     timestamptz not null default now()
);

-- Les lettres de joueurs retenues dans un numéro, telles que publiées.
create table lettres_gazette (
    numero_id         uuid not null references numeros_gazette (id) on delete cascade,
    pli_id            uuid not null references plis (id) on delete restrict,
    rang              integer not null default 0,
    texte_publie      text not null,
    -- Un simple nom, ou vide pour « anonyme ».
    signature_publiee text,
    primary key (numero_id, pli_id)
);

-- ---------------------------------------------------------------------------
-- Informations étiquetées : ce que le MJ suit à travers les plis.
-- ---------------------------------------------------------------------------
create table informations (
    id        uuid primary key default gen_random_uuid(),
    intitule  text not null,
    notes     text not null default '',
    cree_le   timestamptz not null default now()
);

create table pli_informations (
    pli_id         uuid not null references plis (id) on delete restrict,
    information_id uuid not null references informations (id) on delete cascade,
    primary key (pli_id, information_id)
);

-- ---------------------------------------------------------------------------
-- Historique : tout ce qui arrive à un pli. Rien n'y est jamais effacé.
-- ---------------------------------------------------------------------------
create table evenements (
    id            bigint generated always as identity primary key,
    pli_id        uuid not null references plis (id) on delete restrict,
    exemplaire_id uuid references exemplaires (id) on delete restrict,
    compte_id     uuid references comptes (id) on delete set null,
    genre         text not null,
    details       jsonb not null default '{}',
    cree_le       timestamptz not null default now()
);

create index evenements_pli on evenements (pli_id, cree_le);

-- ---------------------------------------------------------------------------
-- Réglages : une seule ligne. Les joueurs n'en voient que les effets.
-- ---------------------------------------------------------------------------
create table reglages (
    id                boolean primary key default true check (id),
    longueur_billet   integer not null default 500 check (longueur_billet > 0),
    quota_hebdo       integer not null default 3 check (quota_hebdo >= 0),
    -- Délai de livraison par défaut, et part de hasard autour de ce délai.
    delai_minutes     integer not null default 1440 check (delai_minutes >= 0),
    hasard_minutes    integer not null default 240 check (hasard_minutes >= 0),
    fuseau            text not null default 'Europe/Paris',
    -- Le calendrier du jeu : le jour réel qui vaut « jour 1 », et les bonds décidés par le MJ.
    calendrier_debut  date not null default current_date,
    calendrier_bonds  integer not null default 0,
    modifie_le        timestamptz not null default now()
);

insert into reglages default values;

-- ---------------------------------------------------------------------------
-- La porte des joueurs.
--
-- Tout ce que le site montre à un joueur de son courrier vient de cette vue, jamais
-- des tables. Elle ne contient que les exemplaires livrés, et que ce qui se voit :
--   * pas d'original, pas d'auteur réel ;
--   * pas de date prévue : un exemplaire n'apparaît qu'une fois arrivé ;
--   * une altération n'apparaît que si elle est remarquée.
-- ---------------------------------------------------------------------------
create view plis_recus as
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
    -- Le sceau se voit avant l'ouverture, avec le nom de son propriétaire d'origine.
    -- Son détenteur actuel, lui, ne sort jamais d'ici.
    s.nom_grave                                          as sceau_nom,
    s.initiales                                          as sceau_initiales,
    s.image_url                                          as sceau_image,
    -- Un sceau trafiqué paraît intact tant que ce n'est pas remarqué.
    case
        when e.sceau_id is null then null
        when e.remarque_sceau then e.sceau_etat
        else 'intact'
    end                                                  as sceau_etat,
    -- Une signature retirée ne se voit pas : il n'y a simplement pas de signature.
    case when e.signature_etat in ('intacte', 'contrefaite') then e.signature_nom end
                                                         as signature_nom,
    -- Une signature contrefaite et remarquée paraît dans la main du faussaire.
    case
        when e.signature_etat not in ('intacte', 'contrefaite') then null
        when e.signature_etat = 'contrefaite' and e.remarque_signature then e.faussaire_ecriture_id
        else e.signature_ecriture_id
    end                                                  as signature_ecriture_id,
    -- Les passages réécrits ne sont transmis que s'ils sont remarqués.
    case when e.remarque_texte then e.passages_reecrits else '[]'::jsonb end
                                                         as passages_reecrits,
    case when e.remarque_texte then e.faussaire_ecriture_id end
                                                         as reecriture_ecriture_id
from exemplaires e
join plis p on p.id = e.pli_id
left join sceaux s on s.id = e.sceau_id
where e.acheminement = 'en_route'
  and e.livraison_le <= now();
