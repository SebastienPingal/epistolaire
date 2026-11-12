# Étape 8 : notifications et site installable

## Ce que le MJ verra

Le site prévient : une pastille sur la Réception, un e-mail ou une notification sur le téléphone quand un pli arrive, un rappel quand un pli reste fermé. Le MJ est prévenu quand une lettre arrive dans sa file, et alerté quand une date proposée approche sans qu'il ait validé. Le site s'installe sur l'écran d'accueil du téléphone, comme une application.

L'installation du site, prévue à l'étape 9, est faite ici : sur iPhone, les notifications du navigateur n'existent que pour un site installé.

## Déjà décidé

Voir `DECISIONS.md`, section « Notifications ».

- Une notification est discrète : « Un pli vous attend », sans expéditeur ni contenu.
- Trois canaux, chacun au choix du joueur : notifications du navigateur, e-mail à chaque arrivée, e-mail de rappel quand un pli reste fermé après un délai qu'il fixe.
- Le choix est proposé à la première connexion, et modifiable à tout moment. Sans choix, seulement la pastille.
- Pas d'heures de silence.
- Le MJ choisit ses canaux comme les joueurs. Il est prévenu des nouvelles lettres dans sa file, et alerté quand une date proposée approche sans validation.
- **Retard toléré** (décidé le 12 novembre) : l'alerte peut partir jusqu'à 15 minutes après l'arrivée du pli. On se contente des planifications de Vercel, sans service extérieur.

## Vérification préalable : ce que permet l'offre Vercel

À faire **avant tout le reste**.

- Les tâches planifiées de Vercel ne tournent que sur le site en ligne (pas sur les aperçus), et leur fréquence dépend de l'offre de l'équipe `Brume`.
- Vérifier l'offre et la limite de fréquence : documentation Vercel (outil `search_vercel_documentation`, « cron jobs pricing », « schedules limits »), et réglages de l'équipe.
- Si une tâche toutes les 10 minutes est permise : la prévoir dans `vercel.json` (`"crons": [{ "path": "/api/taches/notifications", "schedule": "*/10 * * * *" }]`).
- Si l'offre ne permet qu'une tâche par jour : **s'arrêter et demander au MJ**. Options à lui présenter :
  - un déclencheur gratuit extérieur, par exemple une tâche planifiée GitHub Actions toutes les 10 minutes qui appelle l'adresse de la tâche avec son secret (le plus simple) ;
  - des alertes une fois par jour seulement ;
  - une offre Vercel payante.

## Questions au MJ

1. **Alerte du MJ.** « Combien de temps avant la date de livraison proposée voulez-vous être alerté, si vous n'avez pas encore validé la lettre ? »
   - (Recommandé) 2 heures avant. · 6 heures avant. · 12 heures avant.
2. **Nouvelles lettres.** « Quand plusieurs lettres arrivent dans votre file en peu de temps, comment être prévenu ? »
   - (Recommandé) Un seul message qui les regroupe (« 3 nouvelles lettres à traiter »). · Un message par lettre.
3. **Rappel.** « Après combien de temps un pli fermé déclenche-t-il le rappel, par défaut ? Le joueur peut le changer. »
   - (Recommandé) 24 heures. · 12 heures. · 48 heures.
4. **Pastille.** « La pastille sur la Réception montre-t-elle le nombre de plis fermés, ou un simple point ? »
   - (Recommandé) Le nombre. · Un simple point.

## Tâches

### 8.1 Base de données (une migration)

```sql
-- Les choix de chaque compte. Sans ligne, ou choisi_le vide : le choix n'a pas encore été fait.
create table preferences_notification (
    compte_id      uuid primary key references comptes (id) on delete cascade,
    navigateur     boolean not null default false,
    email_arrivee  boolean not null default false,
    email_rappel   boolean not null default false,
    rappel_heures  integer not null default 24 check (rappel_heures between 1 and 168),
    choisi_le      timestamptz
);

-- Les navigateurs abonnés aux notifications (un compte peut en avoir plusieurs : téléphone, ordinateur).
create table abonnements_navigateur (
    id          uuid primary key default gen_random_uuid(),
    compte_id   uuid not null references comptes (id) on delete cascade,
    endpoint    text not null unique,
    cle_p256dh  text not null,
    cle_auth    text not null,
    cree_le     timestamptz not null default now()
);

-- Ce qui a déjà été signalé, pour ne jamais prévenir deux fois.
alter table exemplaires add column notifie_le timestamptz, add column rappele_le timestamptz;
alter table plis add column mj_prevenu_le timestamptz, add column mj_alerte_le timestamptz;
```

Dans la même migration, marquer comme déjà signalé tout ce qui existe : les exemplaires déjà arrivés (`notifie_le = now()`), les lettres déjà dans la file (`mj_prevenu_le = now()`), et celles dont la date est déjà proche ou passée (`mj_alerte_le = now()`). Sinon, la première tâche enverrait une avalanche.

Ces colonnes ne vont jamais dans la vue `plis_recus`.

### 8.2 La tâche planifiée (`src/taches/`)

Une troisième porte, à côté de celles des joueurs et du MJ : `src/taches/mod.rs`, routes sous `/api/taches`, documentée dans `CLAUDE.md` et `docs/FONCTIONNEMENT.md`.

- **Garde.** Vercel appelle la tâche en `GET` avec l'en-tête `Authorization: Bearer <CRON_SECRET>`. Refuser (401) tout appel sans ce secret. Variable d'environnement `CRON_SECRET`, à créer par le MJ dans Vercel ; en local, `CRON_SECRET=essai` dans `.env.exemple`.
- **Hors du site en ligne** (`VERCEL_ENV` différent de `production`, ou absent) : les e-mails et notifications destinés à un autre compte que celui du MJ sont écrits dans le journal au lieu de partir. Ainsi un essai en aperçu ou en local ne prévient jamais un vrai joueur.
- **`GET /api/taches/notifications`**, en une passe :
  1. **Arrivées.** Les exemplaires arrivés (`acheminement = 'en_route' and livraison_le <= now()`), pas encore signalés (`notifie_le is null`), dont le destinataire est un joueur avec un compte. Les verrouiller (`for update skip locked`), les marquer `notifie_le = now()`, **puis** prévenir chaque compte une seule fois, selon ses choix : un e-mail si `email_arrivee`, une notification à chacun de ses navigateurs si `navigateur`. On préfère manquer une alerte plutôt qu'en envoyer deux.
  2. **Rappels.** Les exemplaires signalés, pas ouverts, pas encore rappelés, arrivés depuis plus de `rappel_heures`, pour les comptes qui ont choisi `email_rappel`. Un seul e-mail par compte. Marquer `rappele_le`.
  3. **MJ, nouvelles lettres.** Les plis `a_traiter` avec `mj_prevenu_le is null` : un message au MJ selon ses choix (regroupé ou non, selon la question 2), puis `mj_prevenu_le`.
  4. **MJ, dates proches.** Les plis `a_traiter` dont `date_proposee <= now() + <délai de la question 1>` et `mj_alerte_le is null` : une alerte, puis `mj_alerte_le`.
  5. Renvoyer un petit résumé chiffré, pour le journal.
- Les exemplaires remis à un PNJ ne déclenchent rien.

### 8.3 Les e-mails

- Par `src/courriel.rs`, qui existe.
- Les textes sont vus par les joueurs : les ranger dans un module `src/theme.rs` (le vocabulaire du serveur), avec un commentaire qui renvoie à `web/src/theme/neutre.ts`.
- Arrivée : sujet « Un pli vous attend », texte « Un pli vous attend. » suivi de l'adresse de la Réception. Rappel : sujet « Un pli vous attend toujours ». Rien sur l'expéditeur ni le contenu.
- L'adresse du site : nouvelle variable `SITE_URL` (la tâche n'a pas de requête de navigateur d'où la déduire).

### 8.4 Les notifications du navigateur (Web Push)

C'est la partie la plus risquée : la faire **en premier**, avec un essai réel sur l'aperçu.

- **Les clés.** Une paire de clés VAPID : `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUJET` (`mailto:` suivi de l'adresse d'envoi). Les générer une fois, les donner au MJ pour Vercel, ne jamais les commiter.
- **La bibliothèque.** Essayer d'abord `web-push` (0.11, `rust-version` 1.80). Vérifier qu'elle compile avec `cargo +1.92.0 check` **et** sans OpenSSL (`cargo tree -i openssl-sys` vide). Si OpenSSL arrive par une dépendance, écrire le chiffrement soi-même avec les bibliothèques RustCrypto (`p256`, `hkdf`, `aes-gcm`, `sha2`), selon les RFC 8291 (chiffrement `aes128gcm`) et 8292 (VAPID), avec un test unitaire sur l'exemple de l'annexe A de la RFC 8291. L'envoi se fait en HTTP (`reqwest` avec `rustls`, vérifier sa `rust-version`).
- **Contenu de la notification** : `{ "titre": "<nom du site>", "texte": "Un pli vous attend.", "url": "/reception" }`. Rien d'autre.
- Un abonnement qui répond 404 ou 410 est supprimé.
- **Routes** :
  - `GET /api/notifications/cle` : la clé publique (sans connexion).
  - `GET`/`PUT /api/joueur/notifications` et `GET`/`PUT /api/mj/notifications` : les choix du compte. Le traitement commun vit dans un module partagé qui prend l'identifiant du compte. Un `Joueur` ne connaît que son personnage : retrouver le compte par `personnages.compte_id`.
  - `POST`/`DELETE /api/joueur/abonnements` et `/api/mj/abonnements` : enregistrer ou retirer le navigateur courant.

### 8.5 Le site installable

- `web/public/manifest.webmanifest` : nom et nom court (ceux du thème : « Correspondance »), `start_url: "/"`, `display: "standalone"`, couleurs du thème (`#f6f1e7` pour le fond, `#2b2620` pour la barre), icônes 192 et 512 px, dont une « maskable ».
- Icônes : un cachet simple aux couleurs du thème, dessiné en SVG puis rendu en PNG (par exemple avec Playwright). Garder le SVG source dans `web/src/theme/`.
- `web/index.html` : lien vers le manifeste, `theme-color`, `apple-touch-icon` (180 px), `apple-mobile-web-app-capable`, `apple-mobile-web-app-title`.
- `web/public/sw.js`, le service worker :
  - `push` : afficher la notification (titre, texte), avec `tag: 'pli'` pour que plusieurs arrivées n'en fassent qu'une ;
  - `notificationclick` : ouvrir ou ramener le site sur `url`.
  - Il ne met pas l'API en cache. Pas de mode hors connexion pour l'instant.
- Enregistrer le service worker dans `web/src/main.tsx`.
- `vercel.json` : `Cache-Control: no-cache` pour `/sw.js`. Vérifier que `/sw.js` et `/manifest.webmanifest` sont bien servis tels quels, et pas réécrits vers `index.html`.

### 8.6 Interface

- **Le premier choix.** Après la connexion, si le compte n'a pas encore choisi, un écran le propose :
  - pour un joueur, écran immersif, mots du thème : les trois canaux, et le délai du rappel ;
  - pour le MJ, écran d'outil ;
  - « Plus tard » enregistre un choix vide : on ne repropose pas.
- **Le navigateur.** Demander la permission seulement quand la personne active ce canal (le navigateur l'exige). Sur iPhone, hors site installé, ce canal est grisé, avec une phrase qui explique comment installer le site sur l'écran d'accueil.
- **Changer d'avis** : dans la Fiche du joueur, et dans les Réglages du MJ (section « Mes notifications »).
- **La pastille.** `GET /api/joueur/pastille` renvoie le nombre de plis non ouverts (lu dans `plis_recus`). Elle s'affiche sur « Réception » dans la navigation, se relit au changement d'écran, au retour sur l'onglet, et chaque minute tant que l'onglet est visible. Sur le site installé, `navigator.setAppBadge` quand il existe. Pour le MJ : le nombre de lettres à traiter sur « À traiter ».

### 8.7 Parcours d'essai `notifications`

- `.env.exemple` : `CRON_SECRET=essai`, et des clés VAPID d'essai générées pour le local (sans valeur réelle).
- Un faux service de notifications : un petit serveur Node dans le parcours, qui reçoit les envois et les garde pour vérification.

Vérifications :

- Première connexion : l'écran de choix apparaît. Choisir e-mail à l'arrivée et rappel. Seconde connexion : il n'apparaît plus.
- Un pli arrive (date avancée en SQL), on appelle `/api/taches/notifications` avec le secret : le journal du serveur contient un e-mail « Un pli vous attend » pour Alix, sans le nom de l'auteur ni un mot du texte. Un deuxième appel n'envoie rien.
- Un joueur sans canal ne reçoit rien. Un pli remis à un PNJ ne déclenche rien.
- Pastille : 1 avant l'ouverture, 0 après.
- Rappel : arrivée reculée de 25 heures en SQL, puis tâche : un rappel, une seule fois.
- MJ : une nouvelle lettre dans la file donne un message ; une date proposée proche donne une alerte ; une seule fois chacune.
- Sans secret : 401. Un joueur connecté n'appelle pas la tâche.
- Abonnement navigateur : enregistré via l'API avec l'adresse du faux service ; la tâche lui envoie une requête avec un en-tête `Authorization` VAPID, `Content-Encoding: aes128gcm` et un corps chiffré. Un abonnement qui répond 410 est supprimé.
- Le manifeste est servi, le service worker s'enregistre (`navigator.serviceWorker.ready`).
- Captures : `e8-tel-choix.png`, `e8-tel-pastille.png`, `e8-tel-fiche-notifications.png`, `e8-mj-reglages.png`.

### 8.8 Essai réel, avec le MJ

Une fois l'aperçu construit (les clés et `CRON_SECRET` posés dans Vercel) :

1. le MJ installe le site sur son téléphone et active les notifications ;
2. l'agent appelle la tâche de l'aperçu avec le secret ;
3. le MJ confirme qu'il a reçu la notification et l'e-mail.

Tant que les aperçus partagent la base du site en ligne, cet appel marque aussi des plis réels comme signalés : sans conséquence avant le lancement, puisqu'il n'y a pas encore de vrais joueurs.

### 8.9 Documentation

- `docs/FONCTIONNEMENT.md` : une partie « Notifications » (la tâche, sa garde, ce qu'elle envoie), une partie « Le site installé » ; les variables `CRON_SECRET`, `SITE_URL`, `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUJET`.
- `CLAUDE.md` : la troisième porte, `/api/taches`, et sa règle (garde par secret, rien ne part vers un joueur hors du site en ligne).
- `DECISIONS.md` : la fréquence réelle obtenue, et les réponses du MJ.

## Pièges

- La première exécution de la tâche ne doit pas prévenir de tout l'historique : c'est le rôle du marquage dans la migration.
- Marquer **avant** d'envoyer, sous verrou : deux exécutions simultanées ne doivent jamais envoyer deux fois.
- La permission du navigateur ne se demande qu'après un geste de la personne.
- Sur iPhone, rien ne marche hors du site installé : le dire à l'écran, sans jargon.
- Une notification ne dit jamais qui écrit ni ce qui est écrit.

## Points à relire

- Le chiffrement des notifications (s'il est écrit à la main) et son test sur l'exemple de la RFC.
- La garde de `/api/taches`, et le blocage des envois vers les joueurs hors du site en ligne.
- Le contenu des e-mails et des notifications : rien sur l'expéditeur.

## Terminé quand

- Tous les parcours passent, `notifications` compris.
- Sur l'aperçu, le MJ a reçu une notification sur son téléphone, avec le site installé, et un e-mail.
- La fréquence de la tâche sur le site en ligne est connue et notée.
