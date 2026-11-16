-- Le jeu de données des tests de confidentialité (tests/confidentialite.rs).
--
-- Il couvre chaque état d'un pli. Tout ce qu'Alix ne doit jamais recevoir porte un
-- marqueur en capitales, facile à chercher dans une réponse : BROUILLON-BERTRAND,
-- ORIGINAL-FILE, ADRESSE-LIBRE, EN-ROUTE, RETENU, PERDU, FERME (tant qu'il n'est pas ouvert),
-- ORIGINAL-SECRET, ORIGINAL-REDIRIGE, DETRUIT, BERTRAND-…, NOTES-MJ, INFO-SECRETE,
-- EVENEMENT-SECRET, POLICE-FAUSSAIRE, AUTEUR-CACHE, CLEMENCE-VISEE, ABIME-SECRET (le texte
-- d'un passage abîmé), CARTE-FERMEE (tant qu'elle n'est pas ouverte), ADRESSE-BLOB et
-- CHEMIN-BLOB (où sont rangées les images), et les adresses e-mail.
--
-- Identifiants : …b0 à b2 les comptes, …a1 à a5 les personnages, …c1 à c3 les sceaux,
-- …f1 et f2 les dossiers, …d0 à df les plis, …e1 à ed les exemplaires, …91 à 97 les images.

update reglages set calendrier_debut = (now() at time zone 'Europe/Paris')::date - 40;

insert into ecritures (id, nom, police) values
    ('00000000-0000-0000-0000-0000000000ef', 'Main du faussaire', 'POLICE-FAUSSAIRE');

insert into comptes (id, email, role) values
    ('00000000-0000-0000-0000-0000000000b0', 'mj@exemple.fr', 'mj'),
    ('00000000-0000-0000-0000-0000000000b1', 'alix@exemple.fr', 'joueur'),
    ('00000000-0000-0000-0000-0000000000b2', 'bertrand@exemple.fr', 'joueur');

insert into personnages (id, nom, genre, compte_id, ecriture_id, role, domaine, aptitudes,
                         objectifs, notes_mj) values
    ('00000000-0000-0000-0000-0000000000a1', 'Alix', 'joueur',
     '00000000-0000-0000-0000-0000000000b1', (select id from ecritures where police = 'caveat'),
     'Archiviste', 'Les registres', 'Lire entre les lignes', 'Retrouver le testament',
     'NOTES-MJ : Alix est la fille cachée du duc'),
    ('00000000-0000-0000-0000-0000000000a2', 'Bertrand', 'joueur',
     '00000000-0000-0000-0000-0000000000b2', (select id from ecritures where police = 'kalam'),
     'BERTRAND-FICHE', 'BERTRAND-DOMAINE', 'BERTRAND-APTITUDES', 'BERTRAND-OBJECTIFS',
     'NOTES-MJ : Bertrand trahira'),
    ('00000000-0000-0000-0000-0000000000a3', 'CLEMENCE-VISEE', 'pnj', null,
     (select id from ecritures where police = 'patrick-hand'), '', '', '', '', ''),
    ('00000000-0000-0000-0000-0000000000a4', 'AUTEUR-CACHE', 'pnj', null,
     (select id from ecritures where police = 'indie-flower'), '', '', '', '', 'NOTES-MJ'),
    ('00000000-0000-0000-0000-0000000000a5', 'Damien', 'pnj', null,
     (select id from ecritures where police = 'parisienne'), 'Notaire', '', '', '', '');

-- Les images. Leur adresse est remplacée par celle d'un faux stockage au début du test ;
-- ni elle ni le chemin ne doivent jamais sortir vers un joueur.
--   91 : la carte qu'Alix a ouverte (sa version livrée) ;
--   92 : une carte arrivée chez Alix, encore fermée ;
--   93 : la carte de Bertrand ;
--   94 : une carte encore en route vers Alix ;
--   95 : le sceau de Damien, qu'Alix voit sur ses plis ;
--   96 : le sceau de Bertrand, qu'Alix ne voit nulle part ;
--   97 : l'image d'origine de la carte d'Alix, remplacée par le MJ dans son exemplaire.
insert into images (id, chemin_blob, url_blob, type_mime, taille, largeur, hauteur)
select
    ('00000000-0000-0000-0000-0000000000' || n)::uuid,
    'images/CHEMIN-BLOB-' || n || '.png',
    'http://faux-stockage/fichiers/ADRESSE-BLOB-' || n,
    'image/png', 100, 10, 10
from unnest(array['91', '92', '93', '94', '95', '96', '97']) as n;

insert into sceaux (id, nom_grave, initiales, proprietaire_origine_id, detenteur_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'Alix', 'A',
     '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1'),
    -- Le sceau de Damien, volé par l'auteur caché : son détenteur ne doit jamais se voir.
    ('00000000-0000-0000-0000-0000000000c2', 'Damien', 'D',
     '00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a4'),
    ('00000000-0000-0000-0000-0000000000c3', 'BERTRAND-SCEAU', 'B',
     '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2');

insert into contacts (proprietaire_id, personnage_id, qualite) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'trésorier'),
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a5', 'notaire'),
    ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'BERTRAND-CARNET');

insert into dossiers (id, proprietaire_id, nom) values
    ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 'Archives'),
    ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a2', 'BERTRAND-DOSSIER');

insert into plis (id, auteur_id, gabarit, destinataire_genre, destinataire_id, destinataire_libre,
                  contenu, sceau_id, signe, etat, envoye_le, date_proposee) values
    -- Les brouillons.
    ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'billet',
     null, null, null, '{"texte":"BROUILLON-ALIX"}', null, false, 'brouillon', null, null),
    ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a2', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1', null,
     '{"texte":"BROUILLON-BERTRAND"}', null, false, 'brouillon', null, null),
    -- La lettre qu'Alix a envoyée : elle ne lui appartient plus.
    ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a1', 'billet',
     'libre', null, 'ADRESSE-LIBRE', '{"texte":"ORIGINAL-FILE"}', null, true, 'a_traiter',
     now() - interval '1 hour', now() + interval '1 day'),
    -- Le courrier pour Alix, de l'auteur caché.
    ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000a4', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1', null,
     '{"texte":"EN-ROUTE"}', null, false, 'traite', now() - interval '5 hours', now()),
    ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000a4', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1', null,
     '{"texte":"RETENU"}', null, false, 'traite', now() - interval '5 hours', now()),
    ('00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000000a4', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1', null,
     '{"texte":"PERDU"}', null, false, 'traite', now() - interval '5 hours', now()),
    ('00000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000000a4', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1', null,
     '{"texte":"FERME"}', '00000000-0000-0000-0000-0000000000c2', false, 'traite',
     now() - interval '5 hours', now()),
    -- Altéré : l'original diffère de la version livrée.
    ('00000000-0000-0000-0000-0000000000d8', '00000000-0000-0000-0000-0000000000a4', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1', null,
     '{"texte":"ORIGINAL-SECRET"}', '00000000-0000-0000-0000-0000000000c2', true, 'traite',
     now() - interval '5 hours', now()),
    -- Écrit pour Clémence, remis à Alix.
    ('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000a4', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a3', null,
     '{"texte":"ORIGINAL-REDIRIGE"}', null, false, 'traite', now() - interval '5 hours', now()),
    -- Pour Bertrand.
    ('00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-0000000000a5', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a2', null,
     '{"texte":"BERTRAND-PLI"}', null, false, 'traite', now() - interval '5 hours', now()),
    -- Reçu puis détruit par Alix.
    ('00000000-0000-0000-0000-0000000000db', '00000000-0000-0000-0000-0000000000a5', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1', null,
     '{"texte":"DETRUIT"}', null, false, 'traite', now() - interval '5 hours', now());

insert into exemplaires (id, pli_id, destinataire_id, origine, contenu, ecriture_id,
                         sceau_id, sceau_etat, signature_nom, signature_ecriture_id,
                         signature_personnage_id, signature_etat, passages_reecrits,
                         faussaire_ecriture_id, acheminement, livraison_le, ouvert_le,
                         dossier_id, detruit_le, notifie_le) values
    -- En route : arrive demain.
    ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d4',
     '00000000-0000-0000-0000-0000000000a1', 'destinataire', '{"texte":"EN-ROUTE"}',
     (select ecriture_id from personnages where id = '00000000-0000-0000-0000-0000000000a4'),
     null, null, null, null, null, 'absente', '[]', null,
     'en_route', now() + interval '1 day', null, null, null, null),
    -- Retenu et perdu, avec une date déjà passée : c'est l'acheminement qui les cache.
    ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d5',
     '00000000-0000-0000-0000-0000000000a1', 'destinataire', '{"texte":"RETENU"}',
     null, null, null, null, null, null, 'absente', '[]', null,
     'retenu', now() - interval '1 hour', null, null, null, null),
    ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d6',
     '00000000-0000-0000-0000-0000000000a1', 'destinataire', '{"texte":"PERDU"}',
     null, null, null, null, null, null, 'absente', '[]', null,
     'perdu', now() - interval '1 hour', null, null, null, null),
    -- Arrivé, encore fermé.
    ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000d7',
     '00000000-0000-0000-0000-0000000000a1', 'destinataire', '{"texte":"FERME"}',
     (select ecriture_id from personnages where id = '00000000-0000-0000-0000-0000000000a4'),
     '00000000-0000-0000-0000-0000000000c2', 'intact', null, null, null, 'absente', '[]', null,
     'en_route', now() - interval '2 hours', null, null, null, now()),
    -- Arrivé, ouvert, rangé. Sceau brisé, signature contrefaite et texte réécrit :
    -- rien n'est remarqué, tout doit paraître normal.
    ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000d8',
     '00000000-0000-0000-0000-0000000000a1', 'destinataire', '{"texte":"Version livrée, lisible."}',
     (select ecriture_id from personnages where id = '00000000-0000-0000-0000-0000000000a5'),
     '00000000-0000-0000-0000-0000000000c2', 'brise', 'Damien',
     (select ecriture_id from personnages where id = '00000000-0000-0000-0000-0000000000a5'),
     '00000000-0000-0000-0000-0000000000a5', 'contrefaite', '[{"debut":0,"fin":7}]',
     '00000000-0000-0000-0000-0000000000ef',
     'en_route', now() - interval '3 hours', now() - interval '1 hour',
     '00000000-0000-0000-0000-0000000000f1', null, now()),
    -- Redirigé vers Alix, arrivé, fermé.
    ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000d9',
     '00000000-0000-0000-0000-0000000000a1', 'redirection', '{"texte":"Une lettre égarée."}',
     (select ecriture_id from personnages where id = '00000000-0000-0000-0000-0000000000a4'),
     null, null, null, null, null, 'absente', '[]', null,
     'en_route', now() - interval '2 hours', null, null, null, now()),
    -- Celui de Bertrand.
    ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000da',
     '00000000-0000-0000-0000-0000000000a2', 'destinataire', '{"texte":"BERTRAND-PLI"}',
     null, null, null, null, null, null, 'absente', '[]', null,
     'en_route', now() - interval '2 hours', null, '00000000-0000-0000-0000-0000000000f2',
     null, now()),
    -- Détruit par Alix.
    ('00000000-0000-0000-0000-0000000000e8', '00000000-0000-0000-0000-0000000000db',
     '00000000-0000-0000-0000-0000000000a1', 'destinataire', '{"texte":"DETRUIT"}',
     null, null, null, null, null, null, 'absente', '[]', null,
     'en_route', now() - interval '2 hours', now() - interval '90 minutes', null,
     now() - interval '1 hour', now());

update sceaux set image_id = '00000000-0000-0000-0000-000000000095'
where id = '00000000-0000-0000-0000-0000000000c2';
update sceaux set image_id = '00000000-0000-0000-0000-000000000096'
where id = '00000000-0000-0000-0000-0000000000c3';

-- Les autres gabarits (étape 11) : des documents du MJ.
insert into plis (id, auteur_id, redige_par_mj, gabarit, destinataire_genre, destinataire_id,
                  contenu, etat, envoye_le, date_proposee) values
    -- Un rapport pour Alix, altéré : un passage abîmé dans sa seconde rubrique.
    ('00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-0000000000a4', true,
     'rapport', 'personnage', '00000000-0000-0000-0000-0000000000a1',
     '{"titre":"ORIGINAL-SECRET","auteur":"","rubriques":[{"titre":"Un","texte":"ORIGINAL-SECRET"},{"titre":"Deux","texte":"ORIGINAL-SECRET"}]}',
     'traite', now() - interval '5 hours', now()),
    -- Une carte pour Alix, ouverte. Le MJ a remplacé l'image dans son exemplaire.
    ('00000000-0000-0000-0000-0000000000dc', '00000000-0000-0000-0000-0000000000a4', true,
     'carte', 'personnage', '00000000-0000-0000-0000-0000000000a1',
     '{"image":"00000000-0000-0000-0000-000000000097","titre":"ORIGINAL-SECRET","legende":""}',
     'traite', now() - interval '5 hours', now()),
    -- Une carte pour Alix, arrivée, encore fermée.
    ('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000a4', true,
     'carte', 'personnage', '00000000-0000-0000-0000-0000000000a1',
     '{"image":"00000000-0000-0000-0000-000000000092","titre":"CARTE-FERMEE","legende":"CARTE-FERMEE"}',
     'traite', now() - interval '5 hours', now()),
    -- Une carte pour Bertrand.
    ('00000000-0000-0000-0000-0000000000de', '00000000-0000-0000-0000-0000000000a5', true,
     'carte', 'personnage', '00000000-0000-0000-0000-0000000000a2',
     '{"image":"00000000-0000-0000-0000-000000000093","titre":"BERTRAND-CARTE","legende":""}',
     'traite', now() - interval '5 hours', now()),
    -- Une carte encore en route vers Alix.
    ('00000000-0000-0000-0000-0000000000df', '00000000-0000-0000-0000-0000000000a4', true,
     'carte', 'personnage', '00000000-0000-0000-0000-0000000000a1',
     '{"image":"00000000-0000-0000-0000-000000000094","titre":"EN-ROUTE","legende":""}',
     'traite', now() - interval '5 hours', now());

insert into exemplaires (id, pli_id, destinataire_id, contenu, passages_abimes, acheminement,
                         livraison_le, ouvert_le, dossier_id, notifie_le) values
    ('00000000-0000-0000-0000-0000000000ed', '00000000-0000-0000-0000-0000000000d0',
     '00000000-0000-0000-0000-0000000000a1',
     '{"titre":"Rapport livré","auteur":"","rubriques":[{"titre":"Un","texte":"Texte lisible."},{"titre":"Deux","texte":"Avant ABIME-SECRET après"}]}',
     '[{"champ":"rubriques.1.texte","debut":6,"fin":18}]',
     'en_route', now() - interval '3 hours', now() - interval '1 hour',
     '00000000-0000-0000-0000-0000000000f1', now()),
    ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000dc',
     '00000000-0000-0000-0000-0000000000a1',
     '{"image":"00000000-0000-0000-0000-000000000091","titre":"Carte livrée","legende":"Une légende"}',
     '[]', 'en_route', now() - interval '3 hours', now() - interval '1 hour',
     '00000000-0000-0000-0000-0000000000f1', now()),
    ('00000000-0000-0000-0000-0000000000ea', '00000000-0000-0000-0000-0000000000dd',
     '00000000-0000-0000-0000-0000000000a1',
     '{"image":"00000000-0000-0000-0000-000000000092","titre":"CARTE-FERMEE","legende":"CARTE-FERMEE"}',
     '[]', 'en_route', now() - interval '2 hours', null, null, now()),
    ('00000000-0000-0000-0000-0000000000eb', '00000000-0000-0000-0000-0000000000de',
     '00000000-0000-0000-0000-0000000000a2',
     '{"image":"00000000-0000-0000-0000-000000000093","titre":"BERTRAND-CARTE","legende":""}',
     '[]', 'en_route', now() - interval '2 hours', now() - interval '1 hour', null, now()),
    ('00000000-0000-0000-0000-0000000000ec', '00000000-0000-0000-0000-0000000000df',
     '00000000-0000-0000-0000-0000000000a1',
     '{"image":"00000000-0000-0000-0000-000000000094","titre":"EN-ROUTE","legende":""}',
     '[]', 'en_route', now() + interval '1 day', null, null, null);

-- Le pli altéré a aussi un passage abîmé : on voit qu'il y avait du texte, on ne le lit
-- jamais. Son faussaire est un personnage, que personne ne doit pouvoir nommer.
update exemplaires
set contenu = '{"texte":"Version livrée, lisible. ABIME-SECRET"}',
    passages_abimes = '[{"champ":"texte","debut":25,"fin":37}]',
    faussaire_personnage_id = '00000000-0000-0000-0000-0000000000a4'
where id = '00000000-0000-0000-0000-0000000000e5';

insert into informations (id, intitule, notes) values
    ('00000000-0000-0000-0000-000000000099', 'INFO-SECRETE', 'INFO-SECRETE : le testament est faux');
insert into pli_informations (pli_id, information_id) values
    ('00000000-0000-0000-0000-0000000000d8', '00000000-0000-0000-0000-000000000099');

insert into evenements (pli_id, exemplaire_id, compte_id, genre, details) values
    ('00000000-0000-0000-0000-0000000000d8', '00000000-0000-0000-0000-0000000000e5',
     '00000000-0000-0000-0000-0000000000b0', 'traitement', '{"note":"EVENEMENT-SECRET"}'),
    ('00000000-0000-0000-0000-0000000000d8', '00000000-0000-0000-0000-0000000000e5',
     '00000000-0000-0000-0000-0000000000b0', 'alteration',
     '{"avant":{"texte":"ORIGINAL-SECRET"},"apres":{"texte":"Version livrée, lisible. ABIME-SECRET"}}');

insert into preferences_notification (compte_id, email_arrivee, choisi_le) values
    ('00000000-0000-0000-0000-0000000000b1', true, now()),
    ('00000000-0000-0000-0000-0000000000b2', true, now());
insert into abonnements_navigateur (compte_id, endpoint, cle_p256dh, cle_auth) values
    ('00000000-0000-0000-0000-0000000000b2', 'https://push.exemple/BERTRAND-ABONNEMENT',
     'BERTRAND-CLE', 'BERTRAND-AUTH');

-- Les sessions : la base n'en garde que l'empreinte (sha256 du jeton, en hexadécimal).
insert into sessions (compte_id, jeton_hash, expire_le) values
    ('00000000-0000-0000-0000-0000000000b0', encode(sha256('jeton-mj'::bytea), 'hex'), now() + interval '1 day'),
    ('00000000-0000-0000-0000-0000000000b1', encode(sha256('jeton-alix'::bytea), 'hex'), now() + interval '1 day'),
    ('00000000-0000-0000-0000-0000000000b2', encode(sha256('jeton-bertrand'::bytea), 'hex'), now() + interval '1 day');
