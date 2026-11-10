# Guide de fonctionnement

Ce guide décrit comment le site est construit. Il est mis à jour à la fin de chaque étape de `PLAN.md`.
État décrit : étape 3 (connexion).

## Vue d'ensemble

Le site a deux moitiés, dans le même repo :

- **Le serveur**, en Rust. Il détient les données et décide de ce que chacun a le droit de voir.
- **L'interface**, en React. Elle affiche ce que le serveur lui envoie, et rien d'autre.

Les deux sont hébergés sur Vercel. L'interface est un ensemble de fichiers statiques. Le serveur est une fonction Vercel : elle démarre quand une requête arrive, et il n'y a pas de processus permanent.

## Organisation du repo

| Chemin | Rôle |
|---|---|
| `api/main.rs` | Le point d'entrée du serveur sur Vercel |
| `src/` | Le serveur : routeur, accès à la base, logique du jeu |
| `src/modele.rs` | Le vocabulaire du jeu : gabarits, états d'un pli, d'un sceau… |
| `src/acces/` | Les deux portes d'accès aux données : celle des joueurs, celle du MJ |
| `src/connexion.rs` | La connexion par e-mail et les sessions |
| `src/courriel.rs` | L'envoi des e-mails |
| `src/erreur.rs` | Les erreurs renvoyées à l'interface |
| `src/bin/dev.rs` | Le serveur local, pour développer |
| `migrations/` | La structure de la base, étape par étape |
| `.sqlx/` | La description des requêtes SQL, qui sert à les vérifier à la compilation |
| `web/` | L'interface |
| `web/src/ecrans/` | Les écrans du site |
| `web/src/types/` | Les types générés depuis le serveur. Ne pas les modifier à la main |
| `web/src/components/ui/` | Les composants shadcn/ui, ajoutés au fur et à mesure |
| `web/src/theme/` | Le thème : apparence et vocabulaire de l'univers |
| `web/src/index.css` | Le branchement de Tailwind, de shadcn/ui et du thème |
| `vercel.json` | La configuration de l'hébergement |

## L'apparence

Les composants viennent de shadcn/ui et sont mis en forme avec Tailwind CSS. shadcn/ui ne fixe aucune couleur : il lit des variables (`--background`, `--primary`…). C'est le thème, `web/src/theme/neutre.css`, qui leur donne une valeur. Changer d'univers revient à écrire un autre fichier de thème et à changer une ligne dans `web/src/index.css`.

L'environnement cloud de Claude nommé `epistolaire` autorise l'adresse `ui.shadcn.com`, nécessaire pour ajouter des composants.

## Le chemin d'une requête

1. Le navigateur demande une adresse qui commence par `/api/`.
2. Vercel la transmet à la fonction Rust (`api/main.rs`).
3. Le routeur (`src/lib.rs`) la confie au bon traitement.
4. Le traitement interroge la base et répond en JSON.

Toute autre adresse renvoie l'interface.

## La base de données

### Les tables

| Table | Ce qu'elle contient |
|---|---|
| `comptes` | Les adresses e-mail autorisées, MJ ou joueur |
| `personnages` | Les personnages des joueurs et les PNJ, avec leur fiche |
| `ecritures` | Les polices manuscrites |
| `sceaux` | Les sceaux, leur nom gravé et leur détenteur actuel |
| `contacts` | Les carnets d'adresses |
| `dossiers` | Les dossiers créés par les joueurs |
| `plis` | Ce qui a été écrit, en version originale |
| `exemplaires` | Ce que reçoit chaque destinataire, en version livrée |
| `numeros_gazette`, `lettres_gazette` | Les numéros de la gazette et les lettres retenues |
| `informations`, `pli_informations` | Les informations étiquetées par le MJ |
| `evenements` | L'historique de chaque pli |
| `reglages` | Les réglages généraux, sur une seule ligne |

### Un pli, des exemplaires

Un pli est écrit une fois : la table `plis` garde l'original, que seul le MJ voit.
Quand le MJ le traite, il crée un exemplaire par destinataire dans `exemplaires`.
L'exemplaire porte la version livrée (éventuellement réécrite), sa date de livraison, et ce que ce destinataire remarque.

Il n'y a pas d'état « livré ». Un exemplaire est livré quand il est en route et que sa date de livraison est passée. Aucune tâche ne fait ce passage : c'est une comparaison de dates, faite à chaque lecture.

### La porte des joueurs

Un joueur ne lit jamais les tables `plis` et `exemplaires`. Tout son courrier passe par la vue `plis_recus`, qui ne contient que :

- les exemplaires déjà arrivés ;
- leur version livrée, sans l'original ni le vrai auteur ;
- les altérations que ce destinataire a remarquées, et aucune autre.

Dans le code, `src/acces/joueur.rs` est le seul endroit qui répond à un joueur, et il ne lit que cette vue. Le contenu d'un pli n'est transmis qu'à son ouverture : tant qu'il est fermé, le joueur n'en reçoit que l'extérieur.

### Les migrations

La structure de la base est décrite par les fichiers de `migrations/`, numérotés. Ils sont embarqués dans le serveur. À son démarrage, le serveur compare son dernier numéro à celui de la base et applique ce qui manque.

Une migration déjà appliquée ne se modifie plus : tout changement passe par un nouveau fichier. Une migration ne supprime jamais une table ou une colonne qui contient du courrier sans étape intermédiaire.

## La connexion

1. La personne saisit son adresse e-mail.
2. Si l'adresse a un compte, le serveur lui envoie un e-mail avec un lien et un code à 6 chiffres, valables 15 minutes et utilisables une fois. Une adresse inconnue reçoit la même réponse à l'écran, mais aucun e-mail : le site ne dit pas qui a un compte.
3. Le lien ou le code ouvre une session. Le navigateur reçoit un cookie que le code de la page ne peut pas lire.
4. La session dure 180 jours après la dernière visite.

La base ne garde ni le code, ni le lien, ni le cookie : seulement leur empreinte. Après 5 codes faux, une demande ne vaut plus rien. Un compte ne peut pas recevoir plus de 5 e-mails par quart d'heure.

Le compte du MJ se crée tout seul la première fois que l'adresse de la variable `MJ_EMAIL` demande à se connecter. Les comptes des joueurs sont créés par le MJ.

Dans le code, un traitement réservé au MJ demande un `Mj`, un traitement de joueur demande un `Joueur`. Ces deux preuves ne sont fabriquées que par la connexion, à partir de la session.

Tant que les identifiants d'envoi ne sont pas configurés, les e-mails d'un aperçu ne partent pas : ils sont écrits dans les journaux du serveur, sur Vercel. Le site en ligne, lui, refuse de fonctionner sans eux.

## Les garde-fous automatiques

- **Requêtes SQL vérifiées à la compilation.** Une requête qui ne correspond pas à la base empêche le site de se construire. La vérification s'appuie sur le dossier `.sqlx/`, donc elle marche aussi sur Vercel, sans base à portée de main.
- **Types partagés.** Les types de l'interface sont générés depuis ceux du serveur. Si le serveur change une réponse, l'interface ne se construit plus tant qu'elle n'a pas suivi.

## Développer en local

Il faut Rust, Node et une base PostgreSQL.

```bash
cp .env.exemple .env
```

```bash
cargo run
```

```bash
npm --prefix web install
```

```bash
npm --prefix web run dev
```

Après un changement de requête SQL, avec la base locale lancée :

```bash
cargo sqlx prepare
```

## Déploiement

- Le repo GitHub est relié à Vercel.
- La branche `main` est le site en ligne.
- Chaque autre branche poussée reçoit une adresse d'aperçu.

## Variables d'environnement

| Nom | Rôle |
|---|---|
| `DATABASE_URL` | L'adresse de la base PostgreSQL (Neon) |
| `DATABASE_URL_UNPOOLED` | L'adresse directe de la base, utilisée pour les migrations |
| `MJ_EMAIL` | L'adresse e-mail du MJ, qui ouvre son compte |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Le serveur d'envoi des e-mails et ses identifiants. Port 465 par défaut |
| `MAIL_FROM` | L'adresse d'expédition, si elle diffère de `SMTP_USER` (un alias). Facultatif |
| `SITE_HOST` | Le nom de domaine du site, s'il ne finit pas par `.vercel.app`. Facultatif |
