-- Trois joueurs, un PNJ, et deux lettres d'Alix dans la file du MJ : il va les altérer.
-- Le calendrier du jeu a commencé il y a 40 jours (à Paris).
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
    ('00000000-0000-0000-0000-0000000000c1', 'Alix de Montfort', 'AM',
     '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1'),
    ('00000000-0000-0000-0000-0000000000c5', 'Chancellerie du Duché', 'CD',
     '00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a5');

insert into plis (id, auteur_id, gabarit, destinataire_genre, destinataire_id,
                  contenu, sceau_id, signe, etat, envoye_le, date_proposee) values
    -- 1. Alix à Bertrand, signée et scellée. La bougie compte pour un caractère, mais pour
    --    deux dans le navigateur : les positions des passages doivent tomber juste quand même.
    ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a2',
     '{"texte":"Cher Bertrand 🕯,\nles registres sont à l''abri chez le notaire. Retrouvez-moi à la chapelle, jeudi soir.\nBrûlez cette lettre."}',
     '00000000-0000-0000-0000-0000000000c1', true, 'a_traiter',
     now() - interval '4 hours', now() + interval '20 hours'),
    -- 2. Alix à Clémence, signée, sans sceau : altérée au traitement.
    ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a4',
     '{"texte":"Clémence, doublez la garde à la porte nord dès demain."}',
     null, true, 'a_traiter',
     now() - interval '2 hours', now() + interval '30 hours');
