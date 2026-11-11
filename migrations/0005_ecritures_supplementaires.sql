-- De nouvelles écritures, pour avoir le choix entre bien plus de mains.
-- Comme pour 0003, chaque police (colonne `police`) correspond à une entrée de
-- `web/src/theme/ecritures.ts`. Si le MJ a déjà donné l'un de ces noms à une
-- autre écriture, la ligne n'est pas ajoutée plutôt que de faire échouer le démarrage.
insert into ecritures (nom, police)
select v.nom, v.police
from (values
    ('Dansante',       'dancing-script'),
    ('Assurée',        'satisfy'),
    ('Fleurie',        'great-vibes'),
    ('Gracieuse',      'allura'),
    ('Vigoureuse',     'alex-brush'),
    ('Anglaise',       'pinyon-script'),
    ('Italienne',      'italianno'),
    ('Cérémonieuse',   'petit-formal-script'),
    ('Coulée',         'rouge-script'),
    ('Fine',           'sacramento'),
    ('Légère',         'euphoria-script'),
    ('Aristocratique', 'mr-de-haviland'),
    ('Mondaine',       'mrs-saint-delafield'),
    ('Ancienne',       'meddon'),
    ('Ornée',          'mea-culpa'),
    ('Fluide',         'ephesis'),
    ('Ferme',          'courgette'),
    ('Nerveuse',       'bad-script'),
    ('Hâtive',         'zeyada'),
    ('Rêveuse',        'over-the-rainbow'),
    ('Serrée',         'just-another-hand'),
    ('Épaisse',        'covered-by-your-grace'),
    ('Méthodique',     'architects-daughter'),
    ('Enfantine',      'schoolbell'),
    ('Étroite',        'sue-ellen-francisco'),
    ('Flottante',      'waiting-for-the-sunrise'),
    ('Irrégulière',    'mynerve'),
    ('Distraite',      'annie-use-your-telescope'),
    ('Espacée',        'the-girl-next-door'),
    ('Maladroite',     'loved-by-the-king'),
    ('Anguleuse',      'calligraffitti'),
    ('Brouillonne',    'just-me-again-down-here'),
    ('Lâchée',         'grape-nuts'),
    ('Appuyée',        'beth-ellen'),
    ('Grasse',         'caveat-brush'),
    ('Simple',         'handlee'),
    ('Sobre',          'neucha')
) as v (nom, police)
where not exists (select 1 from ecritures e where e.police = v.police)
on conflict (nom) do nothing;
