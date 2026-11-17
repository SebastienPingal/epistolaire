# Guide de fonctionnement

Ce guide décrit comment le site est construit. Il est mis à jour à la fin de chaque étape de `PLAN.md`.
État décrit : étape L (lancement, en cours).

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
| `src/gabarits.rs` | Les six gabarits : leurs cases, leur lecture dans la base, leur vérification |
| `src/images.rs` | Les images des documents et des sceaux : les ranger dans le stockage, les servir |
| `src/calendrier.rs` | Le calendrier du jeu : d'un jour réel à une date du jeu |
| `src/passages.rs` | Les passages d'un texte, réécrits ou abîmés : leur format, le repérage des réécritures, la vérification des passages abîmés |
| `src/acces/joueur/` | La porte des joueurs : écritoire, fiche, courrier reçu, dossiers, images de ses plis |
| `src/acces/mj/` | La porte du MJ : la file, les plis en route, les altérations, les documents, les images, les plis détruits, puis personnages, écritures, sceaux, réglages |
| `src/taches/` | La troisième porte : les tâches planifiées, appelées par Vercel |
| `src/notifications/` | Les choix de notification de chaque compte, ses navigateurs abonnés, l'envoi, et le chiffrement des notifications du navigateur |
| `src/sauvegarde/` | La copie quotidienne de la base, son dépôt dans Vercel Blob, et sa restauration |
| `src/theme.rs` | Les mots que les joueurs lisent hors du site (e-mails, notifications) |
| `src/connexion.rs` | La connexion par e-mail et les sessions |
| `src/courriel.rs` | L'envoi des e-mails |
| `src/erreur.rs` | Les erreurs renvoyées à l'interface |
| `src/bin/dev.rs` | Le serveur local, pour développer |
| `src/bin/sauvegarder.rs`, `src/bin/restaurer.rs` | Copier une base dans un fichier, et restaurer une copie dans une base neuve |
| `tests/confidentialite.rs` | Les tests de confidentialité, et leur jeu de données (`tests/donnees/`) |
| `migrations/` | La structure de la base, étape par étape |
| `.sqlx/` | La description des requêtes SQL, qui sert à les vérifier à la compilation |
| `web/` | L'interface |
| `web/src/ecrans/` | L'écran de connexion |
| `web/src/joueur/` | Les écrans des joueurs |
| `web/src/mj/` | Les écrans du MJ |
| `web/src/composants/` | Les éléments du jeu réutilisés partout : une écriture, un cachet, une enveloppe |
| `web/src/composants/gabarits/` | Le rendu des six gabarits, tels qu'on les lit, et leur aiguillage `Document.tsx` |
| `web/src/outils/gabarits.ts`, `web/src/outils/images.ts` | Les cases des gabarits côté navigateur ; les adresses des images et leur dépôt |
| `web/src/outils/passages.ts` | Les passages côté navigateur : conversion des positions, aperçu des réécritures, découpage d'un texte en morceaux |
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
| `sceaux` | Les sceaux, leur nom gravé, leur image éventuelle et leur détenteur actuel |
| `images` | La fiche de chaque image déposée par le MJ. Le fichier est dans le stockage |
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
À sa création, la version livrée est celle que l'auteur a écrite : son texte, son écriture, sa signature s'il a signé, son sceau s'il a scellé. Le MJ peut ensuite l'altérer, tant que l'exemplaire n'est pas arrivé : voir « Les altérations ».

Chaque exemplaire dit pourquoi il existe : c'est celui du destinataire, une redirection, ou une copie pour un tiers. Un personnage n'a jamais deux exemplaires du même pli.

Il n'y a pas d'état « livré ». Un exemplaire est livré quand il est en route et que sa date de livraison est passée. Aucune tâche ne fait ce passage : c'est une comparaison de dates, faite à chaque lecture.

### La porte des joueurs

Un joueur ne lit jamais les tables `plis` et `exemplaires`. Tout son courrier reçu passe par la vue `plis_recus`, qui ne contient que :

- les exemplaires déjà arrivés ;
- leur version livrée, sans l'original ni le vrai auteur ;
- les altérations que ce destinataire a remarquées, et aucune autre ;
- un texte où les passages abîmés sont déjà voilés : la vue remplace elle-même chaque caractère abîmé par « · » (fonction `voiler_passages`). Le texte abîmé ne quitte donc jamais la base par la porte des joueurs, quel que soit le code qui lit la vue.

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

Sur un aperçu, un e-mail de connexion ne part que vers la boîte du MJ : son adresse, ou la même avec un ajout après un « + » (`nom+alix@…`), ce qui lui permet d'y jouer ses joueurs fictifs. Pour toute autre adresse, rien ne part.

Les e-mails partent de la boîte Gmail du MJ, par SMTP. Les identifiants sont dans les variables d'environnement du projet Vercel, repris du projet `congres-champetre`. Sans eux, les e-mails d'un aperçu ou du serveur local ne partent pas : ils sont écrits dans les journaux du serveur. Le site en ligne, lui, refuse de fonctionner sans eux.

## L'espace du joueur

Un joueur a trois destinations : la Réception, l'écritoire et sa fiche. Sur téléphone, elles sont en bas de l'écran.

### Écrire

1. L'écritoire montre combien de lettres il reste à envoyer cette semaine, et les brouillons en cours.
2. Un billet se rédige dans l'écriture du personnage. Il est sauvegardé tout seul, un instant après la dernière frappe. Tant que le serveur ne l'a pas reçu (réseau absent), une copie attend dans le téléphone (`localStorage`, voir « Ce que garde le navigateur »).
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

Cet écran montre les exemplaires qui ne sont pas encore arrivés, le prochain en premier, puis ceux qui sont retenus, puis ceux qui sont perdus. Tant qu'un exemplaire n'est pas arrivé, le MJ peut changer sa date ou son destinataire, le retenir, le perdre, le remettre en route, en faire partir une copie pour un tiers, ou l'altérer. Une date placée dans le passé vaut « tout de suite ».

Un exemplaire altéré porte un repère : « Altéré », ou « Altéré · remarqué » si son destinataire remarquera quelque chose. Une copie faite depuis cet écran reprend la version livrée de l'exemplaire copié, altérations comprises ; rien n'y est remarqué tant que le MJ ne le décide pas pour ce tiers.

Faire arriver une lettre instantanément : « Faire arriver maintenant » sur chaque pli d'En route (un pli retenu ou perdu est remis en route du même geste), et le bouton « Tout de suite » à côté de chaque champ de date (ouverture d'une lettre, plume des PNJ, modification d'un pli). Le serveur n'a rien de particulier à faire : il ramène toute date passée à l'instant où il reçoit la demande.

Rien ne « livre » un pli : il est arrivé dès que sa date est passée. À partir de là, le serveur refuse toute modification.

### Les altérations

Tant qu'un exemplaire n'est pas arrivé, le MJ peut falsifier sa version livrée. L'original, lui, ne change jamais : `plis.contenu` n'est écrit nulle part dans ce code.

**Où.** À deux moments :

- au traitement d'une lettre (« Altérer cette lettre ») : la version altérée part vers tous les destinataires, copies comprises, sans que rien ne soit remarqué ;
- dans En route (« Altérer »), pour l'exemplaire d'un seul destinataire. C'est là que le MJ décide de ce que ce destinataire remarque.

**Quoi.** L'atelier (`web/src/mj/Alteration.tsx`) montre l'original à gauche et la version livrée à droite, puis :

- le texte, réécrit librement. Les passages réécrits sont surlignés pendant la frappe ;
- « Abîmer la sélection » : le passage sélectionné dans la version livrée devient une tache ;
- le sceau : intact, brisé, recollé, ou contrefait. Les trois premiers ne valent que pour le sceau posé par l'auteur. Un sceau contrefait imite n'importe quel sceau, même sur un pli qui n'était pas scellé ;
- la signature : intacte, retirée, ou contrefaite. Une signature contrefaite imite un personnage (qui entrera dans le carnet du destinataire) et trace un nom ;
- le faussaire : un personnage, ou une main inconnue. Pour une main inconnue, le MJ choisit une écriture parmi celles qu'aucun personnage n'utilise ;
- « Remarqué par… » : trois interrupteurs (texte, sceau, signature), éteints par défaut. Un interrupteur ne s'allume que s'il y a quelque chose à remarquer ;
- un aperçu, avec le rendu des joueurs : la lettre telle que la lira le destinataire.

« Rétablir l'original » remet la version livrée telle que l'auteur l'a écrite.

**Ce que voit le destinataire.** C'est la vue `plis_recus` qui en décide, pas l'interface :

| Altération | Rien n'est remarqué | C'est remarqué |
|---|---|---|
| Passage réécrit | Dans l'écriture de l'auteur, comme le reste | Dans l'écriture du faussaire |
| Signature contrefaite | Dans l'écriture du personnage imité | Dans l'écriture du faussaire |
| Signature retirée | Pas de signature | Pas de signature |
| Sceau brisé, recollé, contrefait | Le cachet paraît intact | Le dessin du cachet le montre : une fêlure, une ligne de cire plus sombre, un cachet un peu de travers |
| Passage abîmé | Une tache, toujours | Une tache, toujours |

Aucun mot n'explique jamais une altération : seul le rendu la montre.

**Les passages.** Un passage désigne des caractères d'une case du gabarit, et s'écrit partout de la même façon, dans la base comme dans l'interface :

```json
{ "champ": "texte", "debut": 12, "fin": 30 }
```

- `debut` et `fin` comptent les **caractères Unicode**, `fin` exclue. C'est ce que comptent Rust (`chars()`) et PostgreSQL. Un champ de texte du navigateur compte autrement (en unités UTF-16, où un émoji en vaut deux) : `web/src/outils/passages.ts` convertit à chaque passage de la frontière ;
- `champ` nomme la case du gabarit, par son chemin : `texte` pour un billet, `articles.2.texte` pour le troisième article d'une gazette. Un passage enregistré sans `champ` vaut `texte` ;
- les **passages réécrits** ne viennent jamais de l'interface. Le serveur les repère seul à chaque enregistrement (`src/passages.rs`), en comparant l'original et la version livrée mot par mot, avec la bibliothèque `similar`. Tout mot ajouté ou remplacé fait partie d'un passage ; des mots voisins n'en font qu'un. Un mot simplement supprimé ne laisse rien à montrer, et l'écran le dit. Le surlignage pendant la frappe est un aperçu calculé dans le navigateur (bibliothèque `diff`) ; une fois enregistré, c'est le repérage du serveur qui s'affiche ;
- les **passages abîmés** sont choisis par le MJ, et vérifiés par le serveur : dans les limites du texte, réunis s'ils se touchent. Le texte abîmé reste dans la base (le MJ le voit), mais la vue des joueurs le remplace par des « · », en gardant la longueur et les retours à la ligne. Si la liste est mal formée, ou si un passage désigne autre chose qu'un texte, la vue voile tout le contenu plutôt que de risquer d'en laisser passer.

**Les garanties du serveur** (`src/acces/mj/alterations.rs`) :

- la version livrée d'un exemplaire ne se modifie que par `appliquer_version`, et `recopier_version` pour une copie ;
- un exemplaire arrivé ne s'altère plus ;
- ce qui est remarqué exige un faussaire désigné : sans lui, il n'y aurait pas d'écriture où le montrer ;
- chaque altération ajoute une ligne à l'historique, avec la version d'avant et celle d'après. Enregistrer deux fois la même version n'ajoute rien.

L'atelier affiche aussi l'historique du pli, et reste lisible une fois le pli arrivé : on n'y change plus rien, mais on y voit l'original, ce qui a été reçu, et ce qui s'est passé.

### Documents

Un seul outil pour tout ce qu'envoie le MJ (écran « Documents », `POST /api/mj/documents`). Il choisit :

- **un gabarit** parmi les six (voir « Les gabarits ») ;
- **un expéditeur** : un PNJ, un PNJ créé sur place, ou personne. Sans expéditeur, le document n'a ni signature ni sceau ;
- **le contenu** : les cases du gabarit. Les articles, rubriques et lettres de lecteurs s'ajoutent, se retirent et changent d'ordre ;
- **la signature** (gabarits écrits à la main seulement) et **le sceau** (tout gabarit : il ferme le pli) ;
- **un ou plusieurs destinataires**, joueurs ou PNJ. Chacun reçoit son exemplaire. La date par défaut (le délai habituel, plus ou moins le hasard) est tirée une fois et partagée ; le MJ peut fixer une date pour tous, ou pour un seul ;
- un aperçu montre le document tel qu'il sera lu.

Tout ce que le MJ remplit sur cet écran est gardé dans le navigateur à chaque changement, et revient quand il rouvre l'écran ; c'est oublié à l'envoi ou par « Tout effacer ». La réponse d'un PNJ sous une lettre de la file est gardée de même, lettre par lettre.

Le document ne passe pas par la file : il part aussitôt, et chaque exemplaire reste modifiable dans En route. Un PNJ qui n'a pas encore d'écriture reçoit celle que le MJ choisit pour un document écrit à la main, et la garde. La réponse d'un PNJ écrite sous une lettre de la file est un billet envoyé par le même chemin.

Le MJ n'écrit qu'au nom d'un PNJ, ou de personne. Ses documents ne comptent dans aucun quota. Écrire une lettre entièrement fausse au nom d'un joueur n'est pas possible pour l'instant : cela viendra avec les compétences des personnages.

### Les gabarits

| Gabarit | Cases | Écrit | Signature |
|---|---|---|---|
| Billet | texte | à la main | oui |
| Lettre longue | lieu et date, texte | à la main | oui |
| Acte officiel | autorité, objet, texte, formule finale | à la main | oui |
| Rapport | titre, auteur, rubriques (intertitre, texte) | imprimé | non |
| Gazette | titre, numéro, date, articles (titre, texte), courrier des lecteurs (texte, nom) | imprimée | non |
| Carte ou illustration | image, titre, légende | imprimée | non |

- Dans la base, la colonne `gabarit` du pli nomme le gabarit, et le JSON `contenu` porte ses cases : celui du pli pour l'original, celui de l'exemplaire pour la version livrée. Un billet est toujours `{ "texte": … }` : les billets d'avant l'étape 11 se lisent sans rien changer. Une case absente vaut une case vide, et un contenu mal formé se lit vide plutôt que de bloquer une Réception.
- Avec l'interface, le gabarit et ses cases voyagent ensemble : `{ "gabarit": "rapport", "titre": …, "rubriques": [ … ] }`.
- Une case de texte se désigne par son chemin : `texte`, `articles.2.texte`, `rubriques.0.titre`. C'est ce chemin que portent les passages réécrits ou abîmés.
- Le rendu est le même pour le joueur et pour le MJ (`web/src/composants/gabarits/Document.tsx`). Un passage réécrit et remarqué paraît dans la main du faussaire, même sur un document imprimé. La hauteur suit le contenu. Les mots imprimés par le gabarit (« Courrier des lecteurs », « N° ») viennent du thème.
- Le cachet figure à l'intérieur des trois gabarits signés ; sur les autres, il ne se voit que sur le pli fermé.
- **Le pli fermé** laisse deviner la sorte de document : un rouleau pour une carte, un journal plié pour une gazette, un pli ordinaire pour le reste (`web/src/composants/Enveloppe.tsx`). Rien de son contenu ne part avant l'ouverture.
- **Altérer** un document se fait dans le même atelier que pour un billet : une zone par case, « Abîmer la sélection » sous chacune, et pour une carte, le remplacement de l'image. La version livrée garde la forme de l'original (autant d'articles, autant de rubriques) : c'est ce qui permet de les comparer case par case.

### Les images

Le MJ dépose une image depuis l'outil Documents (une carte) ou l'écran Sceaux. Le navigateur la réduit à 2 000 pixels de côté si elle est trop grande ou trop lourde, puis l'envoie (`POST /api/mj/images`, 4 Mo au plus : Vercel refuse les envois de plus de 4,5 Mo). Le serveur ne garde que de vraies images (PNG, JPEG, WebP, GIF), reconnues à leurs premiers octets ; pas de SVG, qui peut contenir du code. Les dimensions sont celles que donne le navigateur du MJ.

Le fichier va dans le stockage Vercel Blob du projet, **en accès privé**, dans le dossier `images/` ; la table `images` garde sa fiche. C'est le même stockage que celui des sauvegardes. Aucune image n'a d'adresse publique : le site la sert lui-même, après vérification.

| Qui demande | Adresse | Servie si |
|---|---|---|
| Le MJ | `/api/mj/images/{image}` | toujours |
| Un joueur, l'image d'un document | `/api/joueur/plis/{pli}/images/{image}` | le pli est dans `plis_recus` pour lui (arrivé, pas détruit), **ouvert**, et sa version livrée cite cette image |
| Un joueur, l'image d'un sceau | `/api/joueur/sceaux/{image}` | ce sceau ferme un pli qu'il a reçu, même fermé, ou il le détient |

Dans tous les autres cas, la réponse est « introuvable », comme pour une image qui n'existe pas. La réponse est privée (aucun serveur intermédiaire ne la garde) ; le navigateur de la personne peut la garder. Ni l'adresse ni le chemin du fichier dans le stockage ne sortent jamais.

La copie quotidienne de la base contient les fiches des images, pas leurs fichiers : ils restent dans le stockage.

### Détruites

La liste des plis que les joueurs ont détruits, le plus récent en premier : qui l'avait reçu, de qui il venait, quand il a été détruit, depuis quel dossier, et s'il avait été lu. Le pli s'y lit dans la version que le joueur avait reçue. L'écran Correspondances (étape 13) reprendra ces informations.

### L'historique

Chaque geste du MJ sur un pli (traitement, changement de date ou de destinataire, copie, altération, mise à l'écart), et chaque destruction par un joueur, ajoute une ligne à la table `evenements`, avec l'état d'avant et d'après. Rien n'y est jamais effacé. L'atelier des altérations affiche l'historique d'un pli ; l'écran Correspondances (étape 13) le reprendra.

### La préparation

- **Personnages** : créer les personnages des joueurs et les PNJ, remplir leur fiche, donner à chaque joueur son adresse e-mail (c'est ce qui lui ouvre le site), choisir son écriture, tenir son carnet d'adresses.
- **Écritures** : voir les 14 écritures fournies, les renommer, marquer celles qui sont génériques.
- **Sceaux** : créer des sceaux, changer leur nom gravé ou leurs initiales, les faire changer de mains.
- **Réglages** : longueur d'un billet, quota, délai et hasard de livraison, premier jour du jeu. En bas, « Le temps du jeu » : la date du jeu d'aujourd'hui, et les bonds dans le temps (ajouter, retirer). Puis « Mes notifications », et « Sauvegardes » (voir plus bas).

Toutes les adresses de cet espace commencent par `/api/mj` côté serveur, et chacune vérifie que c'est bien le MJ qui demande. Un joueur connecté qui essaierait d'y entrer est refusé.

### Les écritures

Une écriture est une police manuscrite fournie avec le site. La liste est dans `web/src/theme/ecritures.ts`, et la base en garde une ligne par police. Le MJ ne crée pas d'écriture : en ajouter une demande d'ajouter la police au site, puis une migration.

Deux joueurs ne peuvent pas avoir la même écriture : c'est la base elle-même qui le refuse.

### Les sceaux

Un sceau est un objet, avec un nom gravé qui ne change pas quand il change de mains. À la création d'un personnage, le site propose de lui créer un sceau à son nom. Dans l'habillage neutre, un sceau est dessiné comme un simple cachet portant des initiales. Le MJ peut lui donner une image (écran Sceaux) : elle est alors gravée dans la cire à la place des initiales, et les états d'un sceau trafiqué (brisé, recollé, contrefait) se dessinent par-dessus.

## Ce que garde le navigateur

Un texte en cours d'écriture est gardé dans le navigateur (`localStorage`), pour qu'une page fermée ou un réseau absent ne fasse rien perdre. Tout passe par `web/src/outils/memoire.ts` ; les clés commencent par `epistolaire:`.

| Clé | Écran | Oubliée |
| --- | --- | --- |
| `mj:document` | Documents (MJ) : gabarit, contenus, expéditeur, sceau, destinataires, dates | à l'envoi, par « Tout effacer » |
| `mj:reponse:<lettre>` | Réponse d'un PNJ, sous une lettre de la file | quand la lettre est traitée ou écartée |
| `billet:<brouillon>` | Billet d'un joueur, tant que le serveur ne l'a pas reçu | dès que le serveur l'a, à l'envoi, au jet |

- La copie d'un billet note l'état du serveur sur lequel elle s'appuie. Elle ne reprend la main que si le serveur n'a pas changé depuis ; sinon le brouillon a été repris sur un autre appareil, et la copie est oubliée.
- Le stockage peut manquer (navigation privée) : tout fonctionne sans lui.
- La déconnexion efface toutes les clés du site : un appareil peut changer de mains.
- Un contenu gardé est complété par les cases vides de son gabarit à la relecture : une case ajoutée plus tard ne casse pas un document gardé avant.

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

## Sauvegarde et restauration

### La copie quotidienne

Chaque jour à 4 h du matin, heure de Paris, une tâche planifiée (`GET /api/taches/sauvegarde`, déclarée dans `vercel.json` avec le fuseau `Europe/Paris`) copie toute la base :

1. Toutes les tables du schéma `public` sont lues dans une seule transaction en lecture seule : la copie montre la base telle qu'elle était à un instant précis, sans lettre à moitié envoyée.
2. Elles forment un seul document JSON (`structure` : le numéro de la dernière migration ; `faite_le` ; `tables` : chaque table et toutes ses lignes), compressé en gzip. Quelques kilo-octets aujourd'hui.
3. Il est déposé dans le stockage **Vercel Blob** du projet, **en accès privé** : les copies contiennent les adresses e-mail des joueurs. Nom : `sauvegardes/AAAA-MM-JJ-HHMMSS-mmm.json.gz`, à l'heure de Paris. Un nom déjà pris n'est jamais écrasé.
4. Ensuite seulement, les copies de plus de 30 jours sont supprimées. Si la copie du jour échoue, rien n'est supprimé.
5. Si quelque chose échoue, le MJ reçoit un e-mail « La copie de la base a échoué », à l'adresse de `MJ_EMAIL` (ou de `SMTP_USER`) : elle ne dépend pas de la base, qui est peut-être en cause.

La tâche a la même garde que celle des notifications (`CRON_SECRET`). Vercel n'a pas de bibliothèque Blob en Rust : `src/sauvegarde/blob.rs` parle directement à son API, comme la bibliothèque officielle `@vercel/blob`. Sur Vercel, le site s'identifie auprès du stockage avec le jeton OIDC que Vercel joint à chaque requête, et l'identifiant `BLOB_STORE_ID` (comme la bibliothèque officielle depuis que Vercel relie les stockages ainsi) ; en local, avec le jeton fixe `BLOB_READ_WRITE_TOKEN`. Aucun de ces jetons n'est jamais envoyé ailleurs qu'à Vercel.

En plus de ces copies, Neon garde un historique court de la base (quelques heures) : il permet de revenir à un instant précis, s'il est encore temps.

### Ce que voit le MJ

Dans ses Réglages, la section « Sauvegardes » liste les copies (date, taille), avec un bouton « Faire une copie maintenant » (à faire avant toute manipulation risquée) et un bouton « Télécharger » par copie. Le téléchargement passe par le serveur, qui seul a le jeton du stockage. Une fonction Vercel ne renvoie pas plus de 4,5 Mo : au-delà, il faudra télécharger depuis le tableau de bord de Vercel (Storage, puis le stockage `epistolaire-sauvegardes`).

### Restaurer, pas à pas

On ne restaure **jamais** vers la base du site en ligne sans l'accord explicite du MJ. On restaure dans une base neuve, puis on décide.

1. Récupérer la copie : bouton « Télécharger » des Réglages, ou tableau de bord de Vercel.
2. Créer une base vide : une base PostgreSQL locale (`createdb epistolaire_restauree`), ou une branche Neon vide.
3. Lancer : `cargo run --bin restaurer -- <fichier.json.gz> <adresse de la base>`.
4. Le programme refuse une base qui contient déjà du courrier, ou dont la structure est plus récente que la copie. Il applique les migrations jusqu'au numéro de la copie (pas au-delà), vérifie que la copie contient toutes les tables de cette structure et que chaque ligne a les bonnes colonnes, charge tout dans une seule transaction, dans l'ordre des dépendances (un personnage avant ses plis), remet les compteurs à niveau, et compare le nombre de lignes de chaque table avant de valider. Au moindre problème, aucune donnée n'est chargée.
5. Regarder la base restaurée. Pour la mettre en service, il suffit de faire pointer `DATABASE_URL` et `DATABASE_URL_UNPOOLED` dessus : au démarrage, le site appliquera les migrations plus récentes que la copie.

Le programme `sauvegarder` fait l'inverse, sans passer par Blob : `cargo run --bin sauvegarder -- <adresse de la base> <fichier.json.gz>`.

La restauration n'exige pas les droits d'administrateur de la base : charger les tables dans l'ordre de leurs dépendances évite de suspendre les contrôles de clés, ce que Neon n'autorise pas forcément.

## Les garde-fous automatiques

- **Requêtes SQL vérifiées à la compilation.** Une requête qui ne correspond pas à la base empêche le site de se construire. La vérification s'appuie sur le dossier `.sqlx/`, donc elle marche aussi sur Vercel, sans base à portée de main.
- **Types partagés.** Les types de l'interface sont générés depuis ceux du serveur. Si le serveur change une réponse, l'interface ne se construit plus tant qu'elle n'a pas suivi.

### Les tests de confidentialité

`tests/confidentialite.rs` prouve qu'un joueur ne reçoit jamais ce qu'il ne doit pas voir. Deux parties :

- **Sans base**, à chaque `cargo test` :
  - l'inventaire des routes : le test lit `src/acces/joueur/mod.rs` et `src/lib.rs`, et échoue si une route n'est pas dans sa liste de routes vérifiées. Une route de joueur ajoutée sans test fait donc échouer `cargo test` ;
  - la règle du code : aucun fichier de `src/acces/joueur/` ne lit ni n'écrit les tables `plis` et `exemplaires` (`from`, `join`, `update`, `into`), sauf les deux requêtes permises de `ecritoire.rs` (le compte du quota, l'envoi).
- **Avec base**, par `essais/confidentialite.sh` : une base à part, `epistolaire_tests`, est vidée et remplie de `tests/donnees/confidentialite.sql`. Ce jeu couvre chaque état d'un pli (brouillon, dans la file, en route, retenu, perdu, arrivé fermé, ouvert, altéré sans que ce soit remarqué, redirigé, détruit), les affaires d'un autre joueur, les notes du MJ, une information étiquetée, et chaque secret porte un marqueur facile à chercher. Le test appelle alors **chaque** route des joueurs, pour Alix et pour Bertrand, avec tous les identifiants du jeu (les siens et ceux des autres), et vérifie :
  - qu'aucune réponse ne contient un marqueur interdit, une adresse e-mail (pas même la sienne), l'identifiant d'un auteur caché, d'un pli, d'un exemplaire qui n'est pas arrivé chez lui, ni une date réelle (seuls ses brouillons ont la leur) ;
  - qu'un pli altéré paraît intact quand rien n'est remarqué, et que le texte d'un passage abîmé ne sort jamais (ni à la lecture du pli, ni dans les listes) ;
  - que les gestes interdits (ouvrir, ranger, détruire le pli d'un autre ou un pli pas encore arrivé ; lire, modifier, envoyer, jeter le brouillon d'un autre ou une lettre envoyée ; toucher le dossier d'un autre) répondent « introuvable » et ne changent **rien** dans la base (empreinte de toutes les tables avant et après) ;
  - qu'une image ne se sert qu'à qui a le droit de la voir (un faux stockage, lancé par le test, répond les octets) : celle d'une carte fermée, en route, détruite, d'un autre joueur, ou remplacée par le MJ dans son exemplaire, répond « introuvable » ;
  - que chaque route du MJ répond 403 à un joueur et 401 sans session, et chaque tâche 401 sans le secret, même pour le MJ connecté. Ces deux listes sont relues automatiquement dans le code.

Le test ne touche jamais une base dont le nom ne finit pas par `_tests`. Il a été vérifié une fois en retirant volontairement le filtre « ce pli est-il à lui ? » : il échoue alors, comme prévu.

Sans `EPISTOLAIRE_TESTS_BASE`, la partie avec base s'annonce « ignorée » et réussit : `cargo test` sert aussi à générer les types, il doit marcher sans base.

## Les essais

Le dossier `essais/` contient des parcours qui utilisent le site comme le ferait une personne, dans un vrai navigateur : se connecter, préparer la partie en MJ, écrire et envoyer en joueur, traiter la file et suivre les plis en route en MJ, recevoir, ouvrir, ranger et détruire en joueur. Ils vérifient aussi ce qui ne doit pas être possible : lire une lettre envoyée, lire le brouillon d'un autre, entrer chez le MJ en étant joueur, dépasser son quota, traiter deux fois la même lettre, modifier un pli arrivé, ouvrir un pli pas encore arrivé ou celui d'un autre, toucher aux dossiers d'un autre.

Le geste d'ouverture au doigt est essayé avec de vrais événements tactiles envoyés au navigateur.

Le parcours `notifications` appelle la tâche avec le secret d'essai, fait « arriver » des plis en avançant leur date, et remplace le service de notifications par un faux, qui déchiffre ce qu'il reçoit et vérifie la signature. Les autres parcours passent l'écran du premier choix en cliquant « Plus tard » (`essais/commun.cjs`).

Le parcours `sauvegarde` remplace le stockage Vercel Blob par un faux, lancé sur la machine (variable `VERCEL_BLOB_API_URL`). Il vérifie la liste, la copie à la main, le ménage des copies de plus de 30 jours, le téléchargement, la garde de la tâche, et l'e-mail au MJ quand le stockage est en panne. `essais/restauration.sh` copie une base remplie, la restaure dans une base neuve et compare chaque table ligne à ligne, puis vérifie les refus (base qui contient déjà du courrier, copie à laquelle il manque une table).

Le parcours `alterer` falsifie une lettre dans l'atelier (réécriture, passage abîmé, sceau recollé, signature contrefaite, faussaire), pour deux destinataires dont un seul remarque quelque chose, puis lit la lettre de chacun. Il garde toutes les réponses faites aux joueurs et y cherche l'original et le texte abîmé : ils ne doivent être nulle part. La lettre d'essai contient un émoji, pour que les positions des passages soient vérifiées là où le navigateur et le serveur ne comptent pas pareil. `essais/vue-plis-recus.sql` montre ce que la vue laisse voir de chaque cas, passages abîmés et mal formés compris, y compris dans les cases des autres gabarits.

Le parcours `documents` envoie les six gabarits à deux joueurs à des dates différentes, par l'écran et directement, avec un faux stockage pour les images. Il vérifie les refus (au nom d'un joueur, signature sur un gabarit imprimé, sceau non détenu, image inexistante, fichier qui n'est pas une image…), la forme des plis fermés, chaque gabarit au téléphone, l'altération d'une case d'article et le remplacement de l'image d'une carte, et surtout le service des images : refusée avant l'arrivée, avant l'ouverture, à l'autre joueur, par la mauvaise route ; servie ensuite, identique au fichier déposé. Aucune réponse faite à un joueur ne contient une adresse du stockage.

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

## L'interface, en trois morceaux

Le navigateur charge d'abord la connexion, puis, une fois qu'il sait qui est connecté, l'espace du MJ ou celui des joueurs (`RoutesMj.tsx`, `RoutesJoueur.tsx`). Un joueur ne télécharge donc jamais le code des écrans du MJ, et son téléphone charge moins.

## Avant et après le lancement

`docs/REPETITION.md` est la liste à suivre : les gestes du MJ dans Vercel (stockage, une base par aperçu, accès public), la répétition générale, puis le nettoyage. `outils/nettoyer-lancement.sql` efface tout ce qui vient des essais ; il montre ce qu'il ferait et n'applique rien tant qu'on ne remplace pas sa dernière ligne.

Une fois la partie lancée : toute modification passe par un aperçu validé ; une correction de données en ligne passe par un script relu et accepté par le MJ, après une sauvegarde ; les mises en ligne se font de préférence quand les joueurs n'écrivent pas.

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
| `VAPID_SUJET` | Le contact donné aux services de notifications : `mailto:` suivi d'une adresse, ou l'adresse `https://` du site. Sur Vercel, c'est l'adresse e-mail du MJ, à sa demande : les services de notifications (Google, Apple…) le contactent en cas de souci avec les envois |

Ces quatre variables sont posées dans Vercel (site en ligne et aperçus) depuis l'étape 8. `CRON_SECRET` et `VAPID_PRIVATE` y sont de type « sensible » : personne ne peut plus les relire, pas même depuis le tableau de bord. Pour en changer, en tirer de nouvelles. Changer la paire VAPID oblige chacun à réactiver les notifications sur ses appareils.
| `BLOB_STORE_ID` | L'identifiant du stockage Vercel Blob des sauvegardes et des images (`epistolaire-sauvegardes`, privé, Francfort). Vercel l'ajoute tout seul quand le stockage est relié au projet (site en ligne et aperçus). Le site s'identifie auprès du stockage avec le jeton OIDC que Vercel joint à chaque requête (en-tête `x-vercel-oidc-token`) : aucun jeton fixe n'est nécessaire |
| `BLOB_READ_WRITE_TOKEN` | L'ancienne façon de relier le stockage : un jeton fixe. Il ne sert plus que pour les essais locaux et les programmes `sauvegarder`/`restaurer` lancés hors de Vercel. Sans lui ni `BLOB_STORE_ID`, aucune copie ne se fait, aucune image ne se dépose ni ne s'affiche, et le site le dit |
| `VERCEL_BLOB_API_URL` | Pour les essais seulement : l'adresse d'un faux stockage. Jamais sur Vercel |
| `SITE_URL` | L'adresse du site, pour les liens des e-mails envoyés par la tâche. Facultatif : par défaut, celle que Vercel donne au site en ligne ou à l'aperçu |

En local, `.env.exemple` donne un `CRON_SECRET` et une paire de clés VAPID d'essai, qui ne servent qu'aux essais.
