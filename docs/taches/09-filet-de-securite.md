# Étape 9 : filet de sécurité

## Ce que le MJ verra

Peu de choses à l'écran, mais deux garanties :

- des tests automatiques prouvent qu'un joueur ne reçoit jamais ce qu'il ne doit pas voir ;
- la base est copiée chaque jour, les copies sont gardées 30 jours, et on sait les restaurer.

Le site installable a été fait à l'étape 8. Il reste à le vérifier sur de vrais téléphones.

## Déjà décidé

Voir `DECISIONS.md`, sections « Accès et confidentialité » et « Technique ».

- Quelques tests automatiques vérifient la confidentialité.
- Sauvegardes : l'historique court de Neon, plus une copie quotidienne automatique dans Vercel Blob, conservée 30 jours.

## Questions au MJ

1. **Heure de la sauvegarde.** « À quelle heure faire la copie quotidienne de la base ? »
   - (Recommandé) 4 h du matin, heure de Paris : personne n'écrit à cette heure-là. · Une autre heure.
2. **Échec d'une sauvegarde.** « Si la copie du jour échoue, voulez-vous un e-mail ? »
   - (Recommandé) Oui, un e-mail au MJ. · Non, je regarderai de temps en temps.
3. **Création du stockage.** « Les copies vont dans un espace de stockage Vercel Blob relié au projet. Je le crée pour vous avec l'outil Vercel, ou vous préférez le créer vous-même ? »
   - (Recommandé) Créez-le. · Je le crée et je vous préviens.

## Tâches

### 9.1 Tests de confidentialité (`tests/confidentialite.rs`)

**Principe.** Un test d'intégration Rust qui monte une base d'essai connue, ouvre une session pour chaque joueur, appelle **toutes** les routes des joueurs, et vérifie qu'aucune réponse ne contient ce qui doit rester caché.

**La base d'essai.**

- Une base à part, `epistolaire_tests`, jamais la base de développement. Le test lit son adresse dans `EPISTOLAIRE_TESTS_BASE`. Si la variable est absente, le test s'annonce « ignoré » et réussit : `cargo test` doit continuer à marcher sans base, puisqu'il sert aussi à générer les types.
- Le serveur lit sa base dans `DATABASE_URL` au premier appel (`src/base.rs`). Le test pose donc `DATABASE_URL` sur la base d'essai **avant** le premier appel, et les tests de ce fichier tournent l'un après l'autre (un seul test qui enchaîne les cas, ou un verrou commun).
- Un script `essais/confidentialite.sh` crée la base si besoin, la vide, et lance `EPISTOLAIRE_TESTS_BASE=… cargo test --test confidentialite -- --nocapture`. L'ajouter dans `CLAUDE.md`, section « Essais ».

**Le jeu de données** (`tests/donnees/confidentialite.sql`), qui couvre chaque état. Chaque secret porte un marqueur facile à chercher :

- un brouillon d'Alix (`BROUILLON-ALIX`) et un brouillon de Bertrand (`BROUILLON-BERTRAND`) ;
- une lettre d'Alix dans la file (`ORIGINAL-FILE`), à une adresse libre (`ADRESSE-LIBRE`) ;
- des exemplaires pour Alix : en route demain (`EN-ROUTE`), retenu (`RETENU`), perdu (`PERDU`), arrivé et fermé (`FERME`), arrivé et ouvert ;
- un pli dont l'original (`ORIGINAL-SECRET`) diffère de la version livrée ;
- un pli redirigé : écrit pour Clémence, remis à Alix ;
- les plis, dossiers, carnet et fiche de Bertrand (`BERTRAND-…`) ;
- les notes du MJ sur un personnage (`NOTES-MJ`), une information étiquetée (`INFO-SECRETE`) ;
- les adresses e-mail de tous les comptes.

**Les sessions.** Insérer une ligne dans `sessions` par joueur et pour le MJ, avec un jeton connu. La base ne garde que l'empreinte : `sha256` du jeton, en hexadécimal (voir `empreinte` dans `src/connexion.rs`). Appeler le routeur `epistolaire::routeur()` directement (`tower::ServiceExt::oneshot`), avec l'en-tête `Cookie: session=<jeton>`.

**Les vérifications.**

1. **Inventaire des routes.** Le test lit `src/acces/joueur/mod.rs`, relève chaque `.route("…")`, et échoue si une route n'est pas dans sa liste de routes vérifiées. Ainsi, une route ajoutée plus tard sans test fait échouer `cargo test`.
2. **Chaque route des joueurs, pour Alix**, avec tous les identifiants du jeu de données (les siens et ceux des autres) : aucune réponse ne contient un marqueur interdit, une adresse e-mail (aucune, pas même la sienne), l'identifiant d'un vrai auteur, ni un horodatage de pli. Seuls ses propres brouillons ont le droit d'avoir une date réelle.
3. **Les gestes interdits** répondent 404 et ne changent rien en base : ouvrir, ranger, lire le pli d'un autre ou un pli non arrivé ; lire, modifier, envoyer, jeter le brouillon d'un autre ; toucher le dossier d'un autre.
4. **La porte du MJ** : chaque route sous `/api/mj` répond 403 à un joueur, et 401 sans session. Même inventaire automatique que pour les joueurs, sur `src/acces/mj/mod.rs`.
5. **La porte des tâches** : `/api/taches/…` répond 401 sans le secret, même avec une session.
6. **La règle du code.** Le test lit les fichiers de `src/acces/joueur/` et échoue s'il trouve `from plis`, `join plis`, `update plis`, `from exemplaires`, `join exemplaires` ou `update exemplaires`, sauf dans les deux requêtes autorisées de `ecritoire.rs` (le compte du quota et l'envoi), repérées par une ligne précise.

Les étapes 10 à 14 ajouteront leurs cas : chaque fiche le rappelle.

### 9.2 Sauvegarde quotidienne

- **La route.** `GET /api/taches/sauvegarde`, gardée par le secret de l'étape 8. Ajouter une tâche quotidienne dans `vercel.json` à l'heure choisie par le MJ. Les horaires de `vercel.json` sont en temps universel : 4 h à Paris, c'est `0 3 * * *` en hiver et `0 2 * * *` en été. Prendre la plus prudente et le noter.
- **La copie.** Pour chaque table du schéma `public` (lister par `information_schema.tables`, `_sqlx_migrations` comprise) : `select coalesce(json_agg(t), '[]') from <table> t`. Assembler un seul document JSON : `{ "structure": <numéro de la dernière migration>, "faite_le": …, "tables": { "<nom>": [ … ] } }`, puis le compresser (bibliothèque `flate2`, `rust-version` 1.67).
- **Le dépôt.** Vers Vercel Blob, sous `sauvegardes/AAAA-MM-JJ.json.gz`, avec le jeton `BLOB_READ_WRITE_TOKEN`, que Vercel ajoute au projet quand le stockage y est relié. Lire la documentation actuelle de l'API Blob (outil `search_vercel_documentation`) avant d'écrire l'appel. La copie contient les adresses e-mail : demander un accès **privé** si Blob le propose ; sinon, un nom de fichier imprévisible, et le noter dans `DECISIONS.md`.
- **Le ménage.** Lister `sauvegardes/` et supprimer les copies de plus de 30 jours.
- **L'échec.** Si quelque chose échoue : le journal, et un e-mail au MJ si demandé.
- **La durée.** Vérifier la durée maximale d'une fonction Vercel, et la régler pour cette route dans `vercel.json` si besoin.

### 9.3 Restauration

Une sauvegarde qu'on ne sait pas restaurer ne vaut rien.

- Un programme `src/bin/restaurer.rs` : `cargo run --bin restaurer -- <fichier.json.gz> <adresse de base>`.
  - Il refuse une base qui contient déjà des plis.
  - Il applique les migrations jusqu'au numéro de la copie, puis charge les tables dans une seule transaction, en désactivant les contrôles de clés pendant le chargement (`set session_replication_role = replica`) avant de les rétablir.
  - Il remet à niveau les compteurs (la colonne `id` de `evenements` est générée).
- Un essai : sauvegarder la base locale d'un parcours rempli, restaurer dans une base neuve, comparer le nombre de lignes de chaque table et le contenu de `plis` et `exemplaires`.
- Jamais de restauration vers la base du site en ligne sans l'accord explicite du MJ.

### 9.4 Le stockage Blob

Selon la réponse à la question 3 : le créer avec l'outil Vercel (`create_storage_stores_blob`, équipe `brume`), le relier au projet `epistolaire`, puis vérifier que `BLOB_READ_WRITE_TOKEN` apparaît dans les variables du projet (nom seulement, jamais la valeur).

### 9.5 Le site installé, sur de vrais téléphones

Avec le MJ, sur l'aperçu :

- Android (Chrome) et iPhone (Safari) : installer le site, l'ouvrir depuis l'écran d'accueil, se connecter avec le code à 6 chiffres, recevoir une notification.
- Noter ce qui ne va pas, et le corriger dans cette étape.

### 9.6 Documentation

- `docs/FONCTIONNEMENT.md` : « Les tests de confidentialité » (comment les lancer, ce qu'ils vérifient, qu'ils échouent si une route est ajoutée sans test), « Sauvegarde et restauration » (où sont les copies, combien de temps, comment restaurer, pas à pas).
- `CLAUDE.md` : la commande des tests de confidentialité, et la règle : toute nouvelle route de joueur est ajoutée aux tests.

## Pièges

- `cargo test` doit continuer à marcher sans base : il génère les types de l'interface.
- Les tests ne doivent jamais toucher la base de développement ni, bien sûr, celle du site en ligne.
- Une copie partielle qu'on croit complète est pire que pas de copie : la restauration doit vérifier qu'elle trouve toutes les tables attendues.

## Points à relire

- La liste des marqueurs et des routes : rien n'a été oublié.
- La restauration, essayée de bout en bout.
- L'accès aux copies dans Blob : elles contiennent les adresses des joueurs.

## Terminé quand

- `essais/confidentialite.sh` passe, et échoue bien si l'on retire volontairement un filtre (essai à faire une fois, puis à défaire).
- Une sauvegarde a tourné sur l'aperçu (appel manuel avec le secret), elle est dans Blob, et elle a été restaurée en local.
- Le site a été installé et a reçu une notification sur un Android et un iPhone.
