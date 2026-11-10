-- Les écritures de départ : une par police manuscrite fournie avec le site.
-- Le nom de la police (colonne `police`) correspond à une entrée de
-- `web/src/theme/ecritures.ts`. Le MJ peut renommer une écriture, pas en créer :
-- ajouter une police demande de l'ajouter au site, puis ici par une nouvelle migration.
insert into ecritures (nom, police) values
    ('Vive',        'caveat'),
    ('Appliquée',   'kalam'),
    ('Ronde',       'patrick-hand'),
    ('Enjouée',     'indie-flower'),
    ('Élancée',     'shadows-into-light'),
    ('Large',       'gloria-hallelujah'),
    ('Griffonnée',  'reenie-beanie'),
    ('Pressée',     'nothing-you-could-do'),
    ('Liée',        'homemade-apple'),
    ('Déliée',      'la-belle-aurore'),
    ('Scolaire',    'cedarville-cursive'),
    ('Penchée',     'dawning-of-a-new-day'),
    ('Soignée',     'marck-script'),
    ('Élégante',    'parisienne');
