# Étape 12 : gazette

Après le lancement. Les lettres adressées à la gazette attendent depuis le début de la partie dans la file du MJ (section « Pour la gazette »).

## Ce que le MJ verra

Il compose un numéro en rédacteur en chef :

- il choisit les lettres de lecteurs qu'il publie, les coupe, les modifie ou les censure ;
- il ajoute ses articles, nouvelles et annonces ;
- il fixe la date de parution, ou sort une édition spéciale.

Chaque joueur reçoit son exemplaire dans sa Réception, et le MJ peut en modifier un en particulier.

## Déjà décidé

Voir `DECISIONS.md`, section « Gazette ».

- La gazette paraît par numéros, à un rythme libre ; édition spéciale possible à tout moment.
- Les textes y sont imprimés : ni écriture ni sceau de l'auteur. La signature devient un simple nom, ou « anonyme ».
- Chaque joueur reçoit son propre exemplaire ; le MJ peut modifier un exemplaire en particulier.
- Une lettre adressée à la gazette est intégrée à un numéro, ou écartée (`DECISIONS.md`, « Données »).
- Le nom « gazette » fait partie du thème.
- Le gabarit `gazette` et son contenu (`GazetteContenu`) existent depuis l'étape 11.

## Questions au MJ

1. **Après la publication.** « Une fois un numéro publié, et avant sa parution, peut-on encore le modifier ? »
   - (Recommandé) Le numéro est figé, mais vous pouvez retoucher l'exemplaire d'un joueur en particulier jusqu'à son arrivée. · Le numéro reste modifiable, et vos retouches s'appliquent à tous les exemplaires pas encore arrivés.
2. **Nouveaux joueurs.** « Un joueur qui rejoint la partie reçoit-il les anciens numéros ? »
   - (Recommandé) Non ; vous pouvez lui en envoyer un à la main. · Oui, tous.
3. **Signature par défaut.** « Pour une lettre signée publiée, quel nom imprimer par défaut ? »
   - (Recommandé) Le nom de la signature. Une lettre non signée devient « anonyme ». Vous pouvez toujours changer. · Toujours « anonyme » par défaut.
4. **Titre.** « Chaque numéro a-t-il son propre titre, en plus du nom de la gazette ? »
   - (Recommandé) Oui, un gros titre facultatif. · Non, seulement le nom, le numéro et la date.

## Tâches

### 12.1 Base de données

Les tables `numeros_gazette` et `lettres_gazette` existent (migration 0001). Vérifier qu'elles suffisent, et compléter par une migration si besoin, par exemple `numeros_gazette.publie_le`.

- **Brouillon de numéro** : `pli_id` vide.
- **Publication** : un pli `gazette` rédigé par le MJ, sans auteur, dont le contenu est assemblé à partir des articles et des lettres retenues (`texte_publie`, `signature_publiee`). Un exemplaire par joueur ayant un compte, avec `livraison_le = parution_le`.
- **Les lettres retenues** passent à l'état `traite`, avec une ligne d'historique « publication » et le numéro. Les autres restent dans la file, ou sont écartées par le MJ.

### 12.2 Serveur (`src/acces/mj/gazette.rs`)

- Les numéros : lister, créer (le numéro suivant, proposé), modifier tant qu'ils ne sont pas publiés, supprimer un brouillon.
- Les lettres :
  - retenir une lettre de la file dans un numéro ; `texte_publie` vaut d'abord le texte original, et `signature_publiee` suit la question 3 ;
  - la couper ou la modifier ;
  - la retirer du numéro ;
  - changer l'ordre.
- Les articles : ajouter, modifier, ordonner (`articles jsonb`).
- `POST /api/mj/gazette/{id}/publication` avec `parution_le` et `speciale` : crée le pli et les exemplaires, en une transaction, avec historique.
- La retouche d'un exemplaire passe par l'écran d'altération de l'étape 10 : les cases d'article et de lettre y sont modifiables.

### 12.3 Interface du MJ

- Une entrée « Gazette » dans le menu Courrier : la liste des numéros (brouillon, publié, paru).
- La composition d'un numéro :
  - à gauche, les lettres pour la gazette en attente, avec « Retenir » ;
  - au centre, le numéro : articles et lettres retenues, modifiables, dans l'ordre choisi ;
  - l'aperçu avec le gabarit `Gazette` ;
  - « Publier » demande la date de parution (maintenant, ou une date choisie) et précise « édition spéciale » si besoin.
- Dans À traiter, la section « Pour la gazette » renvoie vers la composition.
- Sur téléphone, les trois parties l'une sous l'autre.

### 12.4 Interface des joueurs

- La gazette arrive dans la Réception, sans sceau ; son extérieur évoque un journal plié (mots et apparence du thème).
- Elle s'ouvre du même geste que les autres plis. Le gabarit `Gazette` (étape 11) l'affiche, imprimée.

### 12.5 Parcours d'essai `gazette`

- Deux lettres pour la gazette, l'une signée, l'autre non. Le MJ retient la première en la coupant, la publie « anonyme », écarte la seconde, ajoute un article, publie pour une date passée.
- Chaque joueur reçoit son exemplaire. Le nom de l'auteur, son identifiant et le texte coupé n'apparaissent dans aucune réponse de joueur.
- La retouche de l'exemplaire de Bertrand avant parution : seul Bertrand la voit.
- La lettre retenue a quitté la file.
- Une édition spéciale.
- Captures : composition sur ordinateur et téléphone, gazette ouverte au téléphone.
- Ajouter les routes de la gazette aux tests de confidentialité (porte du MJ) et le cas « lettre anonyme publiée » (porte des joueurs).

### 12.6 Documentation

`docs/FONCTIONNEMENT.md` (« La gazette »), `DECISIONS.md`, `PLAN.md`.

## Pièges

- Une lettre « anonyme » ne doit trahir son auteur nulle part : ni dans le contenu, ni dans un identifiant, ni dans l'ordre ou la date.
- La publication crée beaucoup d'exemplaires d'un coup : une seule transaction.

## Points à relire

L'anonymat des lettres publiées ; la séparation entre le numéro et les exemplaires retouchés.

## Terminé quand

Tous les parcours passent, `gazette` compris ; le MJ a publié un vrai premier numéro sur l'aperçu, puis en ligne.
