-- Un joueur et son personnage, pour l'essai de connexion.
insert into comptes (id, email, role) values
    ('00000000-0000-0000-0000-00000000000a', 'alix@exemple.fr', 'joueur');
insert into personnages (nom, genre, compte_id) values
    ('Alix', 'joueur', '00000000-0000-0000-0000-00000000000a');
