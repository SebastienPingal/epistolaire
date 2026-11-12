# Étape 10 : altérations

Après le lancement : de vrais joueurs utilisent le site. Toute migration doit pouvoir s'appliquer sans perdre ni déformer un pli en route.

## Ce que le MJ verra

Avant qu'un pli n'arrive, le MJ peut le falsifier :

- réécrire le texte librement ;
- abîmer un passage ;
- trafiquer le sceau (brisé, recollé, contrefait) ;
- retirer ou contrefaire la signature.

Pour chaque destinataire, il décide si l'altération est remarquée. Le site repère seul les passages réécrits. L'original et l'historique restent visibles du seul MJ.

## Déjà décidé

Voir `DECISIONS.md`, sections « Altérations », « Expéditeur, sceau, signature et écriture » et « Traitement par le MJ ».

- Par défaut, rien n'est remarqué : tout paraît normal.
- Une altération remarquée : les passages réécrits et la signature paraissent dans la main du faussaire, le sceau montre qu'il a été trafiqué. Aucun message ne l'explique.
- Le MJ choisit la main du faussaire : un personnage précis, ou une main inconnue.
- Un passage abîmé est toujours visible, remarqué ou non.
- Seul le MJ peut contrefaire une signature.
- La vue `plis_recus` applique déjà ces règles pour le sceau, la signature et les passages réécrits (voir `essais/vue-plis-recus.sql`). Il manque les passages abîmés.

## Questions au MJ

1. **La main inconnue.** « Quand le faussaire n'est personne de connu, dans quelle écriture paraissent ses passages, s'ils sont remarqués ? »
   - (Recommandé) Une écriture que vous choisissez à chaque fois, parmi celles qu'aucun personnage n'utilise. · Une seule écriture réservée, toujours la même, pour toutes les mains inconnues.
2. **Un passage abîmé.** « À quoi ressemble un passage abîmé pour le joueur ? »
   - (Recommandé) Une tache : on voit qu'il y avait du texte, on ne peut pas le lire. · Des lettres manquantes : certains mots restent à moitié lisibles, selon ce que vous laissez.
3. **Quand altérer.** « Où pouvez-vous altérer une lettre ? »
   - (Recommandé) Au traitement (la version altérée part vers tous les destinataires) et dans En route (pour un seul destinataire, jusqu'à l'arrivée). · Seulement dans En route.
4. **Une lettre entièrement fausse.** « Pouvez-vous écrire une lettre complète au nom d'un joueur, avec sa signature contrefaite ? »
   - (Recommandé) Oui : dans l'écran Écrire, « au nom de » propose aussi les joueurs ; non remarquée, la lettre paraît de sa main ; remarquée, de la main du faussaire. · Non, pas en V1.

## Tâches

### 10.1 Base de données (une migration)

- `exemplaires.passages_abimes jsonb not null default '[]'` : les passages abîmés de la version livrée.
- `exemplaires.faussaire_personnage_id uuid references personnages (id) on delete restrict` : qui a falsifié ; vide pour une main inconnue. Reste au MJ.
- Le format d'un passage, le même partout : `{ "champ": "texte", "debut": 12, "fin": 30 }`.
  - `debut` et `fin` comptent en **caractères Unicode** (ce que compte `chars()` en Rust), `fin` exclue.
  - `champ` nomme la case du gabarit ; à l'étape 11, d'autres cases que `texte` apparaîtront.
  - Les passages déjà enregistrés sans `champ` valent `"texte"`.
- La vue `plis_recus` : `create or replace view` qui **ajoute en dernière position** la colonne `passages_abimes` (toujours transmise, remarquée ou non). PostgreSQL n'accepte que l'ajout de colonnes en fin de vue : ne rien réordonner.
- Si le MJ choisit la réponse 4 « oui » : un pli peut avoir pour `auteur_id` un joueur avec `redige_par_mj = true`. Vérifier que le quota (`cadre` dans `ecritoire.rs`) ne compte pas ces lettres : il filtre déjà `not redige_par_mj`. Le dire dans un commentaire.

### 10.2 Le repérage des passages réécrits (`src/acces/mj/alterations.rs`)

- Comparer le texte original (`plis.contenu`) et le texte livré, **mot par mot**, avec la bibliothèque `similar` (`rust-version` 1.85).
- Tout mot inséré ou remplacé dans la version livrée devient un passage réécrit ; des mots voisins fusionnent en un seul passage.
- Un mot simplement supprimé ne laisse rien à montrer : pas de passage. L'écran du MJ le signale (« les suppressions ne se voient pas »).
- Les positions sont converties en caractères Unicode.
- Tests unitaires : une phrase modifiée au milieu, au début, à la fin ; avec des accents et des émojis ; un texte inchangé (aucun passage).

### 10.3 Serveur, côté MJ

- `GET /api/mj/exemplaires/{id}` : tout l'exemplaire. L'original (texte, sceau, signature, auteur), la version livrée, les états, les passages, la main du faussaire, ce qui est remarqué, la date, et l'historique (`evenements` de cet exemplaire et de son pli).
- `PUT /api/mj/exemplaires/{id}/version` : la nouvelle version livrée.
  - Le corps : `texte`, `passages_abimes`, `sceau_id` et `sceau_etat`, `signature_etat` et `signature_nom` et `signature_personnage_id`, `faussaire_personnage_id` ou `faussaire_ecriture_id`, `remarque_texte`, `remarque_sceau`, `remarque_signature`.
  - Refus si l'exemplaire est arrivé.
  - Le serveur recalcule `passages_reecrits` et vérifie les passages abîmés (dans les limites du texte, sans chevauchement).
  - Une ligne d'historique (`noter`), avec l'avant et l'après.
- Au traitement (si question 3 = recommandé) : `Traitement` reçoit un champ facultatif `version`, appliqué à tous les exemplaires créés, sans rien de remarqué. On décide ensuite, destinataire par destinataire, dans En route.
- Lettre entièrement fausse (si question 4 = oui) : `POST /api/mj/lettres` accepte un joueur comme auteur.
  - La lettre est écrite dans l'écriture du joueur et signée de son nom (`signature_etat = 'contrefaite'`) ; le faussaire est désigné.
  - Non remarquée, la vue la montre de la main du joueur. Remarquée, le texte entier est un passage réécrit, dans la main du faussaire.
- Le sceau contrefait : le MJ choisit le sceau imité parmi tous les sceaux ; l'exemplaire pointe vers lui avec l'état `contrefait`. Un pli non scellé peut recevoir un sceau contrefait.

### 10.4 Serveur, porte des joueurs

- `PliOuvert` reçoit `passages_abimes`.
- **Les passages abîmés ne quittent jamais le serveur en clair.** Dans `courrier.rs`, avant d'envoyer, remplacer chaque caractère d'un passage abîmé par un caractère neutre (par exemple `·`), en gardant la longueur. Selon la réponse 2, laisser certains caractères visibles ; le MJ les choisit, et le serveur ne garde que ceux-là.
- Un test (étape 9) : le texte abîmé ne figure dans aucune réponse.

### 10.5 Interface du MJ

- Un écran `web/src/mj/Alteration.tsx`, ouvert depuis En route (« Altérer ») et depuis le traitement d'une lettre :
  - l'original à gauche, en lecture seule ; la version livrée à droite, modifiable (côte à côte sur ordinateur, l'un sous l'autre sur téléphone) ;
  - les différences surlignées pendant la frappe (aperçu calculé dans le navigateur, par exemple avec la bibliothèque `diff` ; le calcul qui compte est celui du serveur, à l'enregistrement) ;
  - « Abîmer » : sélectionner un passage dans la version livrée, puis le bouton. Attention : la sélection d'un champ de texte compte en unités UTF-16 ; la convertir en caractères Unicode avant l'envoi (`Array.from(texte.slice(0, position)).length`) ;
  - le sceau : intact, brisé, recollé, contrefait (et le sceau imité) ;
  - la signature : intacte, retirée, contrefaite (et le nom signé) ;
  - le faussaire : un personnage, ou une main inconnue avec son écriture ;
  - « Remarqué par ce destinataire » : trois interrupteurs (texte, sceau, signature), éteints par défaut ;
  - un aperçu « Ce que verra le destinataire », avec le rendu des joueurs (`BilletLu`).
- Dans En route, un repère sur les plis altérés.

### 10.6 Interface des joueurs

- `BilletLu` : les passages réécrits remarqués dans l'écriture du faussaire ; les passages abîmés selon la réponse 2, toujours.
- `Cachet` reçoit `etat` :
  - brisé : une fêlure ;
  - recollé : une ligne de cire plus sombre ;
  - contrefait : un cachet très légèrement différent (bord irrégulier, initiales décalées).
  - Les couleurs passent par les variables du thème ; le rendu est discret, sans texte.
- Aucun message n'explique l'altération.

### 10.7 Parcours d'essai `alterer`

Un pli d'Alix à Bertrand, avec une copie pour Clémence :

- le MJ réécrit une phrase, abîme un passage, recolle le sceau, contrefait la signature, avec Clémence pour faussaire ;
- remarqué par Bertrand (texte, sceau, signature), non remarqué par Clémence.

Vérifications :

- Les passages réécrits sont repérés au bon endroit.
- Bertrand voit la phrase réécrite et la signature dans l'écriture de Clémence, et le sceau recollé.
- Clémence voit tout dans l'écriture d'Alix, le sceau intact.
- Les deux voient le passage abîmé, et le texte abîmé n'est dans aucune réponse.
- Le texte original n'est dans aucune réponse de joueur.
- Un exemplaire arrivé ne s'altère plus.
- L'historique garde l'avant et l'après.
- Mettre à jour `essais/vue-plis-recus.sql` (passages abîmés) et les tests de confidentialité de l'étape 9 (original, abîmé, non remarqué).
- Captures : l'écran d'altération au téléphone et sur ordinateur ; les deux lettres ouvertes côte à côte.

### 10.8 Documentation

`docs/FONCTIONNEMENT.md` (« Les altérations », le format des passages), `DECISIONS.md` (les réponses), `PLAN.md`.

## Pièges

- Les positions : caractères Unicode côté serveur, unités UTF-16 côté navigateur. Les convertir à chaque passage de frontière.
- Ne jamais modifier `plis.contenu` : c'est l'original.
- La vue se modifie par ajout de colonne en fin, jamais en réordonnant.

## Points à relire

- La vue et `essais/vue-plis-recus.sql` : rien de non remarqué ne passe.
- Le masquage des passages abîmés.
- La conversion des positions.

## Terminé quand

Tous les parcours passent, `alterer` compris ; les tests de confidentialité couvrent les altérations ; le MJ a falsifié une lettre sur l'aperçu.
