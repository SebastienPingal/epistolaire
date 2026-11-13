# Plan de réalisation

Ce plan découpe la V1 décrite dans `DECISIONS.md` en étapes.
Chaque étape est livrée sur une branche, donc sur une adresse d'aperçu, et regardée avant de passer à la suivante.
L'ordre met la boucle du courrier au plus tôt : tout le reste s'appuie dessus.

Le détail de chaque étape restante (tâches, questions à poser au MJ, parcours d'essai, points à relire) est dans `docs/taches/`, avec un mode d'emploi commun : `docs/taches/README.md`.

## Avancement

| # | Étape | État |
|---|---|---|
| 1 | Squelette et vérification des risques | Fait |
| 2 | Base de données | Fait |
| 3 | Connexion | Fait |
| 4 | Administration minimale | Fait |
| 5 | Le joueur écrit | Fait |
| 6 | Le MJ traite | Fait |
| 7 | Le joueur reçoit | Fait |
| 8 | Notifications et site installable | En aperçu, à valider par le MJ |
| 9 | Filet de sécurité | À faire |
| L | Lancement : répétition générale et mise en jeu | À faire |
| 10 | Altérations | Après le lancement |
| 11 | Documents et gabarits | Après le lancement |
| 12 | Gazette | Après le lancement |
| 13 | Vue MJ complète | Après le lancement |
| 14 | Finitions | Après le lancement |

La partie commence dès que les étapes 7, 8 et 9 sont en ligne, après la répétition générale (décision du MJ, 12 novembre). Les outils du MJ arrivent ensuite, pendant la partie.

## Façon de travailler

- Une étape, une branche, un aperçu. La branche `main` est le site en ligne.
- Le code d'abord, les vérifications ensuite : on ne mélange pas les deux dans le même temps.
- Toute décision non triviale est posée au MJ avant d'être prise, puis notée dans `DECISIONS.md`.
- À la fin de chaque étape : le tableau ci-dessus et le guide `docs/FONCTIONNEMENT.md` sont mis à jour.

## Pour reprendre

État au moment de cette note (12 novembre, étape 8 en aperçu) :

- les étapes 1 à 7 sont en ligne sur `main` ;
- l'étape 8 est en aperçu sur sa branche. Les réponses du MJ (délai des alertes accepté jusqu'à 30 minutes, alerte 2 heures avant, message groupé, rappel à 24 heures, pastille en simple point) sont dans `DECISIONS.md` ;
- `CRON_SECRET` et les clés VAPID sont posés dans Vercel (site en ligne et aperçus) ;
- restent pour la terminer : l'essai réel avec le MJ sur l'aperçu (site installé, notifications activées, bouton « M'envoyer un essai » des Réglages : notification et e-mail reçus), puis, une fois en ligne, vérifier dans les journaux de Vercel que la planification passe bien toutes les 15 minutes ;
- la suivante est l'étape 9 : lire `docs/taches/README.md`, puis `docs/taches/09-filet-de-securite.md`.

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

On voit : la page de contrôle indique que la structure de la base est en place.

### 3. Connexion

- Connexion par e-mail : un lien et un code à 6 chiffres.
- Session de plusieurs mois. Seules les adresses enregistrées par le MJ entrent.
- Deux sortes de comptes : MJ et joueur.

On voit : on se connecte, et le site sait qui on est.

## La boucle du courrier

### 4. Administration minimale

- Personnages des joueurs et PNJ, avec leur fiche.
- Écritures (polices manuscrites) et sceaux générés. L'import d'une image de sceau est reporté à l'étape 11, avec les images.
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

### 8. Notifications et site installable

Le site installable est avancé ici depuis l'étape 9 : sur iPhone, les notifications du navigateur n'existent que pour un site installé.

- La pastille sur le site.
- L'e-mail à chaque arrivée, et l'e-mail de rappel.
- Les notifications du navigateur.
- Les alertes du MJ : nouvelle lettre dans la file, date proposée qui approche.
- Le choix des canaux, proposé à la première connexion.

### 9. Filet de sécurité

- Les tests automatiques de confidentialité : un joueur ne reçoit jamais ce qu'il ne doit pas voir.
- La sauvegarde quotidienne de la base, conservée 30 jours.
- La vérification du site installé sur de vrais téléphones (le site installable est fait à l'étape 8).

### L. Lancement : répétition générale et mise en jeu

- Les aperçus travaillent sur leur propre base (branches Neon) : un essai ne touche plus les vraies lettres.
- Le site en ligne vérifié : accès sans compte Vercel, variables, tâches planifiées, limites gratuites.
- La base en ligne sauvegardée, puis nettoyée des essais, avec l'accord du MJ.
- Une partie d'essai sur le site en ligne, avec des comptes fictifs.
- La vraie partie préparée, et le message d'accueil des joueurs.

On voit : la partie commence.

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

## Pendant la partie

### 14. Finitions

- Le choix de l'écriture et du sceau par le joueur, validé par le MJ.
- La taille du texte, les animations réduites, le son.
- Le guide de fonctionnement, complet.
