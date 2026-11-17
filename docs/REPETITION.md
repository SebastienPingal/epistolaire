# Répétition générale et lancement

La liste à suivre avant d'inviter les joueurs. Cocher au fur et à mesure, et noter ce qui ne va pas : tout se corrige sur une branche et un aperçu avant de continuer.

Décidé le 16 novembre : les joueurs fictifs ont des adresses « en + » de la boîte du MJ (`votre.nom+alix@gmail.com`) ; après la répétition, rien n'est gardé ; le calendrier du jeu commence le jour de l'invitation.

## A. Ce que seul le MJ peut faire dans Vercel

### A.1 Le stockage des sauvegardes et des images

- [x] Le stockage `epistolaire-sauvegardes` est créé et relié au projet (17 novembre). Vercel le relie désormais par OIDC : le projet reçoit `BLOB_STORE_ID`, pas de jeton fixe. Le site a été adapté.
- [ ] Une fois l'adaptation en ligne : Réglages, Sauvegardes, « Faire une copie maintenant » ; une copie doit paraître dans la liste.
- [ ] Le lendemain matin : la copie de 4 h est dans la liste, et aucun e-mail d'échec n'est arrivé.
- [ ] Le jeton fixe du stockage (« Revoke Token » dans Vercel) ne sert pas au site : il peut être révoqué.

### A.2 Une base à part pour les aperçus

Aujourd'hui, les aperçus et le site en ligne lisent la même base. Avant d'inviter les joueurs, chaque aperçu doit avoir la sienne.

- [ ] Onglet **Storage**, ouvrir la base Neon du projet, puis ses réglages (**Settings**).
- [ ] Dans la partie sur les déploiements d'aperçu (« Preview »), activer la création d'une branche de base pour chaque aperçu (« Create database branch for deployment », environnement **Preview**). Enregistrer.
- [ ] Le dire à Claude : il pousse un commit sans effet, vérifie que l'aperçu répond, que son adresse de base n'est plus celle du site en ligne, et qu'une migration d'aperçu ne touche pas le site en ligne.

Si un aperçu échoue ensuite avec « Resource provisioning failed », c'est Neon qui n'arrive pas à créer la branche : regarder dans le tableau de bord de Neon si le nombre de branches de l'offre gratuite est atteint, et supprimer les branches d'aperçus anciens.

### A.3 L'accès au site en ligne

- [ ] Ouvrir l'adresse du site en ligne dans une fenêtre de navigation privée, sans être connecté à Vercel : la page de connexion du jeu doit paraître, pas celle de Vercel.
- [ ] Si c'est celle de Vercel : **Settings**, **Deployment Protection**, **Vercel Authentication**, choisir « Standard Protection » (seuls les aperçus restent protégés).
- [ ] Noter ici l'adresse à donner aux joueurs : `https://…`

## B. La répétition, sur le site en ligne

1. Préparer
   - [ ] Réglages : « Faire une copie maintenant », puis la télécharger.
   - [ ] Créer deux ou trois personnages de joueurs fictifs (adresses « en + »), leurs écritures, leurs sceaux, leurs carnets, et un PNJ.
2. Se connecter
   - [ ] Chaque joueur fictif se connecte : une fois par le lien, une fois par le code.
   - [ ] Installer le site sur un Android et sur un iPhone ; y choisir ses notifications.
3. Écrire
   - [ ] Une lettre de joueur à joueur.
   - [ ] Une lettre à un PNJ.
   - [ ] Une lettre à une adresse libre.
   - [ ] Une lettre à la gazette.
4. Traiter (MJ)
   - [ ] Valider en un clic ; rediriger ; copier pour un tiers ; retenir puis remettre en route.
   - [ ] Répondre au nom du PNJ ; écarter la lettre à la gazette.
   - [ ] Altérer une lettre (En route, « Altérer »), et décider de ce que le destinataire remarque.
   - [ ] Envoyer un acte et une carte depuis « Documents ».
5. Recevoir
   - [ ] Une lettre avec une arrivée dans 15 minutes : elle arrive à l'heure ; la notification et l'e-mail suivent dans le quart d'heure.
   - [ ] Ouvrir le pli d'un geste ; le ranger ; le carnet s'enrichit.
   - [ ] La carte : son image paraît une fois le pli ouvert.
   - [ ] Un pli laissé fermé déclenche le rappel (après le délai choisi).
6. Les limites
   - [ ] La quatrième lettre de la semaine est refusée.
   - [ ] Le lendemain : la copie de 4 h existe dans la liste des sauvegardes.

### Ce qui n'allait pas

_(à remplir)_

## C. Nettoyer, puis préparer la vraie partie

- [ ] Une sauvegarde, téléchargée.
- [ ] Claude montre l'inventaire de la base, puis ce que ferait `outils/nettoyer-lancement.sql` (il n'applique rien par défaut).
- [ ] **Accord explicite du MJ**, puis le nettoyage, puis un nouvel inventaire.
- [ ] Le MJ crée les vrais personnages, leurs adresses, écritures, sceaux et carnets.
- [ ] Le jour de l'invitation : Réglages, « premier jour du jeu » = aujourd'hui.
- [ ] Envoyer le message d'accueil (`docs/ACCUEIL-JOUEURS.md`).
