# Guide de fonctionnement

Ce guide décrit comment le site est construit. Il est mis à jour à la fin de chaque étape de `PLAN.md`.
État décrit : étape 1 (squelette).

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
| `src/bin/dev.rs` | Le serveur local, pour développer |
| `.sqlx/` | La description des requêtes SQL, qui sert à les vérifier à la compilation |
| `web/` | L'interface |
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
