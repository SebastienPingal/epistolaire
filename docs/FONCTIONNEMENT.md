# Guide de fonctionnement

Ce guide décrit comment le site est construit. Il est mis à jour à la fin de chaque étape de `PLAN.md`.
État décrit : étape 5 (le joueur écrit).

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
| `src/acces/joueur/` | La porte des joueurs : écritoire, fiche, courrier reçu |
| `src/acces/mj/` | La porte du MJ : personnages, écritures, sceaux, réglages |
| `src/connexion.rs` | La connexion par e-mail et les sessions |
| `src/courriel.rs` | L'envoi des e-mails |
| `src/erreur.rs` | Les erreurs renvoyées à l'interface |
| `src/bin/dev.rs` | Le serveur local, pour développer |
| `migrations/` | La structure de la base, étape par étape |
| `.sqlx/` | La description des requêtes SQL, qui sert à les vérifier à la compilation |
| `web/` | L'interface |
| `web/src/ecrans/` | L'écran de connexion |
| `web/src/joueur/` | Les écrans des joueurs |
| `web/src/mj/` | Les écrans du MJ |
| `web/src/composants/` | Les éléments du jeu réutilisés partout : une écriture, un cachet |
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

Un joueur ne lit jamais les tables `plis` et `exemplaires`. Tout son courrier reçu passe par la vue `plis_recus`, qui ne contient que :

- les exemplaires déjà arrivés ;
- leur version livrée, sans l'original ni le vrai auteur ;
- les altérations que ce destinataire a remarquées, et aucune autre.

Dans le code, le dossier `src/acces/joueur/` est le seul endroit qui répond à un joueur. Pour le courrier reçu, il ne lit que cette vue ; pour ses brouillons, que la vue `brouillons`. Le contenu d'un pli n'est transmis qu'à son ouverture : tant qu'il est fermé, le joueur n'en reçoit que l'extérieur.

### Les migrations

La structure de la base est décrite par les fichiers de `migrations/`, numérotés. Ils sont embarqués dans le serveur. À son démarrage, le serveur compare son dernier numéro à celui de la base et applique ce qui manque.

Une migration déjà appliquée ne se modifie plus : tout changement passe par un nouveau fichier. Une migration ne supprime jamais une table ou une colonne qui contient du courrier sans étape intermédiaire.

## La connexion

1. La personne saisit son adresse e-mail.
2. Si l'adresse a un compte, le serveur lui envoie un e-mail avec un lien et un code à 6 chiffres, valables 15 minutes et utilisables une fois. Une adresse inconnue reçoit la même réponse à l'écran, mais aucun e-mail : le site ne dit pas qui a un compte.
3. Le lien ou le code ouvre une session. Le navigateur reçoit un cookie que le code de la page ne peut pas lire.
4. La session dure 180 jours après la dernière visite.

La base ne garde ni le code, ni le lien, ni le cookie : seulement leur empreinte. Après 5 codes faux, une demande ne vaut plus rien. Un compte ne peut pas recevoir plus de 5 e-mails par quart d'heure.

Le compte du MJ se crée tout seul la première fois que son adresse demande à se connecter. Cette adresse est celle de la boîte d'envoi (`SMTP_USER`), sauf si la variable `MJ_EMAIL` en désigne une autre. Les comptes des joueurs sont créés par le MJ.

Dans le code, un traitement réservé au MJ demande un `Mj`, un traitement de joueur demande un `Joueur`. Ces deux preuves ne sont fabriquées que par la connexion, à partir de la session.

Les e-mails partent de la boîte Gmail du MJ, par SMTP. Les identifiants sont dans les variables d'environnement du projet Vercel, repris du projet `congres-champetre`. Sans eux, les e-mails d'un aperçu ou du serveur local ne partent pas : ils sont écrits dans les journaux du serveur. Le site en ligne, lui, refuse de fonctionner sans eux.

## L'espace du joueur

Un joueur a trois destinations : la Réception, l'écritoire et sa fiche. Sur téléphone, elles sont en bas de l'écran.

### Écrire

1. L'écritoire montre combien de lettres il reste à envoyer cette semaine, et les brouillons en cours.
2. Un billet se rédige dans l'écriture du personnage. Il est sauvegardé tout seul, un instant après la dernière frappe.
3. Une jauge sans chiffre montre la place qui reste. Le billet peut déborder, mais il ne part pas tant qu'il est trop long.
4. Le joueur choisit son destinataire : un personnage de son carnet, la gazette, ou une adresse écrite librement.
5. Il choisit de signer ou non, et de sceller ou non avec un sceau qu'il détient.
6. L'envoi est définitif, après confirmation. La lettre rejoint la file du MJ avec une date de livraison proposée (le délai, plus ou moins le hasard).

Une lettre envoyée disparaît pour son auteur. Ce n'est pas un simple masquage à l'écran : le joueur ne lit et ne modifie ses lettres qu'à travers la vue `brouillons`, qui ne contient que des lettres pas encore envoyées. Dès l'envoi, la lettre n'y est plus.

### Le quota

Chaque envoi compte, quel que soit le destinataire et quoi que la lettre devienne ensuite. Les brouillons ne comptent pas. Le compte repart de zéro le lundi à 0 h, heure de Paris. Le serveur le vérifie au moment de l'envoi : l'écran ne fait que l'annoncer.

## L'espace du MJ

Le MJ arrive sur un espace à part, avec un menu. Pour l'instant il sert à préparer la partie :

- **Personnages** : créer les personnages des joueurs et les PNJ, remplir leur fiche, donner à chaque joueur son adresse e-mail (c'est ce qui lui ouvre le site), choisir son écriture, tenir son carnet d'adresses.
- **Écritures** : voir les 51 écritures fournies, les renommer, marquer celles qui sont génériques.
- **Sceaux** : créer des sceaux, changer leur nom gravé ou leurs initiales, les faire changer de mains.
- **Réglages** : longueur d'un billet, quota, délai et hasard de livraison, calendrier.

Toutes les adresses de cet espace commencent par `/api/mj` côté serveur, et chacune vérifie que c'est bien le MJ qui demande. Un joueur connecté qui essaierait d'y entrer est refusé.

### Les écritures

Une écriture est une police manuscrite fournie avec le site. La liste est dans `web/src/theme/ecritures.ts`, et la base en garde une ligne par police. Le MJ ne crée pas d'écriture : en ajouter une demande d'ajouter la police au site, puis une migration.

Les polices ne sont téléchargées par le navigateur que lorsqu'une page les affiche : en avoir beaucoup ne ralentit pas le site. Leur facteur `echelle` a été calé en mesurant la largeur d'une phrase et la hauteur des lettres de chacune, puis en vérifiant le rendu au format téléphone.

Deux joueurs ne peuvent pas avoir la même écriture : c'est la base elle-même qui le refuse.

### Les sceaux

Un sceau est un objet, avec un nom gravé qui ne change pas quand il change de mains. À la création d'un personnage, le site propose de lui créer un sceau à son nom. Dans l'habillage neutre, un sceau est dessiné comme un simple cachet portant des initiales. L'import d'une image de sceau viendra avec les images des documents.

## Les garde-fous automatiques

- **Requêtes SQL vérifiées à la compilation.** Une requête qui ne correspond pas à la base empêche le site de se construire. La vérification s'appuie sur le dossier `.sqlx/`, donc elle marche aussi sur Vercel, sans base à portée de main.
- **Types partagés.** Les types de l'interface sont générés depuis ceux du serveur. Si le serveur change une réponse, l'interface ne se construit plus tant qu'elle n'a pas suivi.

## Les essais

Le dossier `essais/` contient des parcours qui utilisent le site comme le ferait une personne, dans un vrai navigateur : se connecter, préparer la partie en MJ, écrire et envoyer en joueur. Ils vérifient aussi ce qui ne doit pas être possible : lire une lettre envoyée, lire le brouillon d'un autre, entrer chez le MJ en étant joueur, dépasser son quota.

Ils tournent contre une base locale, jamais contre la base en ligne.

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
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Le serveur d'envoi des e-mails et ses identifiants |
| `SMTP_FROM` | L'adresse d'expédition, si elle diffère de `SMTP_USER` (un alias). Facultatif |
| `MJ_EMAIL` | L'adresse qui ouvre le compte du MJ, si ce n'est pas `SMTP_USER`. Facultatif |
| `SITE_HOST` | Le nom de domaine du site, s'il ne finit pas par `.vercel.app`. Facultatif |
