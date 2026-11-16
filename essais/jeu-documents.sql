-- Deux joueurs, deux PNJ (l'un sans écriture), et un billet d'avant l'étape 11, déjà arrivé
-- chez Alix : il doit toujours s'ouvrir.
update reglages set calendrier_debut = (now() at time zone 'Europe/Paris')::date - 40;

insert into comptes (id, email, role) values
    ('00000000-0000-0000-0000-00000000000a', 'alix@exemple.fr', 'joueur'),
    ('00000000-0000-0000-0000-00000000000b', 'bertrand@exemple.fr', 'joueur');
insert into personnages (id, nom, genre, compte_id, ecriture_id, role) values
    ('00000000-0000-0000-0000-0000000000a1', 'Alix de Montfort', 'joueur',
     '00000000-0000-0000-0000-00000000000a', (select id from ecritures where police = 'caveat'),
     'Trésorière du duché'),
    ('00000000-0000-0000-0000-0000000000a2', 'Bertrand Lenoir', 'joueur',
     '00000000-0000-0000-0000-00000000000b', (select id from ecritures where police = 'kalam'),
     'Intendant'),
    ('00000000-0000-0000-0000-0000000000a5', 'Le Chancelier', 'pnj', null,
     (select id from ecritures where police = 'parisienne'), 'Chancelier du duché'),
    ('00000000-0000-0000-0000-0000000000a6', 'Le Cartographe', 'pnj', null, null, 'Arpenteur');
insert into sceaux (id, nom_grave, initiales, proprietaire_origine_id, detenteur_id) values
    ('00000000-0000-0000-0000-0000000000c5', 'Chancellerie du Duché', 'CD',
     '00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a5');

-- Un billet d'avant l'étape 11 : son contenu n'a que « texte ».
insert into plis (id, auteur_id, redige_par_mj, gabarit, destinataire_genre, destinataire_id,
                  contenu, signe, etat, envoye_le, date_proposee) values
    ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a5', true,
     'billet', 'personnage', '00000000-0000-0000-0000-0000000000a1',
     '{"texte":"Un billet d''avant les gabarits."}', true, 'traite',
     now() - interval '2 days', now() - interval '1 day');
insert into exemplaires (id, pli_id, destinataire_id, contenu, ecriture_id, signature_nom,
                         signature_ecriture_id, signature_personnage_id, signature_etat,
                         acheminement, livraison_le, notifie_le) values
    ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1',
     '00000000-0000-0000-0000-0000000000a1', '{"texte":"Un billet d''avant les gabarits."}',
     (select id from ecritures where police = 'parisienne'), 'Le Chancelier',
     (select id from ecritures where police = 'parisienne'),
     '00000000-0000-0000-0000-0000000000a5', 'intacte',
     'en_route', now() - interval '1 day', now());
