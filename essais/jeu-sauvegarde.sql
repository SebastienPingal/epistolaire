-- Parcours « sauvegarde » : le MJ, une joueuse, et une lettre, pour que la copie ait
-- de quoi contenir.
insert into comptes (id, email, role) values
    ('00000000-0000-0000-0000-00000000000a', 'alix@exemple.fr', 'joueur'),
    ('00000000-0000-0000-0000-00000000000f', 'mj@exemple.fr', 'mj');
insert into personnages (id, nom, genre, compte_id, ecriture_id, role) values
    ('00000000-0000-0000-0000-0000000000a1', 'Alix de Montfort', 'joueur',
     '00000000-0000-0000-0000-00000000000a', (select id from ecritures where police = 'caveat'),
     'Trésorière du duché'),
    ('00000000-0000-0000-0000-0000000000a5', 'Le Chancelier', 'pnj', null,
     (select id from ecritures where police = 'parisienne'), 'Chancelier du duché');
insert into contacts (proprietaire_id, personnage_id) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a5');
insert into plis (id, auteur_id, gabarit, destinataire_genre, destinataire_id, contenu,
                  etat, envoye_le, date_proposee, mj_prevenu_le, mj_alerte_le) values
    ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'billet',
     'personnage', '00000000-0000-0000-0000-0000000000a5',
     '{"texte":"Monsieur le Chancelier, les registres ont disparu."}',
     'a_traiter', now() - interval '1 hour', now() + interval '1 day', now(), now());
insert into evenements (pli_id, genre) values
    ('00000000-0000-0000-0000-0000000000d1', 'envoi');
