-- Trois joueurs, deux PNJ, et sept lettres dans la file du MJ.
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
    -- Un PNJ sans écriture ni sceau, et un PNJ complet.
    ('00000000-0000-0000-0000-0000000000a3', 'Dame Inconnue', 'pnj', null, null, ''),
    ('00000000-0000-0000-0000-0000000000a5', 'Le Chancelier', 'pnj', null,
     (select id from ecritures where police = 'parisienne'), 'Chancelier du duché');
update ecritures set generique = true where police in ('marck-script', 'la-belle-aurore');
insert into sceaux (id, nom_grave, initiales, proprietaire_origine_id, detenteur_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'Alix de Montfort', 'AM',
     '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1'),
    ('00000000-0000-0000-0000-0000000000c2', 'Bertrand Lenoir', 'BL',
     '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2'),
    ('00000000-0000-0000-0000-0000000000c5', 'Chancellerie du Duché', 'CD',
     '00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a5');

insert into plis (id, auteur_id, gabarit, destinataire_genre, destinataire_id, destinataire_libre,
                  contenu, sceau_id, signe, etat, envoye_le, date_proposee) values
    -- 1. Alix à Bertrand, signée et scellée : arrive dans 20 heures.
    ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a2', null,
     '{"texte":"Cher Bertrand,\nles comptes du duché ne tombent pas juste. Retrouvez-moi à la chapelle, jeudi."}',
     '00000000-0000-0000-0000-0000000000c1', true, 'a_traiter',
     now() - interval '4 hours', now() + interval '20 hours'),
    -- 2. Alix à un PNJ sans écriture : arrive dans 30 heures.
    ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a3', null,
     '{"texte":"Madame, je sais qui vous êtes. Parlons."}',
     null, false, 'a_traiter',
     now() - interval '2 hours', now() + interval '30 hours'),
    -- 3. Bertrand à une adresse libre : date proposée dépassée depuis une heure.
    ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a2', 'billet',
     'libre', null, 'L''évêque de Clairval',
     '{"texte":"Monseigneur, une affaire urgente réclame votre arbitrage."}',
     '00000000-0000-0000-0000-0000000000c2', true, 'a_traiter',
     now() - interval '2 days', now() - interval '1 hour'),
    -- 4. Alix à la gazette.
    ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000a1', 'billet',
     'gazette', null, null,
     '{"texte":"Avis aux lecteurs : on cherche un scribe discret."}',
     null, false, 'a_traiter',
     now() - interval '1 hour', now() + interval '40 hours'),
    -- 5. Bertrand à Alix : date proposée dépassée depuis trois heures. La plus urgente.
    ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000a2', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a1', null,
     '{"texte":"Jeudi, à la chapelle. Venez seule."}',
     null, true, 'a_traiter',
     now() - interval '3 days', now() - interval '3 hours'),
    -- 6. Bertrand à la gazette.
    ('00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000000a2', 'billet',
     'gazette', null, null,
     '{"texte":"La trésorière ment. Demandez-lui où sont passés les sacs de grain."}',
     null, false, 'a_traiter',
     now() - interval '30 minutes', now() + interval '45 hours'),
    -- 7. Bertrand au Chancelier.
    ('00000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000000a2', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a5', null,
     '{"texte":"Monsieur le Chancelier, je sollicite une audience."}',
     '00000000-0000-0000-0000-0000000000c2', true, 'a_traiter',
     now() - interval '5 hours', now() + interval '10 hours');
