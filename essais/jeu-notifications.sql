-- Parcours « notifications » : trois joueurs, un PNJ, le MJ, et du courrier en route.
-- Le parcours avance les dates en SQL pour faire « arriver » les plis, puis appelle la tâche.
insert into comptes (id, email, role) values
    ('00000000-0000-0000-0000-00000000000a', 'alix@exemple.fr', 'joueur'),
    ('00000000-0000-0000-0000-00000000000b', 'bertrand@exemple.fr', 'joueur'),
    ('00000000-0000-0000-0000-00000000000c', 'clemence@exemple.fr', 'joueur'),
    ('00000000-0000-0000-0000-00000000000f', 'mj@exemple.fr', 'mj');
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

-- Bertrand a déjà choisi : aucun canal. Alix, Clémence et le MJ n'ont pas encore choisi.
insert into preferences_notification (compte_id, choisi_le) values
    ('00000000-0000-0000-0000-00000000000b', now());

insert into plis (id, auteur_id, gabarit, destinataire_genre, destinataire_id,
                  contenu, signe, etat, envoye_le, date_proposee, mj_prevenu_le) values
    -- (1) Bertrand à Alix, en route jusqu'à demain.
    ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a2', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1',
     '{"texte":"SECRET DU PONT"}', true, 'traite',
     now() - interval '1 day', now() + interval '1 day', now()),
    -- (2) Le Chancelier à Bertrand, en route jusqu'à demain.
    ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a5', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a2',
     '{"texte":"SECRET DU CHANCELIER"}', true, 'traite',
     now() - interval '1 day', now() + interval '1 day', now()),
    -- (3) Clémence au Chancelier (un PNJ).
    ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a4', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a5',
     '{"texte":"SECRET POUR LE PNJ"}', true, 'traite',
     now() - interval '1 day', now() + interval '1 day', now()),
    -- (7) Clémence à Alix, arrivée dans la file : le MJ n'en a pas encore été prévenu.
    ('00000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000000a4', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1',
     '{"texte":"Rendez-vous au pont."}', true, 'a_traiter',
     now() - interval '10 minutes', now() + interval '20 hours', null),
    -- (8) Bertrand à Clémence, dans la file depuis longtemps : sa date approche.
    ('00000000-0000-0000-0000-0000000000d8', '00000000-0000-0000-0000-0000000000a2', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a4',
     '{"texte":"Tout est prêt."}', true, 'a_traiter',
     now() - interval '23 hours', now() + interval '1 hour', now() - interval '22 hours');
-- (9) Une lettre à la gazette, dont la date approche aussi : elle attend un numéro, pas d'alerte.
insert into plis (id, auteur_id, gabarit, destinataire_genre, contenu, signe, etat,
                  envoye_le, date_proposee, mj_prevenu_le) values
    ('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000a4', 'billet',
     'gazette', '{"texte":"Avis à la population."}', true, 'a_traiter',
     now() - interval '23 hours', now() + interval '30 minutes', now() - interval '22 hours');

-- Les exemplaires en route, tels que poser_exemplaire les aurait faits.
insert into exemplaires (id, pli_id, destinataire_id, contenu, ecriture_id,
                         signature_nom, signature_ecriture_id, signature_etat,
                         signature_personnage_id, acheminement, livraison_le) values
    ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1',
     '00000000-0000-0000-0000-0000000000a1', '{"texte":"SECRET DU PONT"}',
     (select id from ecritures where police = 'kalam'),
     'Bertrand Lenoir', (select id from ecritures where police = 'kalam'), 'intacte',
     '00000000-0000-0000-0000-0000000000a2', 'en_route', now() + interval '1 day'),
    ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d2',
     '00000000-0000-0000-0000-0000000000a2', '{"texte":"SECRET DU CHANCELIER"}',
     (select id from ecritures where police = 'parisienne'),
     'Le Chancelier', (select id from ecritures where police = 'parisienne'), 'intacte',
     '00000000-0000-0000-0000-0000000000a5', 'en_route', now() + interval '1 day'),
    ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000d3',
     '00000000-0000-0000-0000-0000000000a5', '{"texte":"SECRET POUR LE PNJ"}',
     (select id from ecritures where police = 'patrick-hand'),
     'Clémence Hardy', (select id from ecritures where police = 'patrick-hand'), 'intacte',
     '00000000-0000-0000-0000-0000000000a4', 'en_route', now() + interval '1 day');
