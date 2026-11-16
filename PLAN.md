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
| 8 | Notifications et site installable | Fait |
| 9 | Filet de sécurité | En ligne, à finir (stockage Blob, téléphones) |
| L | Lancement : répétition générale et mise en jeu | En cours : préparé, reste les gestes du MJ (`docs/REPETITION.md`) |
| 10 | Altérations | En ligne (avancée avant le lancement, à la demande du MJ) ; à essayer par le MJ |
| 11 | Documents et gabarits | En ligne (avancée avant le lancement, à la demande du MJ) ; à essayer par le MJ |
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

Étape L, au 16 novembre : ce que Claude pouvait faire seul est fait ; le reste attend le MJ, dans l'ordre de `docs/REPETITION.md`.

- fait : l'interface découpée (un joueur ne télécharge plus les écrans du MJ), les e-mails de connexion retenus sur les aperçus sauf vers la boîte du MJ, le script `outils/nettoyer-lancement.sql` (il n'applique rien par défaut), la liste de la répétition, le message d'accueil ;
- vérifié avec l'outil Vercel : le site en ligne tourne sur l'étape 11 ; toutes les variables attendues sont là sauf `BLOB_READ_WRITE_TOKEN` ; `DATABASE_URL` est la même pour le site en ligne et les aperçus (les bases ne sont pas encore séparées) ;
- pas vérifié : que l'adresse du site en ligne s'ouvre sans compte Vercel (la machine de Claude n'a pas le droit de joindre `vercel.app` ; le projet a la protection `all_except_custom_domains`, à regarder par le MJ en navigation privée) ; les limites gratuites de Neon et de Blob ;
- reste au MJ : créer le stockage Blob (A.1), activer une base par aperçu dans l'intégration Neon (A.2), vérifier l'accès public (A.3), puis la répétition (B) ;
- reste à Claude, après ces gestes : vérifier la séparation des bases sur un aperçu, l'inventaire puis le nettoyage de la base en ligne **avec l'accord explicite du MJ**, mettre l'adresse du site dans la documentation.

État au moment de cette note (16 novembre, étape 11 mise en ligne à la demande du MJ) :

- l'étape 11 (documents et gabarits) a été faite avant le lancement, à la demande du MJ, alors que l'étape 10 n'est pas encore essayée par lui, et mise en ligne sur `main` à sa demande, sans attendre son essai : l'aperçu a seulement été construit (sur `claude/vigilant-tesla-3to8mw`, la branche que Vercel accepte) et vérifié par `/api/sante`. Ses réponses (un document peut n'avoir aucun expéditeur ; il peut être adressé à un PNJ ; trois gabarits à la main, trois imprimés ; images privées ; tout pli peut être scellé ; le pli fermé laisse deviner la sorte de document ; le MJ peut remplacer l'image d'une carte) sont dans `DECISIONS.md` ;
- fait et vérifié en local : le parcours `documents`, tous les anciens parcours, les tests de confidentialité (75 routes, images comprises, avec un faux stockage) ;
- la migration `0008_documents.sql` ajoute la table `images`, deux colonnes (`sceaux.image_id`, `plis.ecriture_id`), une fonction, et remplace la fonction `voiler_passages` et la vue `plis_recus`. Elle ne supprime rien, et les billets existants ne sont pas touchés ;
- **les images ne marchent pas sur le site tant que le stockage Vercel Blob n'existe pas** (voir plus bas : c'est le même que celui des sauvegardes). Sans lui, déposer une image répond « Le stockage des copies et des images n'est pas relié au site » ; tout le reste de l'étape marche ;
- reste à faire pour l'étape 11 : que le MJ crée le stockage, puis envoie une carte et un acte depuis « Documents » sur le site ; puis l'état « Fait » ;
- non fait : retirer ou ajouter un article dans la version altérée d'un exemplaire (elle garde la forme de l'original) ; le ménage des images déposées et jamais utilisées ; la copie des fichiers d'images dans les sauvegardes (la copie quotidienne garde leur fiche, pas le fichier, qui reste dans le stockage).

L'étape 10, au moment de sa mise en ligne (16 novembre, à la demande du MJ) :

- l'étape 10 (altérations) a été faite avant le lancement, à la demande du MJ, et mise en ligne sur `main` à sa demande, sans attendre son essai : l'aperçu a seulement été construit (sur `claude/vigilant-tesla-3to8mw`, la branche que Vercel accepte) et vérifié par `/api/sante`. Ses réponses (main inconnue : une écriture choisie à chaque fois ; passage abîmé : une tache ; altérer au traitement et dans En route ; pas de lettre entièrement fausse pour l'instant) sont dans `DECISIONS.md` ;
- fait et vérifié en local : le parcours `alterer`, tous les anciens parcours, les tests de confidentialité (ils couvrent le passage abîmé) et la restauration ;
- la migration `0007_alterations.sql` ajoute deux colonnes à `exemplaires`, une fonction, et remplace la vue `plis_recus`. Elle ne supprime rien ;
- reste à faire pour l'étape 10 : que le MJ falsifie une lettre sur le site (À traiter ou En route, « Altérer »), puis l'état « Fait » ;
- non fait, reporté : écrire une lettre entièrement fausse au nom d'un joueur (viendra avec les compétences des personnages).

Ce qui reste de l'étape 9 n'a pas changé :

- les étapes 1 à 9 sont en ligne sur `main` (l'étape 9 mise en ligne à la demande du MJ, après un aperçu construit et vérifié par `/api/sante`). Les réponses du MJ (copie à 4 h, e-mail en cas d'échec, stockage privé, section « Sauvegardes » avec téléchargement) sont dans `DECISIONS.md` ;
- la planification des notifications passe sur le site en ligne (premier passage vu dans les journaux de Vercel le 16 novembre à 8 h 13 UTC, secret accepté). Reste l'essai réel sur le téléphone du MJ, à faire avec l'essai 9.5 ;
- fait et vérifié en local : les tests de confidentialité (`essais/confidentialite.sh`, 68 routes essayées, et l'essai du filtre retiré), la sauvegarde et la restauration de bout en bout (`essais/restauration.sh`), le parcours `sauvegarde`, et tous les anciens parcours ;
- les aperçus : une branche **nouvelle** est refusée par Vercel avant toute compilation (« Resource provisioning failed »), alors que le même commit se construit sur une branche déjà connue (`claude/vigilant-tesla-3to8mw`). Cause probable : l'intégration Neon n'arrive pas à préparer une base pour une nouvelle branche. En attendant d'avoir regardé côté Neon (à l'étape L, qui doit de toute façon donner leur propre base aux aperçus), publier les aperçus sur `claude/vigilant-tesla-3to8mw`, avec l'accord du MJ ;
- reste à faire avec le MJ :
  - créer le stockage Vercel Blob (l'outil Vercel de Claude n'en a pas la permission) : tableau de bord Vercel, projet `epistolaire`, Storage, Create, Blob, nom `epistolaire-sauvegardes`, accès **Private**, région Frankfurt (fra1), relié à tous les environnements. Vérifier ensuite que `BLOB_READ_WRITE_TOKEN` apparaît dans les variables du projet (nom seulement), puis redéployer le site en ligne : une variable n'est prise qu'au déploiement suivant ;
  - sur le site, dans les Réglages du MJ, « Faire une copie maintenant », télécharger la copie, et la restaurer en local avec `cargo run --bin restaurer` ;
  - vérifier dans les journaux de Vercel que la copie de 4 h (heure de Paris) a bien tourné la première nuit : Vercel a accepté la planification avec son fuseau horaire ;
  - installer le site sur un Android et un iPhone, s'y connecter avec le code, et recevoir une notification (9.5) ;
- une fois ces points faits : l'état « Fait » de l'étape 9, puis l'étape L (`docs/taches/lancement.md`).

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

On voit : le MJ falsifie une lettre, et chaque destinataire ne voit que ce qu'il remarque.

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
