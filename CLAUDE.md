# Instructions pour Claude

Site de jeu de rôle épistolaire, pour une seule campagne entre amis.
Claude développe et maintient tout le code. Le MJ (propriétaire du repo) décide, relit les aperçus, et ne code pas.

## À lire avant de travailler

- `DECISIONS.md` : ce que fait le site, et pourquoi. C'est la référence. Toute décision nouvelle y est notée.
- `PLAN.md` : les étapes de réalisation et leur état.
- `docs/FONCTIONNEMENT.md` : comment le site est construit, lancé et déployé.
- `docs/taches/` : le détail de chaque étape restante. Commencer par `docs/taches/README.md`, le mode d'emploi d'une étape, puis la fiche de l'étape.

## Façon de travailler avec le MJ

- Parler français, sans jargon technique inutile.
- Poser la question avant toute décision non triviale. Les choix purement techniques sont à Claude, mais ils sont expliqués et notés.
- Appliquer un changement de code et le vérifier sont deux temps séparés : ne pas lancer les tests pendant qu'on écrit le code.
- Une étape du plan = une branche = un aperçu Vercel. `main` est le site en ligne : on n'y pousse rien qui n'a pas été vu en aperçu.
- En fin d'étape : mettre à jour `PLAN.md` et `docs/FONCTIONNEMENT.md`.

## Règles du code

- Le vocabulaire du code est celui de `DECISIONS.md`, en français : pli, exemplaire, sceau, carnet, gazette…
- **Confidentialité** : le tri de ce qu'un joueur a le droit de voir se fait sur le serveur, jamais dans l'interface. Un joueur ne reçoit jamais un original, un vrai auteur, une date prévue, ni une altération non remarquée. Voir la liste « Un joueur ne voit jamais » dans `DECISIONS.md`.
- **Livraison** : un pli est livré dès que sa date de livraison est passée. C'est calculé à chaque lecture ; aucune tâche planifiée ne « livre ». Les planifications ne servent qu'aux notifications.
- **Migrations** : un fichier numéroté par changement dans `migrations/`, appliqué automatiquement au démarrage du serveur. Ne jamais modifier une migration déjà poussée : en écrire une nouvelle. Elles ne doivent jamais perdre un pli en route : pas de suppression de colonne ou de table sans étape intermédiaire.
- **Porte des joueurs** : tout ce qui répond à un joueur est dans `src/acces/joueur/`, sous `/api/joueur`, et chaque traitement prend un `Joueur` en paramètre. Le courrier reçu ne se lit que dans la vue `plis_recus`, et ne se modifie que par les fonctions SQL `ouvrir_pli`, `ranger_pli` et `detruire_pli`. Ses propres lettres ne se lisent et ne se modifient que dans la vue `brouillons`. Ses dossiers se lisent et s'écrivent directement, toujours filtrés sur son personnage. Ne jamais lire `plis` ou `exemplaires` pour répondre à un joueur. Deux exceptions, dans `ecritoire.rs` : compter les envois de la semaine, et l'envoi lui-même.
- **Dates des joueurs** : un joueur ne reçoit jamais d'horodatage de pli, seulement des dates du jeu (`DateJeu`, `src/calendrier.rs`). Le jour réel se calcule en SQL à Paris : `(horodatage at time zone r.fuseau)::date`.
- **Porte du MJ** : tout ce qui est réservé au MJ est dans `src/acces/mj/`, sous `/api/mj`, et chaque traitement prend un `Mj` en paramètre.
- **Exemplaires** : un exemplaire ne se crée que par `poser_exemplaire` (`src/acces/mj/acheminement.rs`), qui recopie la version écrite par l'auteur. Tout geste du MJ sur un pli ajoute une ligne à son historique avec `noter`. Le MJ ne modifie plus un exemplaire arrivé.
- **SQL** : requêtes vérifiées à la compilation (`sqlx::query!`). Après tout changement de requête ou de migration, relancer `cargo sqlx prepare` et commiter `.sqlx/`.
- **Types de l'interface** : générés depuis Rust (`ts-rs`) dans `web/src/types/`. Ne jamais les écrire à la main ; relancer `cargo test` pour les régénérer.
- **Composants** : shadcn/ui (variante Base UI) et Tailwind CSS. Ajouter un composant avec `npx shadcn@latest add <nom>` depuis `web/` ; il arrive dans `web/src/components/ui/`. Préférer un composant shadcn à un composant écrit à la main.
- **Thème** : tout ce qui dépend de l'univers (apparence, vocabulaire) vit dans `web/src/theme/`. Le fichier CSS du thème donne leur valeur aux variables de shadcn. Les composants n'écrivent ni couleur ni mot d'univers en dur : ils utilisent les classes des variables (`bg-background`, `text-muted-foreground`, `text-bon`…).
- **Version de Rust** : Vercel compile avec Rust 1.92 (`rust-version` dans `Cargo.toml`). Ne pas prendre une dépendance qui exige une version plus récente : sqlx reste en 0.8 pour cette raison, et l'outil `sqlx-cli` doit être en 0.8 lui aussi.
- **Écrans des joueurs** : dans `web/src/joueur/`. Ils sont immersifs et pensés d'abord pour le téléphone. Tous leurs textes viennent du vocabulaire du thème.
- **Écrans du MJ** : dans `web/src/mj/`. Ce sont des outils, pas des écrans immersifs : leurs libellés sont écrits directement dans les composants. Seuls les écrans des joueurs passent par le vocabulaire du thème.
- **Écritures** : la liste des polices manuscrites est dans `web/src/theme/ecritures.ts`. En ajouter une : installer le paquet `@fontsource/…`, l'ajouter à cette liste, puis l'insérer dans la table `ecritures` par une migration.
- **Secrets** : jamais dans le repo. Ils vivent dans les variables d'environnement Vercel.

## Hébergement

- Projet Vercel `epistolaire`, dans l'équipe `Brume`, relié à ce repo. Région `fra1`.
- Base Neon reliée au projet. Les aperçus et le site en ligne partagent la même base pour l'instant : une migration poussée sur une branche s'applique donc aussi à la base du site en ligne.
- Chaque push sur une branche construit un aperçu en 4 à 5 minutes : `https://epistolaire-git-<branche>-brume.vercel.app`. Les aperçus sont protégés : pour les lire, passer par l'outil Vercel qui ouvre une adresse de déploiement.
- Pour mettre une étape validée en ligne : `git push origin <branche>:main`.
- L'outil de construction de Vercel exige une section `[build]` dans `.cargo/config.toml`, même vide.

## Environnement de travail

Dans une session neuve, avant de compiler ou d'essayer :

```bash
rustup toolchain install 1.92.0 --profile minimal
cargo install sqlx-cli --version 0.8.6 --no-default-features --features rustls,postgres --locked
pg_ctlcluster 16 main start
su postgres -c "psql -c \"alter user postgres password 'postgres'\""
su postgres -c "createdb epistolaire"
cp -n .env.exemple .env
npm --prefix web ci
```

- La base locale s'arrête quand la session redémarre : relancer `pg_ctlcluster 16 main start`.
- Compiler comme Vercel : `cargo +1.92.0 check`.
- L'environnement cloud `epistolaire` autorise `ui.shadcn.com`, nécessaire pour ajouter des composants.

## Essais

Les parcours d'essai sont dans `essais/`. Chacun vide la base locale, y met son jeu de données, lance le site et le parcourt dans un vrai navigateur :

```bash
essais/lancer.sh connexion
essais/lancer.sh preparation-mj
essais/lancer.sh ecrire
essais/lancer.sh traiter
essais/lancer.sh recevoir
```

- Chaque étape ajoute son parcours, et met à jour les anciens quand un écran change.
- Sans identifiants SMTP en local, les e-mails sont écrits dans le journal du serveur : les parcours y lisent les codes de connexion.
- `essais/vue-plis-recus.sql` vérifie ce que la vue des joueurs laisse voir d'un pli altéré.
- Regarder aussi les captures d'écran (`essais/sortie/`), au format téléphone d'abord.

## Commandes

```bash
cargo run                      # serveur local sur le port 8787
npm --prefix web run dev       # interface locale, qui transmet /api au serveur
cargo sqlx prepare             # après un changement de requête SQL
cargo test                     # tests, et régénération des types de l'interface
npm --prefix web run build     # vérification des types et construction de l'interface
```
