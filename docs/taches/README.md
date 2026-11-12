# Mode d'emploi d'une étape

Ce dossier détaille tout ce qui reste à faire pour la V1, étape par étape.
Il est écrit pour l'agent qui réalise une étape. Lire, dans cet ordre :

1. `CLAUDE.md` : les règles du projet. Elles priment sur tout ce qui suit.
2. `DECISIONS.md` : ce que fait le site, et pourquoi.
3. `PLAN.md` : l'ordre des étapes et leur état.
4. `docs/FONCTIONNEMENT.md` : comment le site est construit.
5. Ce fichier, puis le fichier de l'étape.

## L'ordre

Le MJ a choisi de lancer la partie tôt : d'abord la boucle complète du courrier et ce qu'il faut pour jouer en vrai, ensuite les outils du MJ, pendant la partie.

| Ordre | Fichier | Étape | Avant ou après le lancement |
|---|---|---|---|
| 1 | `07-le-joueur-recoit.md` | 7. Le joueur reçoit | Avant |
| 2 | `08-notifications.md` | 8. Notifications et site installable | Avant |
| 3 | `09-filet-de-securite.md` | 9. Filet de sécurité | Avant |
| 4 | `lancement.md` | L. Répétition générale et mise en jeu | C'est le lancement |
| 5 | `10-alterations.md` | 10. Altérations | Après |
| 6 | `11-documents-et-gabarits.md` | 11. Documents et gabarits | Après |
| 7 | `12-gazette.md` | 12. Gazette | Après |
| 8 | `13-vue-mj-complete.md` | 13. Vue MJ complète | Après |
| 9 | `14-finitions.md` | 14. Finitions | Après |

Une étape ne commence que lorsque la précédente est validée par le MJ et en ligne sur `main`. Si ce n'est pas le cas, s'arrêter et le dire au MJ.

## Le déroulé d'une étape

### 1. Préparer

- Mettre en place l'environnement (commandes de `CLAUDE.md`, section « Environnement de travail »). La base locale s'arrête quand la session redémarre : `pg_ctlcluster 16 main start`.
- Partir de `main` à jour, sur la branche indiquée par la session, ou à défaut sur `etape-N-<mot>`.
- Lire le code existant que l'étape touche. Les fichiers sont nommés dans chaque fiche.

### 2. Poser les questions au MJ

Chaque fiche a une section « Questions au MJ ». Les poser **avant d'écrire du code** :

- avec l'outil de questions à choix (quatre questions au plus par appel) ;
- l'option recommandée en premier, marquée « (Recommandé) » ;
- en français simple, sans jargon : le MJ ne code pas ;
- chaque question se comprend seule : le MJ ne voit que la fenêtre de question.

Noter chaque réponse dans `DECISIONS.md`, dans la section qui convient. Un choix purement technique est fait par l'agent, expliqué au MJ dans le compte rendu, et noté dans `docs/FONCTIONNEMENT.md`.

Si une question nouvelle et non triviale surgit en cours de route, la poser aussi. Ne jamais trancher seul une question qui change ce que voit un joueur ou ce que peut faire le MJ.

### 3. Écrire le code

Dans cet ordre, **sans lancer les tests pendant l'écriture** (règle du MJ : écrire et vérifier sont deux temps séparés) :

1. la migration, s'il y en a une : prochain numéro libre dans `migrations/` ;
2. le serveur ;
3. `cargo sqlx prepare` (base locale lancée), puis `cargo test` pour régénérer les types de `web/src/types/` ;
4. l'interface ;
5. le jeu de données et le parcours d'essai (`essais/jeu-<parcours>.sql`, `essais/<parcours>.cjs`), et la ligne du parcours dans `essais/lancer.sh` et `CLAUDE.md`.

### 4. Vérifier

Une fois tout écrit :

```bash
cargo +1.92.0 check            # compile comme Vercel
cargo test                     # tests, et types de l'interface
npm --prefix web run build     # types et construction de l'interface
essais/lancer.sh connexion
essais/lancer.sh preparation-mj
essais/lancer.sh ecrire
essais/lancer.sh traiter
essais/lancer.sh <parcours de l'étape>   # et ceux des étapes suivantes déjà faites
psql "$DATABASE_URL" -f essais/vue-plis-recus.sql   # après essais/vider.sql
```

- Tous les parcours, anciens compris, doivent afficher `OK` partout. Un ancien parcours qui casse parce qu'un écran a changé se met à jour ; il ne se supprime pas.
- Regarder les captures (`essais/sortie/`), **au format téléphone d'abord** : rien ne déborde à 390 px de large, les cibles font au moins 44 px.
- Corriger, puis tout relancer.

### 5. Documenter

- `PLAN.md` : l'état de l'étape dans le tableau, et la section « Pour reprendre ».
- `docs/FONCTIONNEMENT.md` : ce qui a été construit, en français simple ; la ligne « État décrit ».
- `CLAUDE.md` : seulement si une règle du code change ou s'ajoute.
- `DECISIONS.md` : les réponses du MJ.

### 6. Livrer en aperçu

- Un commit (ou quelques-uns) : titre `Étape N : <titre>`, puis une liste des changements, puis les lignes d'attribution demandées par la session.
- Pousser la branche, jamais `main`.
- Attendre la construction de l'aperçu (4 à 5 minutes) avec l'outil Vercel (`list_deployments`, équipe `brume`, projet `epistolaire`), vérifier qu'elle est `READY`, puis lire `/api/sante` sur l'adresse d'aperçu avec `web_fetch_vercel_url`.
- Faire au MJ un compte rendu court, en français : l'adresse de l'aperçu, ce qu'il peut essayer, les choix faits sans lui, ce qui n'est pas fait ou pas vérifié.

### 7. Mettre en ligne

Seulement après la validation explicite du MJ : `git push origin <branche>:main`, puis l'état « Fait » dans `PLAN.md`. Si l'outil refuse ce geste faute de permission, le dire au MJ : c'est à lui d'autoriser la mise en ligne ou de la faire.

## Les règles qu'on oublie

Elles sont toutes dans `CLAUDE.md`. Voici celles qui piègent le plus souvent.

- **Confidentialité.** Le tri se fait sur le serveur. Un joueur ne reçoit jamais : un original, le vrai auteur, une date prévue ni l'heure exacte d'un pli, un pli pas encore arrivé, une altération non remarquée, rien d'un autre joueur, rien du MJ. Dans le doute, ne pas envoyer le champ.
- **Porte des joueurs.** Tout est dans `src/acces/joueur/`, chaque traitement prend un `Joueur`. Le courrier reçu se lit dans la vue `plis_recus` et ne se modifie que par les fonctions SQL prévues pour (étape 7). Ne jamais lire `plis` ni `exemplaires` depuis ce dossier, sauf les deux exceptions de `ecritoire.rs`.
- **Livraison.** Un pli est arrivé dès que sa date est passée. Aucune tâche ne « livre ». Les tâches planifiées ne servent qu'aux notifications et à la sauvegarde.
- **Exemplaires.** Ils ne se créent que par `poser_exemplaire` (`src/acces/mj/acheminement.rs`). Chaque geste du MJ sur un pli s'inscrit dans l'historique avec `noter`. Un exemplaire arrivé ne se modifie plus.
- **Migrations.** Un fichier nouveau par changement ; jamais modifier un fichier déjà poussé ; jamais supprimer une colonne ou une table qui contient du courrier. Avant le lancement, les aperçus partagent la base du site en ligne : une migration poussée s'applique aussi au site en ligne.
- **Rust 1.92.** Avant d'ajouter une bibliothèque : `cargo info <nom>` et lire `rust-version`. Elle doit être inférieure ou égale à 1.92. Vérifier aussi qu'elle n'a pas besoin d'OpenSSL du système (`cargo tree -i openssl-sys` ne doit rien trouver) : Vercel compile sans.
- **SQL vérifié.** Après tout changement de requête : `cargo sqlx prepare`, et commiter `.sqlx/`.
- **Types générés.** Ne jamais écrire à la main dans `web/src/types/`.
- **Thème.** Les écrans des joueurs prennent tous leurs mots dans `web/src/theme/neutre.ts` et toutes leurs couleurs dans les variables du thème. Les écrans du MJ écrivent leurs libellés en clair.
- **Secrets.** Jamais dans le dépôt. Les nouvelles variables d'environnement sont listées dans `docs/FONCTIONNEMENT.md` (nom et rôle, jamais la valeur) et ajoutées par le MJ dans Vercel.

## Les habitudes du code

À suivre pour que le code reste homogène.

### Serveur

- Le vocabulaire est français et celui de `DECISIONS.md` : pli, exemplaire, sceau, carnet, gazette, réception, dossier…
- Chaque fichier commence par un commentaire `//!` qui dit son rôle et ses règles.
- Un refus montrable à l'utilisateur : `Erreur::Refus("Phrase complète.")`. Une contrainte de la base traduite en refus : `refus_de_la_base(...)`. Aucun `unwrap()` dans un traitement.
- Plusieurs écritures liées : une transaction. Un changement d'état disputé : `select … for update`.
- Les structures échangées avec l'interface portent `#[derive(Serialize/Deserialize, TS)]` et `#[ts(export)]`.
- Les routes sont déclarées dans `src/acces/joueur/mod.rs` et `src/acces/mj/mod.rs`.

### Interface du MJ

- Lecture : `useLecture<T>(chemin)`. Envoi : `appeler`, `modifier`, `supprimer` (`web/src/api.ts`).
- Mise en page : `Entete`, `Section`, `Champ`, `Attente`, `Confirmation` (`web/src/mj/commun.tsx`) ; le courrier : `Lettre`, `ChoixPersonnage`, `ComposerBillet`, `Pastille`, `NouveauPnj`, les dates (`web/src/mj/courrier.tsx`).
- Messages brefs : `toast` (sonner).
- Composants : ceux de `web/src/components/ui/`. Pour en ajouter un : `npx shadcn@latest add <nom>` depuis `web/`.

### Interface des joueurs

- Pensée d'abord pour le téléphone (390 px), immersive, sobre.
- Tous les mots viennent de `vocabulaire` (`web/src/theme/neutre.ts`).
- Les écritures : le composant `Main` et `policeDe` (`web/src/theme/ecritures.ts`). Les sceaux : `Cachet`.
- Les animations respectent `prefers-reduced-motion`.

### Parcours d'essai

- Un jeu de données SQL (`essais/jeu-<parcours>.sql`) avec des identifiants fixes et lisibles (`…a1` pour les personnages, `…c1` pour les sceaux, `…d1` pour les plis).
- Un script Playwright (`essais/<parcours>.cjs`) qui écrit `OK` ou `ECHEC` pour chaque vérification : reprendre la structure de `essais/traiter.cjs`, ses fonctions `connecter`, `choisir` et `sql`.
- Les listes déroulantes : une liste refermée reste un instant dans la page, il faut viser la dernière option visible (voir `choisir` dans `essais/traiter.cjs`).
- Les captures : `deviceScaleFactor: 1`, nommées `eN-<écran>.png`, téléphone (`eN-tel-…`) et ordinateur.
- Chaque parcours vérifie aussi ce qui **ne doit pas** marcher : un autre joueur, un joueur à la porte du MJ, un geste répété.

## Relecture

Chaque fiche se termine par « Points à relire ». Ce sont les endroits où une erreur se paie cher : confidentialité, pertes de données, chiffrement. Si l'agent qui a fait l'étape n'est pas le plus avancé disponible, faire relire ces points par un agent plus avancé avant de livrer l'aperçu.

## Découper une étape entre plusieurs agents

C'est possible, mais une étape reste cohérente si un seul agent la mène. Si on la découpe :

- la base et le serveur d'abord, par un seul agent, jusqu'à `cargo sqlx prepare` et `cargo test` (types générés) ;
- ensuite, en parallèle : l'interface, et le jeu de données avec le parcours d'essai ;
- enfin, un seul agent pour la vérification complète, la documentation et la livraison.
