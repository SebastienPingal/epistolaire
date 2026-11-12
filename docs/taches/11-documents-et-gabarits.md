# Étape 11 : documents et gabarits

Après le lancement.

## Ce que le MJ verra

Un seul outil pour tout ce qu'il envoie. Il choisit un gabarit (billet, lettre longue, gazette, acte officiel, rapport, carte ou illustration), un expéditeur, remplit les cases, ajoute des images, choisit plusieurs destinataires avec une date pour chacun. Les joueurs reçoivent leur exemplaire comme un pli ordinaire.

L'import d'une image de sceau, reporté depuis l'étape 4, est fait ici.

## Déjà décidé

Voir `DECISIONS.md`, sections « PNJ et documents » et « Rendu ».

- Un document peut avoir plusieurs destinataires, qui reçoivent chacun leur exemplaire. Même date par défaut, ajustable pour chacun.
- Ses plis arrivent comme les autres. Ils peuvent aussi être des faux, avec les outils de l'étape 10.
- Une lettre de PNJ suit par défaut les règles des joueurs ; le MJ peut choisir un autre gabarit et dépasser la limite.
- Les gabarits sont fixes : chacun a ses cases, certaines se répètent. Ils s'adaptent à la longueur du contenu.
- Les six gabarits et leurs cases :
  - **billet** : texte, signature, sceau ;
  - **lettre longue** : lieu et date, texte, signature, sceau ;
  - **gazette** : titre, numéro, date, articles répétables, courrier des lecteurs ;
  - **acte officiel** : autorité, objet, texte, formule finale, signature, sceau ;
  - **rapport** : titre, auteur, rubriques répétables ;
  - **carte ou illustration** : image, titre, légende.

## Questions au MJ

1. **Sans expéditeur.** « Un document peut-il n'avoir aucun expéditeur, comme une carte trouvée ou une affiche ? »
   - (Recommandé) Oui. · Non, il y a toujours un PNJ ou une institution.
2. **Destinataires.** « Un document peut-il être adressé à un PNJ, ou seulement aux joueurs ? »
   - (Recommandé) Seulement aux joueurs : un PNJ n'a pas besoin de recevoir pour que vous sachiez. · Aussi aux PNJ.
3. **Écriture des gabarits.** « Quels gabarits sont écrits à la main, et lesquels sont imprimés ? »
   - (Recommandé) À la main : billet, lettre longue, acte officiel (dans l'écriture de l'expéditeur). Imprimés : gazette, rapport, légende de la carte. · Tous à la main sauf la gazette.
4. **Images.** « Les images (cartes, illustrations, sceaux) ne doivent être visibles que de leurs destinataires, une fois le pli arrivé. Cela demande de les servir par le site plutôt que par une adresse publique, un peu plus lent. D'accord ? »
   - (Recommandé) Oui, confidentialité d'abord. · Non, une adresse publique impossible à deviner suffit.

## Tâches

### 11.1 Les contenus

- Dans `src/modele.rs` ou un nouveau `src/gabarits.rs`, une structure par gabarit, toutes exportées vers l'interface :
  - `Billet { texte }` ;
  - `LettreLongue { lieu_et_date, texte }` ;
  - `GazetteContenu { titre, numero, date, articles: Vec<Article { titre, texte }>, courrier: Vec<LettreLecteur { texte, signature: Option<String> }> }` (servira à l'étape 12) ;
  - `Acte { autorite, objet, texte, formule_finale }` ;
  - `Rapport { titre, auteur, rubriques: Vec<Rubrique { titre, texte }> }` ;
  - `Carte { image: Uuid, titre, legende }`.
- Un `enum Contenu`. Il se lit à partir de la colonne `plis.gabarit` et du JSON de `contenu`, sans changer les lignes existantes : un billet existant (`{ "texte": … }`) reste valable tel quel.
- Une validation par gabarit (cases obligatoires non vides, longueurs raisonnables, au moins un article ou une rubrique).
- La signature, le sceau et l'écriture restent dans les colonnes communes de `plis` et `exemplaires`.
- Les altérations (étape 10) visent une case par son chemin : `texte`, `articles.2.texte`, `rubriques.0.titre`… Étendre le repérage et le masquage à toutes les cases de texte.

### 11.2 Les images

- Table `images (id, chemin_blob, type_mime, taille, largeur, hauteur, cree_le)`.
- `POST /api/mj/images` : envoi d'un fichier (fonction `multipart` d'axum), 4 Mo au plus (Vercel refuse les corps de plus de 4,5 Mo). Dans le navigateur, réduire l'image à 2 000 px de côté au plus avant l'envoi.
- Le fichier va dans Blob, en accès privé si possible (selon la question 4 et l'étape 9).
- Joueur : `GET /api/joueur/plis/{id}/images/{image}` sert l'image seulement si l'exemplaire est dans `plis_recus` pour ce joueur, ouvert, et si son contenu cite cette image. Sinon, 404.
- Sceau : `POST /api/mj/sceaux/{id}/image` remplit `sceaux.image_url` avec l'identifiant de l'image. Le sceau se voit sur un pli fermé : `GET /api/joueur/plis/{id}/sceau` sert son image si le pli est dans `plis_recus` pour ce joueur.
- `Cachet` affiche l'image quand le sceau en a une, en gardant les états de l'étape 10.

### 11.3 Serveur, l'outil unique

- `POST /api/mj/documents` :
  - le corps : `auteur_id` (facultatif selon la question 1), `gabarit`, `contenu`, `signe`, `sceau_id`, `ecriture_id` (pour un PNJ qui n'en a pas), `destinataires: [{ personnage_id, livraison_le }]` ;
  - un pli (`redige_par_mj`), et un exemplaire par destinataire avec `poser_exemplaire` ;
  - la date par défaut (délai et hasard) est tirée une fois et partagée ;
  - reprendre les règles de `plume.rs` (écriture gardée par le PNJ, sceau détenu) ;
  - l'écran Écrire n'utilise plus que cette route ; retirer `/api/mj/lettres`, ou en faire un raccourci vers elle.
- `PliOuvert` (porte des joueurs) porte `contenu: Contenu` à la place de `texte`.
- `ExemplaireMj` et `LettreATraiter` (écrans du MJ) : le contenu complet aussi.

### 11.4 Interface

- **Le rendu, commun aux joueurs et au MJ** : `web/src/composants/gabarits/`, un composant par gabarit (`BilletLu`, `LettreLongue`, `Gazette`, `Acte`, `Rapport`, `Carte`) et un aiguillage `Document.tsx`.
  - Écrit à la main ou imprimé selon la question 3.
  - La hauteur suit le contenu.
  - Les mots imprimés dans le gabarit, s'il y en a, viennent du thème.
- **L'outil du MJ** (l'écran Écrire devient « Documents ») :
  - le choix du gabarit ;
  - l'expéditeur (PNJ existant, nouveau PNJ, ou aucun) ;
  - le formulaire du gabarit, avec ajout, retrait et ordre des articles et rubriques ;
  - l'envoi d'images ;
  - les destinataires multiples, avec une date commune modifiable pour chacun ;
  - signature, sceau, écriture ;
  - l'aperçu en direct avec `Document.tsx`.
- **Le pli fermé** ne trahit rien de son contenu. Seul l'extérieur peut varier selon le gabarit, par exemple un rouleau pour une carte, si le MJ le souhaite.

### 11.5 Parcours d'essai `documents`

- Le MJ envoie chacun des six gabarits à Alix et Bertrand, avec des dates différentes.
- Chaque joueur ne reçoit qu'à sa date.
- Les images : servies au destinataire après l'ouverture ; refusées à l'autre joueur, avant l'ouverture, et avant l'arrivée. Aucune adresse Blob n'apparaît dans une réponse de joueur.
- Une image de sceau apparaît sur un pli fermé.
- Les billets d'avant l'étape s'ouvrent toujours.
- Une altération sur une case d'article.
- Captures de chaque gabarit au téléphone.
- Ajouter les nouvelles routes aux tests de confidentialité.

### 11.6 Documentation

`docs/FONCTIONNEMENT.md` (« Les gabarits », « Les images »), `DECISIONS.md`, `PLAN.md`.

## Pièges

- Les billets existants doivent rester lisibles sans migration de données.
- La limite de taille des envois sur Vercel.
- Une image est un contenu : elle ne doit jamais partir avant l'ouverture du pli.

## Points à relire

- Le service des images aux joueurs.
- La lecture des anciens contenus.

## Terminé quand

Tous les parcours passent, `documents` compris ; les six gabarits sont beaux au téléphone ; le MJ a envoyé une carte et un acte sur l'aperçu.
