-- Deux joueurs, un PNJ, leurs sceaux, et un carnet : Alix connaît Bertrand.
insert into comptes (id, email, role) values
    ('00000000-0000-0000-0000-00000000000a', 'alix@exemple.fr', 'joueur'),
    ('00000000-0000-0000-0000-00000000000b', 'bertrand@exemple.fr', 'joueur');
insert into personnages (id, nom, genre, compte_id, ecriture_id, role, aptitudes, notes_mj) values
    ('00000000-0000-0000-0000-0000000000a1', 'Alix de Montfort', 'joueur',
     '00000000-0000-0000-0000-00000000000a', (select id from ecritures where police = 'caveat'),
     'Trésorière du duché', 'Comptes, intrigues de cour.', 'SECRET DU MJ'),
    ('00000000-0000-0000-0000-0000000000a2', 'Bertrand Lenoir', 'joueur',
     '00000000-0000-0000-0000-00000000000b', (select id from ecritures where police = 'kalam'),
     'Intendant', '', ''),
    ('00000000-0000-0000-0000-0000000000a3', 'Dame Inconnue', 'pnj', null, null, '', '', '');
insert into sceaux (id, nom_grave, initiales, proprietaire_origine_id, detenteur_id) values
    ('00000000-0000-0000-0000-0000000000c1', 'Alix de Montfort', 'AM',
     '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1'),
    ('00000000-0000-0000-0000-0000000000c2', 'Bertrand Lenoir', 'BL',
     '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2');
insert into contacts (proprietaire_id, personnage_id, qualite) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'intendant');
