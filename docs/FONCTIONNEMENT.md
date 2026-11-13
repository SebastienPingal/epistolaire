# Guide de fonctionnement

Ce guide décrit comment le site est construit. Il est mis à jour à la fin de chaque étape de `PLAN.md`.
État décrit : étape 8 (notifications et site installable), en aperçu.

## Vue d'ensemble

Le site a deux moitiés, dans le même repo :

- **Le serveur**, en Rust. Il détient les données et décide de ce que chacun a le droit de voir.
- **L'interface**, en React. Elle affiche ce que le serveur lui envoie, et rien d'autre.

Les deux sont hébergés sur Vercel. L'interface est un ensemble de fichiers statiques. Le serveur est une fonction Vercel : elle démarre quand une requête arrive, et il n'y a pas de processus permanent.

## Organisation du repo

| Chemin | Rôle |
|---|---|
| `api/main.rs` | Le point d'entrée du serveur sur Vercel |
| `src/` | Le serveur : routeur, accès à la base, logique du jeu |
| `src/modele.rs` | Le vocabulaire du jeu : gabarits, états d'un pli, d'un sceau… |
| `src/calendrier.rs` | Le calendrier du jeu : d'un jour réel à une date du jeu |
| `src/acces/joueur/` | La porte des joueurs : écritoire, fiche, courrier reçu, dossiers |
| `src/acces/mj/` | La porte du MJ : la file, les plis en route, la plume des PNJ, les plis détruits, puis personnages, écritures, sceaux, réglages |
| `src/taches/` | La troisième porte : les tâches planifiées, appelées par Vercel |
| `src/notifications/` | Les choix de notification de chaque compte, ses navigateurs abonnés, l'envoi, et le chiffrement des notifications du navigateur |
| `src/theme.rs` | Les mots que les joueurs lisent hors du site (e-mails, notifications) |
| `src/connexion.rs` | La connexion par e-mail et les sessions |
| `src/courriel.rs` | L'envoi des e-mails |
| `src/erreur.rs` | Les erreurs renvoyées à l'interface |
| `src/bin/dev.rs` | Le serveur local, pour développer |
| `migrations/` | La structure de la base, étape par étape |
| `.sqlx/` | La description des requêtes SQL, qui sert à les vérifier à la compilation |
| `web/` | L'interface |
| `web/src/ecrans/` | L'écran de connexion |
| `web/src/joueur/` | Les écrans des joueurs |
| `web/src/mj/` | Les écrans du MJ |
| `web/src/composants/` | Les éléments du jeu réutilisés partout : une écriture, un cachet, une enveloppe |
| `web/src/composants/gabarits/` | Le rendu des gabarits, tels qu'on les lit : pour l'instant le billet |
| `web/src/types/` | Les types générés depuis le serveur. Ne pas les modifier à la main |
| `web/src/components/ui/` | Les composants shadcn/ui, ajoutés au fur et à mesure |
| `web/src/theme/` | Le thème : apparence et vocabulaire de l'univers, et la source de l'icône du site |
| `web/public/` | Ce qui est servi tel quel : le manifeste du site installable, ses icônes, le service worker |
| `web/scripts/icones.cjs` | Tire les icônes PNG de leur source SVG |
| `web/src/index.css` | Le branchement de Tailwind, de shadcn/ui et du thème |
| `vercel.json` | La configuration de l'hébergement |

## L'apparence

Les composants viennent de shadcn/ui et sont mis en forme avec Tailwind CSS. shadcn/ui ne fixe aucune couleur : il lit des variables (`--background`, `--primary`…). C'est le thème, `web/src/theme/neutre.css`, qui leur donne une valeur. Changer d'univers revient à écrire un autre fichier de thème et à changer une ligne dans `web/src/index.css`.

L'environnement cloud de Claude nommé `epistolaire` autorise l'adresse `ui.shadcn.com`, nécessaire pour ajouter des composants.

## Le chemin d'une requête

1. Le navigateur demande une adresse qui commence par `/api/`.
2. Vercel la transmet à la fonction Rust (`api/main.rs`).
3. Le routeur (`src/lib.rs`) la confie au bon traitement.
4. Le traitement interroge la base et répond en JSON.

Toute autre adresse renvoie l'interface.

## La base de données

### Les tables

| Table | Ce qu'elle contient |
|---|---|
| `comptes` | Les adresses e-mail autorisées, MJ ou joueur |
| `personnages` | Les personnages des joueurs et les PNJ, avec leur fiche |
| `ecritures` | Les polices manuscrites |
| `sceaux` | Les sceaux, leur nom gravé et leur détenteur actuel |
| `contacts` | Les carnets d'adresses |
| `dossiers` | Les dossiers créés par les joueurs |
| `plis` | Ce qui a été écrit, en version originale |
| `exemplaires` | Ce que reçoit chaque destinataire, en version livrée |
| `numeros_gazette`, `lettres_gazette` | Les numéros de la gazette et les lettres retenues |
| `informations`, `pli_informations` | Les informations étiquetées par le MJ |
| `evenements` | L'historique de chaque pli |
| `reglages` | Les réglages généraux, sur une seule ligne |
| `bonds_calendrier` | Les bonds dans le temps décidés par le MJ, chacun avec son jour |
| `preferences_notification` | Les canaux choisis par chaque compte |
| `abonnements_navigateur` | Les navigateurs abonnés aux notifications, plusieurs par compte |

### Un pli, des exemplaires

Un pli est écrit une fois : la table `plis` garde l'original, que seul le MJ voit.
Quand le MJ le traite, il crée un exemplaire par destinataire dans `exemplaires`.
L'exemplaire porte la version livrée (éventuellement réécrite), sa date de livraison, et ce que ce destinataire remarque.
Pour l'instant la version livrée est toujours celle que l'auteur a écrite : son texte, son écriture, sa signature s'il a signé, son sceau s'il a scellé. Les altérations viendront à l'étape 10.

Chaque exemplaire dit pourquoi il existe : c'est celui du destinataire, une redirection, ou une copie pour un tiers. Un personnage n'a jamais deux exemplaires du même pli.

Il n'y a pas d'état « livré ». Un exemplaire est livré quand il est en route et que sa date de livraison est passée. Aucune tâche ne fait ce passage : c'est une comparaison de dates, faite à chaque lecture.

### La porte des joueurs

Un joueur ne lit jamais les tables `plis` et `exemplaires`. Tout son courrier reçu passe par la vue `plis_recus`, qui ne contient que :

- les exemplaires déjà arrivés ;
- leur version livrée, sans l'original ni le vrai auteur ;
- les altérations que ce destinataire a remarquées, et aucune autre.

Un pli détruit par son destinataire sort aussi de la vue, sans quitter la base.

Dans le code, le dossier `src/acces/joueur/` est le seul endroit qui répond à un joueur. Pour le courrier reçu, il ne lit que cette vue ; pour ses brouillons, que la vue `brouillons`. Le contenu d'un pli n'est transmis qu'à son ouverture : tant qu'il est fermé, le joueur n'en reçoit que l'extérieur (son sceau et sa date d'arrivée).

Le joueur ne modifie jamais la table `exemplaires` lui-même. Ses trois gestes sur son courrier sont des fonctions de la base, qui vérifient d'abord, par la vue `plis_recus`, que le pli est arrivé, qu'il n'est pas détruit et qu'il est bien à lui :

| Fonction | Ce qu'elle fait |
|---|---|
| `ouvrir_pli(pli, joueur)` | Marque le pli ouvert. À la première ouverture seulement, ajoute au carnet le propriétaire d'origine du sceau et la personne qui signe, s'il ne les connaît pas |
| `ranger_pli(pli, joueur, dossier)` | Range le pli dans un dossier de ce joueur, ou dans la Réception (dossier vide) |
| `detruire_pli(pli, joueur)` | Détruit le pli pour ce joueur, et en garde la trace dans l'historique du pli |

Chacune renvoie « faux » sans rien changer si le pli n'est pas à ce joueur ou pas encore arrivé ; le serveur répond alors « introuvable ».

Aucun horodatage de pli ne part vers un joueur : seulement des dates du jeu, sans heure. Le tri par heure d'arrivée se fait dans la base.

### Les migrations

La structure de la base est décrite par les fichiers de `migrations/`, numérotés. Ils sont embarqués dans le serveur. À son démarrage, le serveur compare son dernier numéro à celui de la base et applique ce qui manque.

Une migration déjà appliquée ne se modifie plus : tout changement passe par un nouveau fichier. Une migration ne supprime jamais une table ou une colonne qui contient du courrier sans étape intermédiaire.

## La connexion

1. La personne saisit son adresse e-mail.
2. Si l'adresse a un compte, le serveur lui envoie un e-mail avec un lien et un code à 6 chiffres, valables 15 minutes et utilisables une fois. Une adresse inconnue reçoit la même réponse à l'écran, mais aucun e-mail : le site ne dit pas qui a un compte.
3. Le lien ou le code ouvre une session. Le navigateur reçoit un cookie que le code de la page ne peut pas lire.
4. La session dure 180 jours après la dernière visite.

La base ne garde ni le code, ni le lien, ni le cookie : seulement leur empreinte. Après 5 codes faux, une demande ne vaut plus rien. Un compte ne peut pas recevoir plus de 5 e-mails par quart d'heure.

Le compte du MJ se crée tout seul la première fois que son adresse demande à se connecter. Cette adresse est celle de la boîte d'envoi (`SMTP_USER`), sauf si la variable `MJ_EMAIL` en désigne une autre. Les comptes des joueurs sont créés par le MJ.

Dans le code, un traitement réservé au MJ demande un `Mj`, un traitement de joueur demande un `Joueur`. Ces deux preuves ne sont fabriquées que par la connexion, à partir de la session.

Les e-mails partent de la boîte Gmail du MJ, par SMTP. Les identifiants sont dans les variables d'environnement du projet Vercel, repris du projet `congres-champetre`. Sans eux, les e-mails d'un aperçu ou du serveur local ne partent pas : ils sont écrits dans les journaux du serveur. Le site en ligne, lui, refuse de fonctionner sans eux.

## L'espace du joueur

Un joueur a trois destinations : la Réception, l'écritoire et sa fiche. Sur téléphone, elles sont en bas de l'écran.

### Écrire

1. L'écritoire montre combien de lettres il reste à envoyer cette semaine, et les brouillons en cours.
2. Un billet se rédige dans l'écriture du personnage. Il est sauvegardé tout seul, un instant après la dernière frappe.
3. Une jauge sans chiffre montre la place qui reste. Le billet peut déborder, mais il ne part pas tant qu'il est trop long.
4. Le joueur choisit son destinataire : un personnage de son carnet, la gazette, ou une adresse écrite librement.
5. Il choisit de signer ou non, et de sceller ou non avec un sceau qu'il détient.
6. L'envoi est définitif, après confirmation. La lettre rejoint la file du MJ avec une date de livraison proposée (le délai, plus ou moins le hasard).

Une lettre envoyée disparaît pour son auteur. Ce n'est pas un simple masquage à l'écran : le joueur ne lit et ne modifie ses lettres qu'à travers la vue `brouillons`, qui ne contient que des lettres pas encore envoyées. Dès l'envoi, la lettre n'y est plus.

### Le quota

Chaque envoi compte, quel que soit le destinataire et quoi que la lettre devienne ensuite. Les brouillons ne comptent pas. Le compte repart de zéro le lundi à 0 h, heure de Paris. Le serveur le vérifie au moment de l'envoi : l'écran ne fait que l'annoncer.

### Recevoir

1. **La Réception** reçoit tout le courrier arrivé, le plus récent en premier. Chaque pli y est une petite enveloppe : son cachet (ou sa pliure s'il n'est pas scellé), sa date d'arrivée dans le calendrier du jeu, et un point tant qu'il n'est pas ouvert. Une fois ouvert, la ligne montre aussi qui signe, ou les premiers mots d'une lettre anonyme.
2. **Ouvrir un pli** se fait d'un geste. Au doigt : glisser le cachet de côté (sur 40 % de la largeur du pli ; en dessous, il revient à sa place). À la souris : maintenir le bouton 0,8 seconde, pendant qu'un anneau se remplit autour du cachet. Au clavier : maintenir Espace ou Entrée. Le cachet se brise en deux, puis la lettre paraît. Si l'appareil demande des animations réduites, rien ne bouge : la lettre paraît dès le geste fini.
3. **La lettre** se lit dans l'écriture de son auteur, avec la date où elle a été écrite en haut, la signature et le cachet en bas, puis la date de réception.
4. **Le carnet** s'enrichit à la première ouverture : le propriétaire d'origine du sceau et la personne qui signe y entrent, s'ils n'y sont pas déjà.
5. **Les dossiers** : le joueur en crée (30 au plus), les renomme, y range ses plis et les en ressort. Un pli n'est jamais qu'à un seul endroit. Le mode « Choisir » permet de ranger ou de détruire plusieurs plis d'un coup.
6. **Détruire** : un pli, plusieurs, ou tout un dossier. Supprimer un dossier qui contient des plis les détruit avec lui, après un avertissement. Le pli disparaît pour le joueur, mais la base le garde, et le MJ le voit dans « Détruites ». Le carnet, lui, ne perd rien.

### Le calendrier du jeu

Un jour réel vaut un jour de jeu. Le « premier jour du jeu » (un réglage du MJ) vaut le « 1er jour du 1er mois, an 1 ». Ensuite, les mois ont la longueur des vrais mois, comme si l'an 1 commençait un 1er janvier. Le jour change à minuit, heure de Paris.

Le MJ fait des bonds dans le temps : « 10 jours passent, à partir de tel jour ». Un bond ne compte qu'à partir de son jour, si bien qu'un pli reçu avant garde la date qu'il avait.

Le calcul est dans `src/calendrier.rs`, avec ses tests. Le serveur lit les réglages et les bonds une fois par requête, puis convertit chaque date. L'ancienne colonne `reglages.calendrier_bonds` (un total unique) est remplacée par la table `bonds_calendrier` et n'est plus lue.

## L'espace du MJ

Le MJ arrive sur un espace à part, avec un menu en deux parties : le courrier, et la préparation de la partie. Sa page d'accueil est la file À traiter.

### À traiter

La file contient les lettres envoyées par les joueurs, dans leur version originale. Elle est triée par urgence : la lettre dont la date de livraison proposée est la plus proche vient en premier, et une alerte signale les dates déjà dépassées. Les lettres pour la gazette sont rangées à part, en bas.

Traiter une lettre, c'est décider de son sort. C'est à ce moment que ses exemplaires sont créés, et qu'elle quitte la file.

- **Lettre à un joueur** : le bouton Valider la met en route en un clic, vers le destinataire visé, à la date proposée. Si cette date est passée, le pli arrive 10 minutes après la validation. Le bouton « Livrer maintenant » la fait arriver tout de suite.
- **Ouvrir une lettre** permet de tout décider : le destinataire (le changer, c'est rediriger), des copies pour des tiers, la date, puis Livrer, Retenir ou Perdre.
- **Lettre à un PNJ** : elle reste dans la file tant que le MJ n'y a pas répondu, ou ne l'a pas classée sans réponse. La réponse s'écrit sous la lettre. Elle part dans le même geste : si elle est refusée, rien n'est traité.
- **Adresse libre** : le MJ choisit un personnage, ou crée un PNJ sans quitter l'écran. Le nom proposé est l'adresse écrite par le joueur.
- **Lettre à la gazette** : en attendant la composition des numéros (étape 12), le MJ peut l'écarter ou la remettre à quelqu'un.
- **Écarter** met de côté une lettre sans destinataire précis. Elle reste visible en bas de la file, d'où elle peut revenir.

Un PNJ ne « reçoit » pas à une date : c'est le MJ qui lit pour lui. Son exemplaire est donc arrivé et lu aussitôt, et ne passe jamais par l'écran En route.

### En route

Cet écran montre les exemplaires qui ne sont pas encore arrivés, le prochain en premier, puis ceux qui sont retenus, puis ceux qui sont perdus. Tant qu'un exemplaire n'est pas arrivé, le MJ peut changer sa date ou son destinataire, le retenir, le perdre, le remettre en route, ou en faire partir une copie pour un tiers. Une date placée dans le passé vaut « tout de suite ».

Faire arriver une lettre instantanément : « Faire arriver maintenant » sur chaque pli d'En route (un pli retenu ou perdu est remis en route du même geste), et le bouton « Tout de suite » à côté de chaque champ de date (ouverture d'une lettre, plume des PNJ, modification d'un pli). Le serveur n'a rien de particulier à faire : il ramène toute date passée à l'instant où il reçoit la demande.

Rien ne « livre » un pli : il est arrivé dès que sa date est passée. À partir de là, le serveur refuse toute modification.

### Écrire au nom d'un PNJ

Le MJ choisit un PNJ (ou en crée un), un destinataire, et écrit un billet. Les règles sont celles des joueurs : une écriture, une signature et un sceau facultatifs. Trois différences :

- la lettre ne passe pas par la file : elle part aussitôt, avec le délai habituel ou la date que le MJ choisit ;
- le MJ peut dépasser la longueur d'un billet ;
- un PNJ qui n'a pas encore d'écriture reçoit celle que le MJ choisit à ce moment, et la garde.

Le MJ n'écrit qu'au nom d'un PNJ. Ses lettres ne comptent dans aucun quota.

### Détruites

La liste des plis que les joueurs ont détruits, le plus récent en premier : qui l'avait reçu, de qui il venait, quand il a été détruit, depuis quel dossier, et s'il avait été lu. Le pli s'y lit dans la version que le joueur avait reçue. L'écran Correspondances (étape 13) reprendra ces informations.

### L'historique

Chaque geste du MJ sur un pli (traitement, changement de date ou de destinataire, copie, mise à l'écart), et chaque destruction par un joueur, ajoute une ligne à la table `evenements`, avec l'état d'avant et d'après. Rien n'y est jamais effacé. Cet historique sera affiché à l'étape 13.

### La préparation

- **Personnages** : créer les personnages des joueurs et les PNJ, remplir leur fiche, donner à chaque joueur son adresse e-mail (c'est ce qui lui ouvre le site), choisir son écriture, tenir son carnet d'adresses.
- **Écritures** : voir les 14 écritures fournies, les renommer, marquer celles qui sont génériques.
- **Sceaux** : créer des sceaux, changer leur nom gravé ou leurs initiales, les faire changer de mains.
- **Réglages** : longueur d'un billet, quota, délai et hasard de livraison, premier jour du jeu. En bas, « Le temps du jeu » : la date du jeu d'aujourd'hui, et les bonds dans le temps (ajouter, retirer).

Toutes les adresses de cet espace commencent par `/api/mj` côté serveur, et chacune vérifie que c'est bien le MJ qui demande. Un joueur connecté qui essaierait d'y entrer est refusé.

### Les écritures

Une écriture est une police manuscrite fournie avec le site. La liste est dans `web/src/theme/ecritures.ts`, et la base en garde une ligne par police. Le MJ ne crée pas d'écriture : en ajouter une demande d'ajouter la police au site, puis une migration.

Deux joueurs ne peuvent pas avoir la même écriture : c'est la base elle-même qui le refuse.

### Les sceaux

Un sceau est un objet, avec un nom gravé qui ne change pas quand il change de mains. À la création d'un personnage, le site propose de lui créer un sceau à son nom. Dans l'habillage neutre, un sceau est dessiné comme un simple cachet portant des initiales. L'import d'une image de sceau viendra avec les images des documents.

## Les notifications

### Ce que chacun choisit

À la première connexion, avant tout le reste, un écran propose les canaux. « Plus tard » compte comme un choix : l'écran ne revient pas. On change d'avis ensuite dans la fiche du personnage (joueur) ou dans les Réglages, section « Mes notifications » (MJ).

- **Une notification sur cet appareil.** Elle s'active appareil par appareil : le téléphone, puis l'ordinateur si on le veut. La permission du navigateur n'est demandée qu'au moment où la personne touche l'interrupteur. Sur iPhone et iPad, l'interrupteur reste grisé tant que le site n'est pas installé sur l'écran d'accueil, avec une phrase qui explique comment faire.
- **Un e-mail à chaque arrivée** (pour le MJ : à chaque nouvelle lettre ou alerte).
- **Un e-mail de rappel** quand un pli reste fermé (joueurs seulement), au bout d'un délai que le joueur choisit : un jour par défaut.

Dans ses Réglages, le MJ a un bouton « M'envoyer un essai » : une notification à ses navigateurs abonnés et un e-mail, par ses canaux choisis, sur le même chemin que la tâche. Il sert à vérifier un appareil, y compris sur un aperçu.

Sans aucun canal, il reste la pastille : un point sur « Réception » pour un joueur, le nombre de lettres à côté d'« À traiter » pour le MJ. Elle se relit au changement d'écran, au retour sur l'onglet, et chaque minute. Sur le site installé, l'icône la porte aussi, là où le téléphone le permet.

### La tâche planifiée

Rien ne « livre » : un pli est arrivé dès que sa date est passée. Une tâche passe toutes les 15 minutes et prévient de ce qui est arrivé depuis son dernier passage. Sur l'offre gratuite de Vercel, ce passage est décalé au hasard de 0 à 15 minutes : une alerte part le plus souvent 5 à 20 minutes après l'arrivée, au pire 30 minutes.

Elle est déclarée dans `vercel.json` (section `schedules`) et appelle `GET /api/taches/notifications`. Elle ne tourne que sur le site en ligne, pas sur les aperçus. En un passage :

1. **Arrivées.** Les exemplaires arrivés et pas encore signalés sont marqués, puis chaque joueur concerné est prévenu une fois, selon ses choix. Un pli déjà ouvert, ou remis à un PNJ, ne déclenche rien.
2. **Rappels.** Les plis restés fermés plus longtemps que le délai choisi : un e-mail par joueur, un seul rappel par pli.
3. **Le MJ.** Les lettres arrivées dans sa file, et celles dont la date de livraison proposée est à moins de 2 heures sans qu'il les ait traitées (sauf les lettres à la gazette, qui attendent un numéro). Tout tient dans un seul message.

Ce qui a été signalé est noté dans la base (`exemplaires.notifie_le`, `rappele_le` ; `plis.mj_prevenu_le`, `mj_alerte_le`). On marque **avant** d'envoyer, sous verrou : deux passages simultanés ne préviennent jamais deux fois. La migration a marqué tout ce qui existait déjà, pour que le premier passage n'envoie pas l'historique.

**La garde.** Vercel joint à l'appel l'en-tête `Authorization: Bearer <CRON_SECRET>`. Sans ce secret, la tâche répond 401, même à un joueur ou au MJ connecté.

**Hors du site en ligne** (aperçu, ou en local), rien ne part vers un joueur : l'e-mail ou la notification est écrit dans le journal du serveur à la place. Seul le MJ reçoit vraiment. Un essai ne prévient donc jamais un vrai joueur, même si les aperçus partagent la base du site en ligne.

**Ce que dit un message.** « Un pli vous attend », avec l'adresse de la Réception. Jamais qui écrit, ni ce qui est écrit. Ces mots sont dans `src/theme.rs`.

### Les notifications du navigateur

Le navigateur qui s'abonne donne une adresse (celle du service de notifications de son fabricant : Google, Mozilla, Apple…) et deux clés. Le site chiffre chaque message pour ce seul navigateur (RFC 8291), et le signe avec sa paire de clés VAPID (RFC 8292) pour prouver au service qu'il vient bien de lui. Le chiffrement est écrit dans `src/notifications/chiffrement.rs` avec les bibliothèques RustCrypto : la bibliothèque `web-push` dépend d'OpenSSL, absent de la compilation sur Vercel. Un test le vérifie sur l'exemple de la RFC.

Un abonnement que le service dit disparu (le navigateur s'est désabonné) est supprimé. Quand un compte n'a plus aucun navigateur abonné, le canal est coupé.

Le service worker (`web/public/sw.js`) affiche la notification, et ouvre le bon écran quand on la touche. Plusieurs arrivées n'en font qu'une. Il ne met rien en cache : le site ne marche pas hors connexion.

## Le site installé

Le site s'installe sur l'écran d'accueil comme une application : manifeste `web/public/manifest.webmanifest`, icônes dans `web/public/icones/`, balises dans `web/index.html`. Sur iPhone, c'est la condition pour recevoir des notifications.

L'icône est un cachet de cire qui porte une enveloppe, aux couleurs du thème neutre. Sa source est `web/src/theme/icone.svg` ; après l'avoir changée, relancer `node web/scripts/icones.cjs`.

## Les garde-fous automatiques

- **Requêtes SQL vérifiées à la compilation.** Une requête qui ne correspond pas à la base empêche le site de se construire. La vérification s'appuie sur le dossier `.sqlx/`, donc elle marche aussi sur Vercel, sans base à portée de main.
- **Types partagés.** Les types de l'interface sont générés depuis ceux du serveur. Si le serveur change une réponse, l'interface ne se construit plus tant qu'elle n'a pas suivi.

## Les essais

Le dossier `essais/` contient des parcours qui utilisent le site comme le ferait une personne, dans un vrai navigateur : se connecter, préparer la partie en MJ, écrire et envoyer en joueur, traiter la file et suivre les plis en route en MJ, recevoir, ouvrir, ranger et détruire en joueur. Ils vérifient aussi ce qui ne doit pas être possible : lire une lettre envoyée, lire le brouillon d'un autre, entrer chez le MJ en étant joueur, dépasser son quota, traiter deux fois la même lettre, modifier un pli arrivé, ouvrir un pli pas encore arrivé ou celui d'un autre, toucher aux dossiers d'un autre.

Le geste d'ouverture au doigt est essayé avec de vrais événements tactiles envoyés au navigateur.

Le parcours `notifications` appelle la tâche avec le secret d'essai, fait « arriver » des plis en avançant leur date, et remplace le service de notifications par un faux, qui déchiffre ce qu'il reçoit et vérifie la signature. Les autres parcours passent l'écran du premier choix en cliquant « Plus tard » (`essais/commun.cjs`).

Ils tournent contre une base locale, jamais contre la base en ligne.

## Développer en local

Il faut Rust, Node et une base PostgreSQL.

```bash
cp .env.exemple .env
```

```bash
cargo run
```

```bash
npm --prefix web install
```

```bash
npm --prefix web run dev
```

Après un changement de requête SQL, avec la base locale lancée :

```bash
cargo sqlx prepare
```

## Déploiement

- Le repo GitHub est relié à Vercel.
- La branche `main` est le site en ligne.
- Chaque autre branche poussée reçoit une adresse d'aperçu.

## Variables d'environnement

| Nom | Rôle |
|---|---|
| `DATABASE_URL` | L'adresse de la base PostgreSQL (Neon) |
| `DATABASE_URL_UNPOOLED` | L'adresse directe de la base, utilisée pour les migrations |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Le serveur d'envoi des e-mails et ses identifiants |
| `SMTP_FROM` | L'adresse d'expédition, si elle diffère de `SMTP_USER` (un alias). Facultatif |
| `MJ_EMAIL` | L'adresse qui ouvre le compte du MJ, si ce n'est pas `SMTP_USER`. Facultatif |
| `SITE_HOST` | Le nom de domaine du site, s'il ne finit pas par `.vercel.app`. Facultatif |
| `CRON_SECRET` | Le secret que la planification joint à l'appel des tâches. Une longue valeur tirée au hasard. Obligatoire pour les notifications |
| `VAPID_PUBLIC`, `VAPID_PRIVATE` | La paire de clés des notifications du navigateur. Sans elles, ce canal est indisponible ; les e-mails partent quand même |
| `VAPID_SUJET` | Le contact donné aux services de notifications : `mailto:` suivi d'une adresse, ou l'adresse `https://` du site. Sur Vercel, c'est l'adresse du site, pour ne pas confier l'e-mail du MJ à Google ou Apple |

Ces quatre variables sont posées dans Vercel (site en ligne et aperçus) depuis l'étape 8. `CRON_SECRET` et `VAPID_PRIVATE` y sont de type « sensible » : personne ne peut plus les relire, pas même depuis le tableau de bord. Pour en changer, en tirer de nouvelles. Changer la paire VAPID oblige chacun à réactiver les notifications sur ses appareils.
| `SITE_URL` | L'adresse du site, pour les liens des e-mails envoyés par la tâche. Facultatif : par défaut, celle que Vercel donne au site en ligne ou à l'aperçu |

En local, `.env.exemple` donne un `CRON_SECRET` et une paire de clés VAPID d'essai, qui ne servent qu'aux essais.
