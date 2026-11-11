# Jeu de rôle épistolaire : décisions de conception

Ce document est tenu à jour au fil des échanges de conception.
Dernière mise à jour : conception terminée (sujets 1 à 9), réalisation commencée (voir `PLAN.md`).

## Avancement

| # | Sujet | État |
|---|---|---|
| 1 | Périmètre | Tranché |
| 2 | Côté joueur | Tranché |
| 3 | Côté MJ | Tranché |
| 4 | Dés | Reporté au second temps (sauf détection en V1) |
| 5 | Accès et confidentialité | Tranché |
| 6 | Données | Tranché |
| 7 | Rendu | Tranché |
| 8 | Notifications | Tranché |
| 9 | Technique | Tranché |

---

## Cadre

- Pas de tours : le jeu est un flux continu, et chaque lettre a un délai de réception.
- Le jeu a son propre calendrier : un jour réel vaut un jour de jeu.
- Les délais ne sont pas visibles pour les joueurs : ni estimation, ni règle connue.
- Le joueur ne sait pas si sa lettre est arrivée.
- Destinataires possibles : les autres joueurs, les PNJ (le MJ répond en leur nom) et la gazette.
- Chaque lettre passe par le MJ. Il la valide, peut la modifier et l'envoie à qui il veut.
- Le hors-jeu reste sur WhatsApp ; le site est entièrement immersif.
- Le site doit être agréable sur téléphone comme sur ordinateur.
- Une seule campagne, entre amis.
- Claude développe et maintient tout le code. Les décisions et le fonctionnement du site sont documentés dans le repo.

## Périmètre de la V1

- Côté joueur : connexion, fiche de personnage (rôle et aptitudes en texte libre), rédaction avec limite de longueur, choix du destinataire, quota, documents reçus.
- Côté MJ : file d'attente et validation, altérations avec détection décidée par le MJ, délai de livraison proposé par le site et ajustable, écriture au nom d'un PNJ, création de documents, gazette par numéros, vue d'ensemble, informations étiquetées.
- Les actions des joueurs se déclarent dans les lettres. Le MJ les résout librement.
- Cartes, sous forme d'images dans les documents.
- Six gabarits à cases fixes.
- Notifications par le navigateur et par e-mail, au choix de chaque joueur.
- Lancement visé fin novembre ou début décembre.

## Espace joueur

- Tout le courrier reçu arrive dans le dossier Réception, par ordre d'arrivée, gazette comprise.
- Chaque pli arrive fermé, et l'ouvrir est un moment soigné.
- Le joueur crée ses propres dossiers pour ranger ses plis. Un pli ne se trouve qu'à un seul endroit à la fois.
- Une lettre est un objet physique : l'expéditeur n'en garde aucune copie, et l'envoi est définitif.
- Le brouillon est sauvegardé automatiquement tant que la lettre n'est pas envoyée.
- Un joueur peut avoir plusieurs brouillons en cours (20 au plus).
- L'envoi demande une confirmation, qui rappelle qu'on ne garde aucune copie.

## Rédaction

- La zone d'écriture est un billet qui se remplit, avec une jauge discrète et aucun chiffre affiché.
- La limite est de 500 caractères, réglable.
- Le billet peut déborder pendant qu'on écrit : la jauge le signale, et l'envoi est bloqué tant que le texte est trop long.

## Destinataires et rôles

- Une lettre a un seul destinataire. La gazette compte comme un destinataire.
- Chaque joueur a un carnet d'adresses, rempli et enrichi par le MJ.
- Le carnet ajoute automatiquement les personnages nommés par le sceau ou par la signature. Sinon, le MJ peut les ajouter à la main.
- Une option « autre destinataire » permet d'écrire une adresse libre, que le MJ interprète.
- Un joueur ne peut choisir comme destinataire qu'un personnage de son carnet. Pour quelqu'un d'autre, il passe par « autre destinataire ».
- Le rôle d'un personnage est décrit sur sa fiche. Dans chaque carnet, le MJ peut donner une qualité à un contact (« Bertrand, trésorier »). Chacun ne sait que ce qu'on lui a dit.

## Quota

- 3 lettres par semaine, réglable, avec une remise à zéro chaque lundi à 0 h, heure de Paris. Le joueur voit un simple compteur.
- Tout envoi compte : joueur, PNJ ou gazette. Les brouillons ne comptent pas.
- Une lettre perdue ou interceptée compte quand même.
- Le MJ peut ajuster le quota d'un joueur à tout moment.

## Expéditeur, sceau, signature et écriture

- Par défaut, le pli ne dit rien de l'expéditeur : seul le texte fait foi.
- Le sceau ferme le pli, à l'extérieur. C'est un objet possédé : le MJ l'attribue, le retire ou le transfère (vol, prêt). Un personnage peut en détenir plusieurs.
- Le sceau est visible avant l'ouverture et porte le nom de son propriétaire d'origine, même s'il a été volé.
- La signature est un élément à part, sous le texte, tracée dans l'écriture du personnage. Elle ne compte pas dans les 500 caractères. Seul le MJ peut la contrefaire.
- Le joueur choisit de sceller ou non, et de signer ou non. Sans sceau ni signature, la lettre est anonyme.
- Chaque personnage, PNJ compris, a sa propre écriture : une police manuscrite lisible, qui fait partie de l'habillage.
- Deux joueurs ne partagent jamais la même écriture. Les PNJ secondaires peuvent partager des écritures génériques.
- Il n'y a pas d'option « police lisible », pour ne pas effacer l'indice du changement d'écriture.

## Livraison

- Pour l'instant, tous les personnages sont à égale distance : un seul délai par défaut, réglable.
- Le site propose une date : moment de l'envoi, plus le délai par défaut, plus un peu de hasard réglable.
- Le MJ valide en un clic ou change librement la date. S'il valide après la date proposée, une nouvelle date proche est proposée.
- Chaque pli arrive à l'heure exacte calculée, de jour comme de nuit.

## Traitement par le MJ

- La file À traiter est triée par urgence : la lettre dont la date de livraison proposée est la plus proche vient en premier. Une alerte signale les dates déjà dépassées.
- Une lettre validée après sa date proposée arrive 10 minutes après la validation, sauf si le MJ choisit une autre date.
- Une date choisie dans le passé vaut « tout de suite ».
- Une lettre adressée à un joueur se valide en un clic : au destinataire visé, à la date proposée.
- Une lettre adressée à un PNJ reste dans la file tant que le MJ n'y a pas répondu, ou ne l'a pas classée sans réponse. La réponse s'écrit sous la lettre, et part dans le même geste.
- Un PNJ ne « reçoit » pas à une date : son exemplaire est arrivé et lu dès que le MJ répond ou classe. Il ne passe jamais par l'écran En route.
- Une lettre à une adresse libre : le MJ choisit un personnage existant, ou crée un PNJ à la volée, sans quitter l'écran. Le nom proposé est l'adresse écrite par le joueur.
- Une lettre adressée à la gazette attend la composition d'un numéro, rangée à part dans la file. D'ici là, le MJ peut l'écarter, ou la remettre à un personnage comme une lettre interceptée.
- Écarter, c'est mettre de côté une lettre sans destinataire précis (gazette ou adresse libre) : elle n'ira nulle part. Le MJ peut revenir sur ce choix. Une lettre qui a un destinataire ne s'écarte pas : elle se perd.
- Les copies pour des tiers partent même si l'exemplaire du destinataire est retenu ou perdu.
- Un personnage ne reçoit jamais deux exemplaires du même pli.
- Tant qu'un exemplaire n'est pas arrivé, le MJ peut changer sa date et son destinataire, le retenir, le perdre, le remettre en route, ou en faire partir une copie. Un pli retenu ou perdu peut toujours être remis en route. Une fois arrivé, il ne se modifie plus.
- Le MJ n'écrit qu'au nom d'un PNJ. Écrire au nom d'un joueur est une contrefaçon : elle viendra avec les altérations.
- Une lettre de PNJ ne passe pas par la file : elle part aussitôt, avec le délai habituel (plus ou moins le hasard) ou la date choisie par le MJ.
- Un PNJ sans écriture reçoit celle que le MJ choisit au moment d'écrire, et la garde. Les écritures génériques sont proposées en premier ; celles des joueurs ne le sont pas. Un PNJ sans sceau envoie un pli non scellé.
- Le MJ peut dépasser la longueur d'un billet : l'écran le lui signale, sans le bloquer.
- Les lettres du MJ ne comptent dans aucun quota.

## Altérations

- Les outils :
  - le texte : réécriture libre, et un outil pour abîmer un passage ;
  - le sceau : intact, brisé, recollé ou contrefait ;
  - la signature : intacte, retirée ou contrefaite ;
  - l'acheminement : livrer, rediriger, copier pour un tiers, retenir, perdre, changer la date.
- L'original est toujours conservé, avec l'historique des changements. Seul le MJ le voit.
- En V1, le MJ décide si chaque réécriture, sceau trafiqué ou signature contrefaite est remarqué. Par défaut, rien ne l'est. Pour un document à plusieurs destinataires, il décide pour chacun.
- Rien n'est remarqué : tout paraît normal.
- Une altération est remarquée : les passages réécrits et la signature apparaissent dans la main du faussaire, et le sceau montre qu'il a été trafiqué. Aucun message ne l'explique.
- Le MJ choisit la main du faussaire : un personnage précis ou une main inconnue.
- Le site repère seul les passages réécrits.
- Un passage abîmé est toujours visible.

## PNJ et documents

- Un seul outil pour tout ce qu'envoie le MJ : gabarit, expéditeur (PNJ, institution ou personne), contenu, destinataires, date.
- Un document peut avoir plusieurs destinataires, qui reçoivent chacun leur exemplaire. Même date par défaut, ajustable pour chaque destinataire.
- Ses plis arrivent comme les autres : pli fermé, dossier Réception, notification. Ils peuvent aussi être des faux, avec les mêmes outils.
- Par défaut, une lettre de PNJ suit les règles des joueurs : billet de 500 caractères, sceau, signature, écriture. Le MJ peut choisir un autre gabarit et dépasser la limite.
- Les documents sont libres. Les gabarits s'adaptent à la longueur du contenu.

## Gazette (l'ancienne zone commune)

- Elle paraît par numéros, composés par le MJ en rédacteur en chef.
- Les lettres adressées à la gazette s'accumulent dans la file du MJ. Il choisit celles qu'il publie, et peut les couper, les modifier ou les censurer. Il y ajoute ses propres articles, nouvelles et annonces.
- Le MJ fixe la date de parution, à un rythme libre. Il peut sortir une édition spéciale à tout moment.
- Chaque joueur reçoit son propre exemplaire dans sa Réception. Le MJ peut modifier un exemplaire en particulier.
- Les textes y sont recopiés ou imprimés : ni écriture ni sceau de l'auteur. La signature devient un simple nom, ou « anonyme ».
- Le nom « gazette » fait partie de l'habillage.

## Vue MJ

- Cinq écrans :
  - **À traiter**, la page d'accueil, classée par urgence, avec des alertes ;
  - **En route**, où les plis restent modifiables jusqu'à la livraison ;
  - **Personnages** ;
  - **Correspondances**, avec l'original et la version livrée côte à côte ;
  - **Chronologie**, avec des filtres et une recherche.
- Informations étiquetées : le MJ crée des informations et les rattache aux plis. Le site montre qui les a reçues et ouvertes, par quel chemin elles ont circulé, et ce que sait chaque personnage.

## Administration

- Le MJ crée les personnages des joueurs (un joueur, un personnage) et rédige leur fiche de départ.
- Il crée les PNJ à la volée, y compris au moment d'écrire en leur nom.
- Les sceaux sont générés (initiales et nom en légende) ou créés à partir d'une image importée.
- À la création d'un personnage, le site propose de lui créer un sceau à son nom.
- Le site fournit 14 écritures manuscrites. Le MJ les renomme et les attribue, mais n'en crée pas : en ajouter une se fait dans le code.
- Un personnage qui a déjà écrit ou reçu du courrier ne peut plus être supprimé. Un sceau qui a déjà fermé un pli non plus.
- Le MJ gère les carnets, les réglages généraux et des notes privées.
- La fonction « Voir comme » montre le site tel que le voit un joueur, sans rien ouvrir ni modifier.
- Écriture et sceau : le joueur choisit dans la sélection du MJ, sur un écran qui peut être habillé de façon immersive. Le MJ valide.

## Accès et confidentialité

- Connexion par e-mail : un lien et un code à 6 chiffres, utile sur le site installé.
- Le lien et le code sont valables 15 minutes et ne servent qu'une fois.
- On reste connecté 180 jours après la dernière visite. Seules les adresses enregistrées par le MJ peuvent se connecter.
- Une adresse inconnue reçoit la même réponse à l'écran qu'une adresse connue : le site ne dit pas qui a un compte.
- Sécurité légère : pas de double vérification, même pour le MJ.
- Le tri des informations se fait sur le serveur : un joueur ne reçoit jamais ce qu'il ne doit pas voir. Quelques tests automatiques le vérifient.
- Les joueurs ne voient aucune liste de personnages, seulement leur carnet.
- Données stockées : les adresses e-mail des joueurs, rien de plus.

## Données

| Objet | Ce qu'il contient | Qui le voit |
|---|---|---|
| Compte | Une adresse e-mail. C'est un compte MJ ou un compte joueur | Le MJ |
| Personnage | Nom ; joueur ou PNJ ; fiche (rôle, domaine, aptitudes, objectifs) ; écriture ; notes du MJ | La fiche : le joueur concerné. Les notes : le MJ |
| Écriture | Une police manuscrite. Unique pour chaque joueur, partageable entre PNJ secondaires | Tout le monde, à travers les plis |
| Sceau | Image ; nom gravé du propriétaire d'origine ; détenteur actuel | Son détenteur sait qu'il le possède. Les autres le voient sur les plis |
| Contact de carnet | Pour un joueur : un personnage, avec une qualité facultative | Ce joueur seulement |
| Pli | Auteur réel ; destinataire visé ; gabarit ; version originale (texte, sceau, signature, date d'envoi) ; état ; informations rattachées ; historique | Le MJ |
| Exemplaire | Ce que reçoit un destinataire précis : version livrée ; ce qu'il a remarqué ; date de livraison ; ouvert ou non ; dossier | Son destinataire, une fois livré, et seulement la version livrée. Le MJ |
| Numéro de gazette | Date de parution ; articles et lettres retenues. Un exemplaire par joueur | Chaque joueur, son exemplaire |
| Dossier | Un nom et des exemplaires rangés. La Réception est le dossier par défaut | Son joueur |
| Information | Un intitulé, des notes, les plis qui la contiennent | Le MJ |
| Réglages | Longueur, quota, remise à zéro, délai par défaut, hasard, fuseau horaire, calendrier | Le MJ. Le joueur n'en voit que les effets |

- Un pli est écrit une fois, mais chaque destinataire reçoit son propre exemplaire.
- La vie d'un pli : brouillon, à traiter, en route, livré, ouvert. En chemin, il peut être retenu, perdu, redirigé ou copié pour un tiers. Une lettre adressée à la gazette est intégrée à un numéro ou écartée.
- Un joueur ne voit jamais :
  - les originaux, ni le vrai auteur d'un pli ;
  - une altération qu'il n'a pas remarquée ;
  - les dates prévues, ni les plis en route ;
  - ce que deviennent ses lettres une fois envoyées, ni leur texte ;
  - les plis, dossiers, carnets et fiches des autres ;
  - les informations étiquetées, les notes du MJ, les comptes.
- Absents de la V1 : les tours, les stats et les dés, les charges.

## Rendu

- La V1 a un habillage neutre : apparence sobre et lisible, léger aspect papier, sceaux en simple cachet, vocabulaire générique.
- Tout ce qui dépend de l'univers, apparence et vocabulaire, est rassemblé dans un thème. On en écrira un nouveau quand l'univers sera choisi.
- Les gabarits sont fixes : chacun a ses cases. Certaines cases se répètent, comme les articles de la gazette.
- Les six gabarits de la V1 :
  - **billet** : texte de 500 caractères, signature, sceau ;
  - **lettre longue** : lieu et date, texte, signature, sceau ;
  - **gazette** : titre, numéro, date, articles répétables, courrier des lecteurs ;
  - **acte officiel** : autorité, objet, texte, formule finale, signature, sceau ;
  - **rapport** : titre, auteur, rubriques répétables ;
  - **carte ou illustration** : image, titre, légende.
- Le calendrier : un jour réel vaut un jour de jeu, avec des bonds dans le temps décidés par le MJ.
- Dans l'habillage neutre, les mois sont numérotés : « 12e jour du 3e mois, an 1 ».
- Seules les dates s'affichent, sans l'heure : date d'écriture sur la lettre, date d'arrivée dans la Réception.
- L'ouverture d'un pli se fait par un geste : glisser le doigt sur le sceau sur téléphone, cliquer et maintenir sur ordinateur. Un pli sans sceau se déplie de la même façon.
- Le son est désactivé par défaut. Les animations sont réduites si l'appareil le demande.
- Un réglage de taille du texte existe, sans changer la police. On peut aussi zoomer avec les doigts.

## Notifications

- Une notification reste discrète : « Un pli vous attend », sans expéditeur ni contenu.
- Chaque joueur choisit ses canaux, chacun séparément :
  - les notifications du navigateur ;
  - un e-mail à chaque arrivée ;
  - un e-mail de rappel quand un pli reste non ouvert, après un délai qu'il fixe.
- Le choix est proposé à la première connexion et modifiable à tout moment. Sans choix, le joueur ne voit que la pastille sur le site.
- Pas d'heures de silence : la notification part dès l'arrivée du pli, même la nuit.
- Le MJ choisit ses canaux comme les joueurs. Il est prévenu quand une lettre arrive dans sa file, et alerté quand une date proposée approche sans validation.

## Technique

- Stack : Rust pour le serveur, React pour l'interface.
- Composants de l'interface : shadcn/ui (variante Base UI), avec Tailwind CSS. Les couleurs et les polices de shadcn sont fournies par le thème.
- Hébergement : Vercel, sur le compte existant du MJ.
  - Interface React : fichiers statiques servis par Vercel.
  - Serveur Rust : une seule fonction Vercel (runtime Rust officiel) avec un routeur interne, sans processus permanent.
  - Livraison à l'heure exacte : aucune tâche ne « livre ». Un pli est livré dès que sa date est passée, et le serveur le calcule à chaque lecture.
  - Notifications à l'heure : planifications Vercel (Schedules), avec un contrôle régulier en secours. Les limites du plan restent à vérifier.
  - Images : Vercel Blob.
  - Région : Francfort (`fra1`) pour le serveur, et la même région pour la base, afin qu'ils soient proches l'un de l'autre et des joueurs.
- E-mails : envoyés depuis la boîte Gmail du MJ, par SMTP, pour l'instant. Pas de nom de domaine : le site reste en `.vercel.app`. Les identifiants ont été repris du projet Vercel `congres-champetre`.
- Le compte du MJ est celui de l'adresse de cette boîte d'envoi.
- Base de données : Neon (PostgreSQL), installée depuis la marketplace Vercel, offre gratuite. SQLite en simple fichier est impossible sur Vercel, faute de disque permanent. En Rust, les requêtes sont vérifiées à la compilation.
- Les types de l'interface sont générés automatiquement à partir de ceux du serveur.
- La structure de la base est mise à jour automatiquement par le serveur à son démarrage (migrations).
- Le tri de ce qu'un joueur voit est aussi inscrit dans la base : une vue ne contient que les exemplaires arrivés, en version livrée, avec les seules altérations remarquées.
- Déploiement : repo GitHub relié à Vercel. La branche principale met le site en ligne ; les autres branches ont une adresse d'aperçu pour tester.
- Sauvegardes : l'historique court de Neon, plus une copie quotidienne automatique de la base dans Vercel Blob, conservée 30 jours.
- Mises à jour pendant la partie : testées sur un aperçu avant la mise en ligne. Les changements de structure de la base ne doivent jamais perdre une lettre en route.
- Documentation du repo : ce `DECISIONS.md`, le plan de réalisation (`PLAN.md`), un guide de fonctionnement (`docs/FONCTIONNEMENT.md`), et un fichier d'instructions pour les prochaines sessions de Claude (`CLAUDE.md`).
- Les joueurs voient l'adresse personnelle du MJ comme expéditeur des e-mails. Un alias est possible.

## Second temps : dés, stats et compétences

- Le système de résolution, à isoler dans le code. Idée de départ : d100 sous la stat.
- La liste des stats et des compétences, définie par le MJ.
- Ce que le joueur voit de ses stats et des jets.
- L'historique des jets, et l'affichage de la probabilité de réussite pour le MJ.
- La détection des altérations passera par des niveaux de difficulté et un tirage au sort, modifié par les stats du destinataire.
- Peut-être un moyen dédié pour déclarer une action, hors des lettres.

## Plus tard

- V2 : écriture immersive, façon OmmWriter ou Zen Writer.
- Un thème adapté à l'univers choisi, avec ses propres noms de mois.
- Des gabarits en blocs réorganisables.
- Carte avec des zones : délais calculés selon les zones, la météo, etc. S'y ajouteront des moyens d'envoi réglables.
- Aléas du voyage proposés par le site, avec la carte et la météo.
- Suggestions automatiques d'informations dans les lettres, par mots-clés ou par IA.
- Un sceau dessiné à partir d'un masque importé (une image en noir et blanc), à la place des initiales.
- La vraie écriture du joueur transformée en police, et son propre dessin de sceau.
- Les rôles comme charges à part entière : titulaire, sceau de la charge, lettres adressées à la charge.
- Inventaires, ressources, colis et objets, hors sceaux.
- Remettre une lettre reçue à un autre personnage.
- Quota sous forme de jetons qui reviennent 7 jours après l'envoi.
- Un nom de domaine (une dizaine d'euros par an) et un service d'envoi dédié comme Resend, pour une adresse plus immersive.
- *(idée)* Exporter toute la campagne en fin de partie, en livre ou en PDF.

## Hypothèses à confirmer

- Budget de 0 € : plan Vercel existant, offres gratuites de Neon et de Vercel Blob, boîte mail du MJ. Les limites des offres gratuites sont à vérifier à la mise en place.

## Questions ouvertes

- Pour l'instant, les aperçus et le site en ligne partagent la même base. Avant le lancement, les aperçus doivent travailler sur une copie (branches Neon), pour qu'un essai ne touche jamais les vraies lettres.
- Les limites des offres gratuites (Vercel Schedules, Neon, Blob), à vérifier à la mise en place.
- Sur l'offre gratuite de Vercel, une planification peut partir avec jusqu'à 15 minutes de retard. Le pli, lui, arrive à l'heure exacte ; seule sa notification pourrait tarder. À trancher à l'étape des notifications.
