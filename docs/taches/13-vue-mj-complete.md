# Étape 13 : vue MJ complète

Après le lancement.

## Ce que le MJ verra

Il voit toute la partie d'un coup d'œil :

- **Personnages** : qui a écrit à qui, et ce que sait chacun ;
- **Correspondances** : l'original et la version livrée côte à côte, avec l'historique ;
- **Chronologie** : tout ce qui s'est passé, avec des filtres et une recherche ;
- **Informations** : des informations étiquetées qu'il suit à travers les plis ;
- **Voir comme** : le site tel que le voit un joueur ;
- **Notes** : ses notes privées.

## Déjà décidé

Voir `DECISIONS.md`, sections « Vue MJ » et « Administration ».

- Cinq écrans : À traiter, En route (faits), Personnages (à compléter), Correspondances, Chronologie.
- Informations étiquetées : le MJ crée des informations et les rattache aux plis. Le site montre qui les a reçues et ouvertes, par quel chemin elles ont circulé, et ce que sait chaque personnage.
- « Voir comme » montre le site tel que le voit un joueur, sans rien ouvrir ni modifier.
- Le MJ tient des notes privées.

## Questions au MJ

1. **Voir comme et brouillons.** « Quand vous voyez le site comme un joueur, voyez-vous aussi ses brouillons pas encore envoyés ? »
   - (Recommandé) Non : un brouillon n'est pas encore une lettre, il reste au joueur. · Oui, en lecture seule.
2. **Ce que sait un personnage.** « Un personnage sait une information quand… »
   - (Recommandé) … il a ouvert un pli qui la contient, ou il en est l'auteur. · … un pli qui la contient lui est arrivé, même fermé.
3. **Notes.** « Où voulez-vous écrire vos notes privées ? »
   - (Recommandé) Un carnet de notes libre, plus une note sur chaque pli et chaque information. · Seulement un carnet de notes libre.
4. **Recherche.** « La recherche de la Chronologie cherche dans… »
   - (Recommandé) … les textes originaux et livrés, les noms et les informations. · … seulement les noms et les informations.

## Tâches

### 13.1 Base de données

- Selon la question 3 : une table `notes (id, texte, cree_le, modifie_le)`, et des colonnes `plis.notes_mj text not null default ''` et `informations.notes` (elle existe).
- Les index de recherche si besoin : `pg_trgm` ou `to_tsvector('french', …)` sur les textes. Mesurer avant d'ajouter : la base est petite.

### 13.2 Informations étiquetées (`src/acces/mj/informations.rs`)

- Les informations : lister, créer, modifier, supprimer (une information rattachée à des plis ne se supprime pas : refus clair).
- Rattacher ou détacher une information à un pli, depuis Correspondances et depuis le traitement d'une lettre.
- La fiche d'une information :
  - les plis qui la contiennent ;
  - pour chaque exemplaire, qui l'a reçu, quand, et s'il l'a ouvert ;
  - le **chemin** : la suite chronologique « auteur → destinataire (ouvert le…) → … », en suivant les plis écrits par ceux qui l'ont apprise ;
  - qui la sait (selon la question 2).

### 13.3 Correspondances (`src/acces/mj/correspondances.rs`)

- La liste des plis, filtrable par personnage (auteur ou destinataire), gabarit, état, information, et par période.
- Le détail d'un pli :
  - l'original ;
  - chaque exemplaire avec sa version livrée, côte à côte, les passages altérés surlignés, ce qui est remarqué, la date, l'ouverture, le dossier ;
  - l'historique (`evenements`), en phrases lisibles (« Traitée : livrée à Bertrand pour le 3e jour du 2e mois ») ;
  - ses informations, sa note.

### 13.4 Chronologie

- Le fil de tout ce qui s'est passé, du plus récent au plus ancien :
  - envois ;
  - traitements ;
  - modifications ;
  - arrivées (calculées : date de livraison passée) ;
  - ouvertures ;
  - publications ;
  - bonds dans le temps.
- Chaque ligne donne la date réelle **et** la date du jeu.
- Filtres : personnage, sorte d'événement, information. Recherche selon la question 4.
- Pagination (par 50).

### 13.5 Personnages

La fiche existante reçoit trois parties :

- son courrier envoyé et reçu, avec l'état de chaque pli ;
- ce qu'il sait (informations) ;
- un lien « Voir comme » (si c'est un joueur).

### 13.6 Voir comme

- Côté serveur, `Joueur` reçoit un champ privé `lecture_seule`.
  - `Joueur::nouveau` (connexion) le met à `false`.
  - `Joueur::voir_comme(&Mj, personnage_id)` le met à `true`. Ce constructeur exige un `Mj` : seul le MJ y accède.
- Les routes `/api/mj/voir-comme/{personnage_id}/…` reprennent les routes **de lecture** des joueurs, avec un extracteur qui fabrique ce `Joueur` à partir de la session du MJ.
- Tous les traitements d'écriture des joueurs refusent un `Joueur` en lecture seule : brouillons, envoi, ouverture, rangement, dossiers, préférences, abonnements. Le mieux : un garde-fou unique, par exemple une méthode `joueur.peut_modifier()?` en tête de chaque traitement d'écriture, vérifiée par un test.
- Les brouillons selon la question 1.
- Côté interface, `/mj/voir-comme/:id/…` affiche l'espace du joueur avec un bandeau « Vous voyez le site comme <nom>. Rien n'est ouvert ni modifié. ».
  - Les appels passent par le préfixe `/mj/voir-comme/:id` au lieu de `/joueur` : un contexte React dans `web/src/api.ts` qui donne le préfixe.
  - Les gestes d'écriture sont désactivés ; un pli fermé reste fermé.
- Ajouter aux tests de confidentialité : un joueur n'accède pas à `/api/mj/voir-comme/…` ; toute écriture en lecture seule est refusée et ne change rien.

### 13.7 Notes

- L'écran « Notes », selon la question 3. La note d'un pli dans Correspondances, celle d'une information dans sa fiche.
- Enregistrement automatique, comme les brouillons des joueurs.

### 13.8 Interface du MJ

- Le menu : Courrier (À traiter, En route, Documents, Gazette), Partie (Correspondances, Chronologie, Informations, Notes), Préparation (Personnages, Écritures, Sceaux, Réglages).
- Les dates du MJ : date réelle avec, à côté, la date du jeu, partout où c'est utile.
- Correspondances sur ordinateur : original et versions livrées en colonnes. Sur téléphone : l'un sous l'autre, avec des onglets par destinataire.

### 13.9 Parcours d'essai `vue-mj`

- Une partie jouée en SQL : plusieurs plis, des copies, une altération, une gazette, des ouvertures.
- Une information rattachée à deux plis : la fiche montre qui l'a reçue, ouverte, le chemin, et qui la sait.
- Correspondances : l'original et la version altérée côte à côte, l'historique lisible.
- Chronologie : les filtres et la recherche trouvent ce qu'il faut.
- Voir comme : l'espace d'Alix s'affiche, rien ne s'ouvre ni ne se modifie (vérifier `ouvert_le` et le carnet en SQL, avant et après).
- Captures sur ordinateur d'abord (ce sont des outils), puis au téléphone.

### 13.10 Documentation

`docs/FONCTIONNEMENT.md` (les écrans, Voir comme et sa règle), `CLAUDE.md` (la règle : tout traitement d'écriture d'un joueur vérifie la lecture seule), `DECISIONS.md`, `PLAN.md`.

## Pièges

- « Voir comme » ne doit **jamais** laisser de trace : ni ouverture, ni carnet, ni pastille effacée.
- La Chronologie peut grossir : paginer, et ne charger les textes que dans le détail.

## Points à relire

La lecture seule de « Voir comme », et son test.

## Terminé quand

Tous les parcours passent, `vue-mj` compris ; le MJ a suivi une information à travers la partie sur l'aperçu.
