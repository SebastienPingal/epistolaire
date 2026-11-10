# Plan de réalisation

Ce plan découpe la V1 décrite dans `DECISIONS.md` en étapes.
Chaque étape est livrée sur une branche, donc sur une adresse d'aperçu, et regardée avant de passer à la suivante.
L'ordre met la boucle du courrier au plus tôt : tout le reste s'appuie dessus.

## Avancement

| # | Étape | État |
|---|---|---|
| 1 | Squelette et vérification des risques | Fait |
| 2 | Base de données | En cours |
| 3 | Connexion | À faire |
| 4 | Administration minimale | À faire |
| 5 | Le joueur écrit | À faire |
| 6 | Le MJ traite | À faire |
| 7 | Le joueur reçoit | À faire |
| 8 | Notifications | À faire |
| 9 | Filet de sécurité | À faire |
| 10 | Altérations | À faire |
| 11 | Documents et gabarits | À faire |
| 12 | Gazette | À faire |
| 13 | Vue MJ complète | À faire |
| 14 | Finitions et répétition générale | À faire |

## Façon de travailler

- Une étape, une branche, un aperçu. La branche `main` est le site en ligne.
- Le code d'abord, les vérifications ensuite : on ne mélange pas les deux dans le même temps.
- Toute décision non triviale est posée au MJ avant d'être prise, puis notée dans `DECISIONS.md`.
- À la fin de chaque étape : le tableau ci-dessus et le guide `docs/FONCTIONNEMENT.md` sont mis à jour.

---

## Socle

### 1. Squelette et vérification des risques

- Serveur Rust en fonction Vercel, interface React, types de l'interface générés depuis le serveur.
- Projet Vercel relié au repo, base Neon installée, déploiement par aperçu.
- Vérifications faites : le runtime Rust en conditions réelles, le routage, les requêtes vérifiées à la compilation, la base Neon.
- Vérifications reportées à l'étape qui en a besoin : l'envoi d'e-mails (étape 3), les planifications (étape 8), les images sur Blob (étape 11).

On voit : une page en ligne qui confirme que le serveur et la base répondent.

### 2. Base de données

- Toutes les tables du tableau « Données » de `DECISIONS.md`.
- La séparation pli / exemplaire : un pli est écrit une fois, chaque destinataire a son exemplaire.
- Deux portes d'accès distinctes dans le code : ce que voit le MJ, et ce que voit un joueur. Le tri se fait ici, côté serveur.
- Les migrations, appliquées sans jamais perdre un pli en route.

On voit : rien de neuf à l'écran. C'est la fondation.

### 3. Connexion

- Connexion par e-mail : un lien et un code à 6 chiffres.
- Session de plusieurs mois. Seules les adresses enregistrées par le MJ entrent.
- Deux sortes de comptes : MJ et joueur.

On voit : on se connecte, et le site sait qui on est.

## La boucle du courrier

### 4. Administration minimale

- Personnages des joueurs et PNJ, avec leur fiche.
- Écritures (polices manuscrites) et sceaux générés.
- Carnets d'adresses, avec la qualité facultative de chaque contact.
- Réglages généraux : longueur, quota, délai, hasard, calendrier.

On voit : le MJ prépare sa partie.

### 5. Le joueur écrit

- Le billet qui se remplit, avec sa jauge sans chiffre.
- Le brouillon sauvegardé automatiquement.
- Le destinataire : carnet, gazette, ou adresse libre.
- Sceller ou non, signer ou non.
- Le quota et son compteur. L'envoi est définitif, sans copie.
- La fiche de personnage.

On voit : un joueur écrit et envoie une lettre.

### 6. Le MJ traite

- L'écran À traiter.
- La date de livraison proposée, validée en un clic ou changée.
- L'acheminement : livrer, rediriger, copier pour un tiers, retenir, perdre.
- L'écran En route, où les plis restent modifiables.
- La réponse au nom d'un PNJ, en billet.

On voit : le MJ reçoit les lettres et les met en route.

### 7. Le joueur reçoit

- La Réception, par ordre d'arrivée.
- Le pli fermé et le geste d'ouverture.
- Le rendu du billet : écriture, sceau, signature.
- Les dossiers du joueur.
- Le calendrier de jeu et l'affichage des dates.

On voit : une lettre fait le tour complet. C'est le premier moment où le jeu s'essaie pour de vrai.

## Nécessaire pour jouer en vrai

### 8. Notifications

- La pastille sur le site.
- L'e-mail à chaque arrivée, et l'e-mail de rappel.
- Les notifications du navigateur.
- Les alertes du MJ : nouvelle lettre dans la file, date proposée qui approche.
- Le choix des canaux, proposé à la première connexion.

### 9. Filet de sécurité

- Les tests automatiques de confidentialité : un joueur ne reçoit jamais ce qu'il ne doit pas voir.
- La sauvegarde quotidienne de la base, conservée 30 jours.
- Le site installable sur téléphone.

## Les outils du MJ

### 10. Altérations

- La réécriture libre, avec repérage automatique des passages changés.
- L'outil pour abîmer un passage.
- Le sceau : intact, brisé, recollé ou contrefait. La signature : intacte, retirée ou contrefaite.
- La détection, décidée pour chaque destinataire, et la main du faussaire.
- L'original et l'historique, conservés et visibles du seul MJ.

### 11. Documents et gabarits

- L'outil unique pour tout ce qu'envoie le MJ.
- Les cinq autres gabarits : lettre longue, gazette, acte officiel, rapport, carte ou illustration.
- Les images.
- Plusieurs destinataires, avec une date ajustable pour chacun.

### 12. Gazette

- La composition d'un numéro : lettres retenues, coupées ou écartées, articles du MJ.
- La date de parution et l'édition spéciale.
- Un exemplaire par joueur, modifiable individuellement.

### 13. Vue MJ complète

- Les écrans Personnages, Correspondances (original et version livrée côte à côte) et Chronologie.
- Les informations étiquetées : qui les a reçues, ouvertes, et par quel chemin.
- La fonction « Voir comme ».
- Les notes privées.

## Lancement

### 14. Finitions et répétition générale

- Le choix de l'écriture et du sceau par le joueur, validé par le MJ.
- La taille du texte, les animations réduites, le son.
- Le guide de fonctionnement, complet.
- Une partie d'essai avec des comptes fictifs, puis la mise en ligne.
