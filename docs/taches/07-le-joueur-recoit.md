# Étape 7 : le joueur reçoit

## Ce que le MJ verra

Une lettre fait le tour complet : un joueur écrit, le MJ la met en route, elle arrive à sa date dans la Réception du destinataire. Elle y est fermée, avec son sceau. Le joueur l'ouvre d'un geste, la lit dans l'écriture de son auteur, et la range dans ses dossiers. Les dates sont celles du calendrier du jeu.

C'est le premier moment où le jeu s'essaie pour de vrai.

## Déjà décidé

Voir `DECISIONS.md`, sections « Espace joueur », « Rendu », « Données ».

- La Réception reçoit tout le courrier, par ordre d'arrivée. Chaque pli arrive fermé.
- Un pli ne se trouve qu'à un seul endroit : la Réception ou un dossier du joueur.
- L'ouverture se fait par un geste : glisser le doigt sur le sceau sur téléphone, cliquer et maintenir sur ordinateur. Un pli sans sceau se déplie de la même façon.
- Le sceau se voit avant l'ouverture, avec le nom gravé de son propriétaire d'origine.
- Seules les dates s'affichent, sans l'heure : la date d'écriture sur la lettre, la date d'arrivée dans la Réception.
- **Calendrier** (décidé le 12 novembre) : les mois ont la longueur des vrais mois. Le premier jour du jeu est le « 1er jour du 1er mois, an 1 », puis le temps avance comme dans le calendrier réel à partir d'un 1er janvier : le 1er mois a 31 jours, le 2e en a 28, etc. Un jour réel vaut un jour de jeu ; le jour change à minuit, heure de Paris.
- **Carnet** (décidé le 12 novembre) : à l'ouverture d'un pli, le carnet du joueur s'enrichit du propriétaire d'origine du sceau et de la personne qui signe, s'ils sont visibles et s'il ne les connaît pas déjà.

## Questions au MJ

À poser avant de coder.

1. **Bonds dans le temps.** « Quand vous faites un bond dans le temps, les dates des plis déjà reçus changent-elles ? »
   - (Recommandé) Non : chaque bond compte à partir du jour où vous le faites. Les plis déjà reçus gardent leur date.
   - Oui : un seul total de jours ajoutés, qui décale aussi les dates passées. C'est ce que fait le réglage actuel.
2. **Supprimer un dossier.** « Un joueur supprime un dossier qui contient des plis. Que deviennent-ils ? »
   - (Recommandé) Ils reviennent dans la Réception.
   - La suppression est refusée tant que le dossier n'est pas vide.
3. **Ressortir un pli.** « Un pli rangé dans un dossier peut-il revenir dans la Réception ? »
   - (Recommandé) Oui, le joueur le déplace librement, Réception comprise.
   - Non, un pli rangé reste dans un dossier.

Le geste d'ouverture n'est pas une question : l'agent réalise la proposition ci-dessous, et le MJ en juge sur l'aperçu.

## Tâches

### 7.1 Base de données (une migration, par exemple `0005_reception.sql`)

1. **Qui signe.** Ajouter `exemplaires.signature_personnage_id uuid references personnages (id) on delete restrict`. Le remplir pour l'existant : l'auteur du pli quand `signature_etat = 'intacte'`. Il sert au carnet et, à l'étape 10, aux signatures contrefaites. Ne jamais le faire sortir vers un joueur.
2. **Bonds datés** (si le MJ choisit la réponse recommandée à la question 1). Table `bonds_calendrier (id uuid, a_partir_du date not null, jours integer not null, note text not null default '', cree_le timestamptz)`. Y reporter l'existant : si `reglages.calendrier_bonds <> 0`, une ligne `(calendrier_debut, calendrier_bonds)`. Garder la colonne `calendrier_bonds` (on ne supprime pas de colonne) mais ne plus s'en servir, et le dire dans un commentaire de la migration.
3. **Les deux gestes du joueur sur son courrier**, sous forme de fonctions SQL. Ainsi la porte des joueurs ne touche jamais la table `exemplaires` : elle appelle une fonction qui vérifie, par la vue `plis_recus`, que le pli est arrivé et qu'il est bien à ce joueur.
   - `ouvrir_pli(p_exemplaire uuid, p_destinataire uuid) returns boolean` :
     - renvoie `false` si `(p_exemplaire, p_destinataire)` n'est pas dans `plis_recus` ;
     - à la **première** ouverture seulement (`ouvert_le is null`) : `ouvert_le = now()`, puis ajoute au carnet (`insert into contacts … on conflict do nothing`) :
       - le `proprietaire_origine_id` du sceau de l'exemplaire, avec l'origine `'sceau'` ;
       - le `signature_personnage_id`, avec l'origine `'signature'`, si `signature_etat` est `'intacte'` ou `'contrefaite'` ;
       - jamais le joueur lui-même, jamais une valeur vide ;
     - renvoie `true`. Une deuxième ouverture ne change rien et renvoie `true`.
   - `ranger_pli(p_exemplaire uuid, p_destinataire uuid, p_dossier uuid) returns boolean` : renvoie `false` si le pli n'est pas dans `plis_recus` pour ce joueur, ou si `p_dossier` n'est ni vide ni un dossier de ce joueur. Sinon, met `dossier_id = p_dossier` (vide : la Réception).
4. **Supprimer un dossier.** La clé `dossier_id … on delete set null` renvoie déjà les plis dans la Réception. Si le MJ a choisi de refuser la suppression d'un dossier non vide, le vérifier dans le serveur.

### 7.2 Le calendrier (`src/calendrier.rs`)

- `#[derive(Serialize, TS)] pub struct DateJeu { pub an: i32, pub mois: u32, pub jour: u32 }`.
- `pub fn date_du_jeu(jour_reel: NaiveDate, debut: NaiveDate, bonds: &[(NaiveDate, i32)]) -> DateJeu` :
  - `n` = jours écoulés entre `debut` et `jour_reel`, plus la somme des bonds dont `a_partir_du <= jour_reel` ;
  - la date du jeu est le 1er janvier de l'an 1 (`NaiveDate::from_ymd_opt(1, 1, 1)`) plus `n` jours ; on en lit l'an, le mois et le jour ;
  - si `n < 0` (avant le début du jeu), on renvoie le 1er jour du 1er mois de l'an 1.
- Une fonction qui lit les réglages et les bonds une fois par requête, pour convertir plusieurs dates.
- Le jour réel est pris **à Paris** : en SQL, `(horodatage at time zone r.fuseau)::date`. Pas de nouvelle bibliothèque de fuseaux.
- Tests unitaires : `n = 0` → 1/1/1 ; `n = 31` → 1/2/1 ; `n = 59` → 1/3/1 ; `n = 365` → 1/1/2 ; un bond de 10 jours avant et après sa date ; une date avant le début.

### 7.3 Serveur, porte des joueurs

Dans `src/acces/joueur/courrier.rs` (le reste du courrier) et un nouveau `src/acces/joueur/dossiers.rs`.

| Route | Rôle |
|---|---|
| `GET /api/joueur/reception` | Les plis de la Réception (sans dossier), les dossiers du joueur, le nombre de plis non ouverts |
| `GET /api/joueur/dossiers/{id}` | Les plis d'un dossier du joueur |
| `POST /api/joueur/plis/{id}/ouverture` | Appelle `ouvrir_pli`, renvoie le pli ouvert. 404 si `false` |
| `GET /api/joueur/plis/{id}` | Le pli ouvert. Refus si le pli n'a pas encore été ouvert : le contenu ne part qu'à l'ouverture |
| `PUT /api/joueur/plis/{id}/dossier` | Appelle `ranger_pli`. Corps : `{ dossier_id: uuid \| null }` |
| `POST /api/joueur/dossiers` | Crée un dossier. Nom de 1 à 60 caractères, 30 dossiers au plus, nom unique pour ce joueur |
| `PUT /api/joueur/dossiers/{id}` | Renomme un dossier du joueur |
| `DELETE /api/joueur/dossiers/{id}` | Supprime un dossier du joueur |

Les structures :

- `PliFerme` (elle existe : la reprendre) : `id`, `gabarit`, `arrive_le: DateJeu` **à la place de l'horodatage**, `ouvert: bool`, `dossier_id`, `sceau: Option<SceauVu>`. Le tri par heure d'arrivée se fait en SQL (`order by arrive_le desc`) ; l'heure ne sort jamais.
- `PliOuvert` : `id`, `gabarit`, `ecrit_le: DateJeu`, `arrive_le: DateJeu`, `texte`, `police: Option<String>` (l'écriture du texte), `signature: Option<SignatureVue { nom, police }>`, `sceau: Option<SceauVu>`, `passages_reecrits: Vec<Passage>` et `police_reecriture: Option<String>`, `dossier_id`. Les passages seront vides jusqu'à l'étape 10, mais le rendu sait déjà les afficher.
- `Dossier` : `id`, `nom`, `nombre: i64`.
- Les polices s'obtiennent en joignant `plis_recus` à la table `ecritures` (une écriture n'est pas un secret).

Règles :

- Toute lecture de courrier passe par `plis_recus`, filtrée sur `joueur.personnage_id()`.
- Toute modification passe par `ouvrir_pli` ou `ranger_pli`. Les dossiers, eux, appartiennent au joueur : leur table se lit et s'écrit directement, toujours filtrée sur `proprietaire_id`.
- Mettre à jour la règle « Porte des joueurs » dans `CLAUDE.md` et le commentaire de tête de `src/acces/joueur/mod.rs` : le courrier reçu se lit dans `plis_recus` et ne se modifie que par `ouvrir_pli` et `ranger_pli`.

### 7.4 Serveur, côté MJ

- Réglages : la date du jeu d'aujourd'hui (« Aujourd'hui dans le jeu »), et la gestion des bonds datés (lister, ajouter, retirer), si le MJ les a choisis. Routes sous `/api/mj/reglages/bonds`.
- `poser_exemplaire` remplit `signature_personnage_id` (l'auteur, quand le pli est signé).

### 7.5 Interface des joueurs (`web/src/joueur/`)

- **Dates** : `vocabulaire.date(d: DateJeu)` dans `web/src/theme/neutre.ts`, qui écrit « 12e jour du 3e mois, an 1 », et « 1er » pour le premier.
- **`Reception.tsx`** : la liste des plis fermés ou ouverts, du plus récent au plus ancien. Chaque pli est une petite enveloppe de papier : le cachet (ou son absence), la date d'arrivée, un repère discret s'il n'est pas ouvert. Au-dessus : la Réception et les dossiers du joueur (un menu ou des onglets), et « Nouveau dossier ». Le message « Aucun pli ne vous attend » reste quand la Réception est vide.
- **`Pli.tsx`** (route `/pli/:id`) :
  - fermé : le pli plié, le cachet au centre, et le geste d'ouverture ;
  - ouvert : la lettre, et une action « Ranger » (choisir un dossier, ou la Réception).
- **`Ouverture.tsx`**, le geste :
  - au doigt : glisser horizontalement sur le cachet ou sur la pliure, sur au moins 60 % de sa largeur. Le cachet suit le doigt, puis se brise ou la feuille se déplie. En dessous de ce seuil, il revient à sa place ;
  - à la souris : maintenir le bouton environ 0,8 seconde. Un anneau se remplit autour du cachet ; relâcher avant annule ;
  - au clavier : maintenir Espace ou Entrée sur le cachet (qui reçoit le focus), comme à la souris ;
  - mettre `touch-action: none` sur la zone du geste, sinon le doigt fait défiler la page ;
  - animations réduites : pas d'animation, la lettre apparaît dès le geste fini ;
  - l'appel à `/ouverture` part à la fin du geste ; la lettre s'affiche avec ce que le serveur renvoie.
- **La lettre ouverte** : un composant réutilisable `web/src/composants/gabarits/BilletLu.tsx`, qui servira aussi au MJ (étape 13) et aux autres gabarits (étape 11). Il affiche :
  - la feuille, le texte dans l'écriture de l'auteur (`Main`) ;
  - la date d'écriture en haut ;
  - la signature sous le texte, dans sa propre écriture ;
  - le cachet ;
  - les passages réécrits dans l'écriture du faussaire, s'il y en a.
- **Navigation** : un pli s'ouvre depuis la Réception et depuis un dossier ; le retour ramène d'où l'on vient.
- **Vocabulaire** : tous les mots nouveaux dans `vocabulaire.reception`, `vocabulaire.pli` et `vocabulaire.dossiers`.

### 7.6 Interface du MJ

- Dans Réglages, section « Calendrier du jeu » : la date du jeu d'aujourd'hui, et la liste des bonds (s'ils sont datés) avec un formulaire pour en ajouter un.

### 7.7 Parcours d'essai `recevoir`

Jeu de données `essais/jeu-recevoir.sql` : Alix, Bertrand, Clémence (joueurs), un PNJ ; des plis et exemplaires posés directement en SQL, comme dans `essais/vue-plis-recus.sql` :

- (a) Bertrand à Alix, signé et scellé (sceau de Bertrand), arrivé hier ;
- (b) un pli anonyme, ni signé ni scellé, arrivé il y a deux jours ;
- (c) un pli pour Alix, en route jusqu'à demain ;
- (d) un pli retenu pour Alix ;
- (e) un pli perdu pour Alix ;
- (f) un pli arrivé pour Bertrand.

Vérifications dans `essais/recevoir.cjs` :

- La Réception d'Alix ne montre que (a) et (b), le plus récent en premier. Ni (c), ni (d), ni (e), ni (f).
- La réponse de `/api/joueur/reception` ne contient ni texte, ni nom d'auteur, ni horodatage (aucune chaîne de la forme `2026-11-12T`), ni identifiant de personnage autre que ceux de ses dossiers.
- `GET /api/joueur/plis/(a)` avant l'ouverture : refusé, et sans texte.
- Au téléphone (contexte avec `hasTouch: true`), glisser sur le cachet de (a) ouvre le pli. Un glissement trop court ne l'ouvre pas.
- Sur ordinateur, maintenir le clic ouvre (b). Un clic bref ne l'ouvre pas.
- Le pli ouvert montre le texte dans l'écriture de Bertrand, sa signature, son cachet, la date d'écriture du jeu, et aucune heure.
- Après l'ouverture de (a), Bertrand est dans le carnet d'Alix (`/api/joueur/ecritoire`). Ouvrir (b) n'ajoute personne. Rouvrir (a) n'ajoute rien de plus.
- Ouvrir (c), (d), (e) ou (f) : 404. Ranger (f) : 404.
- Dossiers : créer « Intrigues », y ranger (a) : (a) quitte la Réception et apparaît dans le dossier. Le ressortir, si le MJ l'a permis. Supprimer le dossier : (a) revient dans la Réception.
- Bertrand ne voit, ne renomme, ne supprime pas le dossier d'Alix, et ne peut pas y ranger un pli (404).
- Un pli mis en route par le MJ dans l'interface (validation dans la file, puis date avancée dans le passé avec `PUT /api/mj/exemplaires/{id}`) arrive dans la Réception.
- Avec `reducedMotion: 'reduce'`, l'ouverture marche, sans animation.
- Captures : `e7-tel-reception.png`, `e7-tel-pli-ferme.png`, `e7-tel-geste.png` (au milieu du glissement), `e7-tel-pli-ouvert.png`, `e7-tel-dossiers.png`, `e7-ordi-reception.png`, `e7-ordi-pli-ouvert.png`.

Mettre aussi à jour `essais/ecrire.cjs` si l'écran de Réception a changé.

### 7.8 Documentation

- `docs/FONCTIONNEMENT.md` : une partie « Recevoir » (Réception, ouverture, dossiers, carnet), une partie « Le calendrier du jeu », et les deux fonctions SQL dans « La porte des joueurs ».
- `PLAN.md`, `CLAUDE.md` (règle de la porte des joueurs).

## Pièges

- Ne jamais envoyer un horodatage de pli au joueur : seulement des `DateJeu`. Le tri se fait sur le serveur.
- L'ouverture n'ajoute au carnet qu'**à la première fois**.
- Les exemplaires remis à un PNJ sont déjà ouverts (étape 6) : ils n'apparaissent jamais dans une Réception, puisqu'aucun joueur n'est ce PNJ.
- Le geste au doigt : sans `touch-action: none`, la page défile au lieu d'ouvrir.
- Les textes d'un pli peuvent contenir des retours à la ligne : `whitespace-pre-wrap`.

## Points à relire

- Les deux fonctions SQL : impossible d'ouvrir ou de ranger le pli d'un autre, ou un pli pas encore arrivé.
- Aucune réponse de `/api/joueur/…` ne contient d'horodatage de pli, de vrai auteur, ni de pli non arrivé.
- Le calcul du calendrier (tests unitaires) et le jour pris à Paris.

## Terminé quand

- Tous les parcours passent (anciens et `recevoir`), la vue est vérifiée par `essais/vue-plis-recus.sql`.
- Les captures au téléphone sont propres.
- L'aperçu est construit, et le MJ a pu faire faire le tour complet à une lettre.
