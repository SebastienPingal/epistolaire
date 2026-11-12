# Lancement : répétition générale et mise en jeu

## Ce que le MJ verra

La partie commence. Avant d'inviter les joueurs, on sépare les essais des vraies lettres, on vérifie le site en ligne de bout en bout avec des comptes fictifs, puis on nettoie.

Cette étape reprend une partie de l'ancienne étape 14 (« une partie d'essai avec des comptes fictifs, puis la mise en ligne ») et les points notés dans `PLAN.md` sous « À régler avant le lancement ». Le reste de l'étape 14 vient après le lancement.

Elle demande plusieurs gestes du MJ dans Vercel et dans sa boîte mail : l'agent les prépare, les explique pas à pas, et vérifie après coup.

## Déjà décidé

- La partie commence dès que les étapes 7, 8 et 9 sont en ligne, après une répétition générale.
- Avant le lancement, les aperçus doivent travailler sur une copie de la base, pour qu'un essai ne touche jamais les vraies lettres (`DECISIONS.md`, « Questions ouvertes »).

## Questions au MJ

1. **Comptes de la répétition.** « Pour la répétition, il faut deux ou trois comptes de joueurs fictifs, avec des adresses où vous recevez les e-mails. Les adresses Gmail acceptent un ajout après un `+` (par exemple `votre.nom+alix@gmail.com`) : elles arrivent toutes dans votre boîte. On fait comme ça ? »
   - (Recommandé) Oui, avec des adresses en `+`. · J'ai d'autres adresses à donner.
2. **Après la répétition.** « Que garder des données de la répétition ? »
   - (Recommandé) Rien : on efface les comptes, personnages, plis de la répétition et tous les essais antérieurs, et vous préparez la vraie partie sur une base propre. · Garder les personnages et sceaux préparés, n'effacer que les plis et les comptes fictifs.
3. **Message d'accueil.** « Voulez-vous que je rédige le message à envoyer aux joueurs sur WhatsApp (l'adresse du site, comment se connecter, installer le site, choisir les notifications) ? »
   - (Recommandé) Oui. · Non, je m'en occupe.
4. **Date de lancement.** « Quel jour la partie commence-t-elle ? Elle fixe le premier jour du calendrier du jeu. »
   - (Recommandé) Le jour où les joueurs reçoivent leur invitation. · Un autre jour.

## Tâches

### L.1 Séparer les aperçus du site en ligne

- **Branches Neon par aperçu.** Dans l'intégration Neon du projet Vercel, activer la création d'une branche de base pour chaque déploiement d'aperçu. C'est un réglage du MJ dans le tableau de bord Vercel (Stockage, la base Neon, ses réglages). Rédiger pour lui le pas à pas, avec ce qu'il doit voir à l'écran.
- **Vérifier** sur un nouvel aperçu (un commit sans effet suffit) :
  - `/api/sante` répond, avec le bon numéro de structure ;
  - `DATABASE_URL` de l'aperçu n'est plus celle du site en ligne (comparer les noms d'hôte avec l'outil Vercel, jamais les mots de passe) ;
  - une migration appliquée sur l'aperçu n'apparaît pas sur le site en ligne.
- **Les e-mails depuis un aperçu.** Une branche est une copie de la base, avec les adresses des joueurs. Vérifier que, hors du site en ligne, aucun e-mail ni notification ne part vers un compte de joueur (garde posée à l'étape 8). L'étendre si besoin aux e-mails de connexion : hors du site en ligne, seule l'adresse du MJ reçoit un vrai e-mail.
- Mettre à jour `CLAUDE.md` (section « Hébergement ») : les aperçus ont leur propre base, et une migration poussée sur une branche ne touche plus le site en ligne.

### L.2 Vérifier le site en ligne

- **L'accès.** L'adresse du site en ligne doit s'ouvrir sans compte Vercel. Le projet a une protection des déploiements (`ssoProtection : all_except_custom_domains`). Ouvrir l'adresse de production dans un navigateur sans être connecté à Vercel (Playwright, contexte neuf) : la page de connexion du jeu doit apparaître, pas celle de Vercel. Si c'est celle de Vercel, expliquer au MJ comment limiter la protection aux seuls aperçus.
- **L'adresse à donner aux joueurs.** La noter dans `DECISIONS.md` et `docs/FONCTIONNEMENT.md`. C'est aussi `SITE_URL`.
- **Les variables d'environnement de production** (noms seulement, avec l'outil Vercel) : `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SITE_URL`, `CRON_SECRET`, `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUJET`, `BLOB_READ_WRITE_TOKEN`, et `MJ_EMAIL` si elle sert. Ce qui manque, le MJ l'ajoute.
- **Les tâches planifiées** sont déclarées et ont tourné au moins une fois sur le site en ligne (journaux Vercel) : notifications, sauvegarde.
- **Les limites gratuites** de Neon et de Vercel Blob : relever l'espace utilisé et les plafonds, les noter dans `DECISIONS.md` (« Hypothèses à confirmer »).

### L.3 Le poids de l'interface

Aujourd'hui, l'interface est un seul fichier d'environ 590 ko, qui contient aussi les écrans du MJ. Les découper (`React.lazy` pour l'espace du MJ, l'espace des joueurs, la connexion) :

- le téléphone d'un joueur charge moins ;
- un joueur ne télécharge plus le code des écrans du MJ.

Vérifier ensuite tous les parcours.

### L.4 Sauvegarder, puis nettoyer la base du site en ligne

- **D'abord une sauvegarde**, par la route de l'étape 9, et la vérifier dans Blob.
- Faire l'inventaire de la base en ligne : le nombre de lignes de chaque table, la liste des comptes (sans montrer les adresses dans un message public), des personnages et des plis.
- Écrire le script de nettoyage selon la réponse à la question 2 (`outils/nettoyer-lancement.sql`), dans une transaction, avec un décompte avant et après.
- **Le montrer au MJ, et attendre son accord explicite** avant de le lancer sur la base en ligne. Après, refaire l'inventaire.
- Ne jamais toucher à `_sqlx_migrations`, `ecritures` (les noms donnés par le MJ restent) ni `reglages` (sauf le premier jour du calendrier).

### L.5 La répétition générale

Sur le site en ligne, avec le MJ et les comptes fictifs. Écrire le déroulé dans `docs/REPETITION.md`, sous forme de liste à cocher, et y noter les résultats.

1. Le MJ crée les personnages fictifs, leurs écritures, leurs sceaux, leurs carnets, un PNJ.
2. Chaque joueur fictif se connecte (lien, puis code), installe le site sur un téléphone, choisit ses notifications.
3. Une lettre de joueur à joueur ; une à un PNJ ; une à une adresse libre ; une à la gazette.
4. Le MJ valide, redirige, copie, retient puis remet en route, répond au nom du PNJ, écarte la lettre de la gazette.
5. Une lettre avec une date de livraison proche (dans 15 minutes) : elle arrive à l'heure, la notification suit dans le quart d'heure, l'e-mail aussi.
6. Le joueur ouvre le pli d'un geste, le range, son carnet s'enrichit.
7. Un pli laissé fermé déclenche le rappel.
8. Le quota : la quatrième lettre de la semaine est refusée.
9. La sauvegarde du jour existe.

Tout ce qui ne va pas est corrigé, sur une branche et un aperçu, avant de continuer.

### L.6 Préparer la vraie partie

- Le MJ crée les vrais personnages, leurs adresses, écritures, sceaux et carnets.
- Fixer le premier jour du calendrier (question 4).
- Si le MJ l'a demandé : rédiger le message d'accueil dans `docs/ACCUEIL-JOUEURS.md`, en français simple. Il contient :
  - l'adresse du site ;
  - comment se connecter : son adresse e-mail, puis le lien ou le code ;
  - comment installer le site sur l'écran d'accueil, sur iPhone et sur Android ;
  - le choix des notifications ;
  - et rien sur les règles cachées du jeu (délais, altérations).

### L.7 Documentation

- `PLAN.md` : le lancement est fait, la date ; « Pour reprendre » pointe vers l'étape 10.
- `docs/FONCTIONNEMENT.md` : l'adresse du site, les bases séparées, la routine après le lancement (toute modification passe par un aperçu validé ; une correction de données en ligne passe par un script relu et accepté par le MJ, après une sauvegarde).
- `DECISIONS.md` : retirer des « Questions ouvertes » ce qui est réglé.

## Pièges

- Rien de destructif sur la base en ligne sans sauvegarde vérifiée **et** accord explicite du MJ, au moment même.
- Les adresses e-mail des joueurs ne vont dans aucun message public ni dans le dépôt.
- Une fois la partie lancée, chaque mise en ligne touche de vrais joueurs : relancer tous les parcours avant de proposer un aperçu, et préférer les mises en ligne en dehors des moments où les joueurs écrivent.

## Terminé quand

- Les aperçus ont leur propre base, et rien n'en sort vers les joueurs.
- La répétition est passée entièrement, notée dans `docs/REPETITION.md`.
- La base en ligne est propre, sauvegardée, et la vraie partie est préparée.
- Le MJ a envoyé l'invitation.
