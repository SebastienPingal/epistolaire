-- Trois joueurs, un PNJ, et du courrier posé directement : arrivé, en route, retenu, perdu.
-- Le calendrier du jeu a commencé il y a 40 jours (à Paris) : aujourd'hui est le
-- « 10e jour du 2e mois, an 1 ».
update reglages set calendrier_debut = (now() at time zone 'Europe/Paris')::date - 40;

insert into comptes (id, email, role) values
    ('00000000-0000-0000-0000-00000000000a', 'alix@exemple.fr', 'joueur'),
    ('00000000-0000-0000-0000-00000000000b', 'bertrand@exemple.fr', 'joueur'),
    ('00000000-0000-0000-0000-00000000000c', 'clemence@exemple.fr', 'joueur');
insert into personnages (id, nom, genre, compte_id, ecriture_id, role) values
    ('00000000-0000-0000-0000-0000000000a1', 'Alix de Montfort', 'joueur',
     '00000000-0000-0000-0000-00000000000a', (select id from ecritures where police = 'caveat'),
     'Trésorière du duché'),
    ('00000000-0000-0000-0000-0000000000a2', 'Bertrand Lenoir', 'joueur',
     '00000000-0000-0000-0000-00000000000b', (select id from ecritures where police = 'kalam'),
     'Intendant'),
    ('00000000-0000-0000-0000-0000000000a4', 'Clémence Hardy', 'joueur',
     '00000000-0000-0000-0000-00000000000c', (select id from ecritures where police = 'patrick-hand'),
     'Capitaine de la garde'),
    ('00000000-0000-0000-0000-0000000000a5', 'Le Chancelier', 'pnj', null,
     (select id from ecritures where police = 'parisienne'), 'Chancelier du duché');
insert into sceaux (id, nom_grave, initiales, proprietaire_origine_id, detenteur_id) values
    ('00000000-0000-0000-0000-0000000000c2', 'Bertrand Lenoir', 'BL',
     '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2');
-- Alix ne connaît que Clémence : Bertrand entrera dans son carnet en ouvrant sa lettre.
insert into contacts (proprietaire_id, personnage_id, qualite) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4', 'Capitaine');

insert into plis (id, auteur_id, gabarit, destinataire_genre, destinataire_id,
                  contenu, sceau_id, signe, etat, envoye_le, date_proposee) values
    -- (a) Bertrand à Alix, signée et scellée : écrite il y a 3 jours, arrivée hier.
    ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a2', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1',
     '{"texte":"Chère Alix,\nles registres ont disparu de la trésorerie.\nNe dites rien au Chancelier."}',
     '00000000-0000-0000-0000-0000000000c2', true, 'traite',
     now() - interval '3 days', now() - interval '1 day'),
    -- (b) Une lettre anonyme de Clémence à Alix, arrivée il y a deux jours.
    ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a4', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1',
     '{"texte":"On vous surveille depuis la tour du guet."}',
     null, false, 'traite',
     now() - interval '4 days', now() - interval '2 days'),
    -- (c) En route pour Alix, jusqu'à demain.
    ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a2', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1',
     '{"texte":"SECRET EN ROUTE"}', null, true, 'traite',
     now() - interval '1 day', now() + interval '1 day'),
    -- (d) Retenu, pour Alix.
    ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000a2', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1',
     '{"texte":"SECRET RETENU"}', null, true, 'traite',
     now() - interval '3 days', now() - interval '1 day'),
    -- (e) Perdu, pour Alix.
    ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000a2', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1',
     '{"texte":"SECRET PERDU"}', null, true, 'traite',
     now() - interval '3 days', now() - interval '1 day'),
    -- (f) Le Chancelier à Bertrand, arrivée hier.
    ('00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000000a5', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a2',
     '{"texte":"SECRET DE BERTRAND"}', null, true, 'traite',
     now() - interval '2 days', now() - interval '1 day'),
    -- (g) Clémence à Alix, encore dans la file du MJ.
    ('00000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000000a4', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1',
     '{"texte":"Rendez-vous au pont, à la nuit tombée."}', null, true, 'a_traiter',
     now() - interval '1 hour', now() + interval '20 hours');

-- Les exemplaires, tels que poser_exemplaire les aurait faits.
insert into exemplaires (id, pli_id, destinataire_id, contenu, ecriture_id, sceau_id, sceau_etat,
                         signature_nom, signature_ecriture_id, signature_etat,
                         signature_personnage_id, acheminement, livraison_le) values
    ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1',
     '00000000-0000-0000-0000-0000000000a1',
     '{"texte":"Chère Alix,\nles registres ont disparu de la trésorerie.\nNe dites rien au Chancelier."}',
     (select id from ecritures where police = 'kalam'),
     '00000000-0000-0000-0000-0000000000c2', 'intact',
     'Bertrand Lenoir', (select id from ecritures where police = 'kalam'), 'intacte',
     '00000000-0000-0000-0000-0000000000a2', 'en_route', now() - interval '1 day'),
    ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d2',
     '00000000-0000-0000-0000-0000000000a1',
     '{"texte":"On vous surveille depuis la tour du guet."}',
     (select id from ecritures where police = 'patrick-hand'), null, null,
     null, null, 'absente', null, 'en_route', now() - interval '2 days'),
    ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000d3',
     '00000000-0000-0000-0000-0000000000a1', '{"texte":"SECRET EN ROUTE"}',
     (select id from ecritures where police = 'kalam'), null, null,
     'Bertrand Lenoir', (select id from ecritures where police = 'kalam'), 'intacte',
     '00000000-0000-0000-0000-0000000000a2', 'en_route', now() + interval '1 day'),
    ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000d4',
     '00000000-0000-0000-0000-0000000000a1', '{"texte":"SECRET RETENU"}',
     (select id from ecritures where police = 'kalam'), null, null,
     'Bertrand Lenoir', (select id from ecritures where police = 'kalam'), 'intacte',
     '00000000-0000-0000-0000-0000000000a2', 'retenu', now() - interval '1 day'),
    ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000d5',
     '00000000-0000-0000-0000-0000000000a1', '{"texte":"SECRET PERDU"}',
     (select id from ecritures where police = 'kalam'), null, null,
     'Bertrand Lenoir', (select id from ecritures where police = 'kalam'), 'intacte',
     '00000000-0000-0000-0000-0000000000a2', 'perdu', now() - interval '1 day'),
    ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000d6',
     '00000000-0000-0000-0000-0000000000a2', '{"texte":"SECRET DE BERTRAND"}',
     (select id from ecritures where police = 'parisienne'), null, null,
     'Le Chancelier', (select id from ecritures where police = 'parisienne'), 'intacte',
     '00000000-0000-0000-0000-0000000000a5', 'en_route', now() - interval '1 day');
