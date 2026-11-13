// Parcours « notifications » : le premier choix, la tâche planifiée et sa garde, les e-mails
// d'arrivée et de rappel, les alertes du MJ, la pastille, les notifications du navigateur
// (vers un faux service qui les déchiffre), le manifeste et le service worker.
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const { execFileSync } = require('child_process');
const { surveillerPremierChoix } = require('./commun.cjs');
const [dossier, journal] = process.argv.slice(2);
const lireJournal = () => fs.readFileSync(journal, 'utf8');
const dernier = (re) => { const m = [...lireJournal().matchAll(re)]; return m.length ? m[m.length - 1][1] : null; };
const ok = (nom, cond = true) => console.log((cond ? 'OK   ' : 'ECHEC') + ' ' + nom);
const sql = (requete) => execFileSync('psql', [process.env.DATABASE_URL, '-At', '-c', requete]).toString().trim();
const base = 'http://localhost:5173';
const serveur = 'http://localhost:8787';
const id = (suffixe) => `00000000-0000-0000-0000-0000000000${suffixe}`;
const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

// Les morceaux du journal qui concernent une adresse (e-mails et notifications).
const blocs = () => lireJournal().split(/\n(?=---)/);
const emailsPour = (adresse, sujet) =>
  blocs().filter((b) => b.includes(`À : ${adresse}`) && b.includes('e-mail') && b.includes(`Sujet : ${sujet}\n`));
const notificationsRetenuesPour = (adresse) => blocs().filter((b) => b.includes('notification retenue') && b.includes(`À : ${adresse}`));

// ---------------------------------------------------------------------------
// Un faux service de notifications : il garde ce qu'il reçoit, et sait le déchiffrer
// avec les clés du « navigateur » qu'on a abonné (RFC 8291).
// ---------------------------------------------------------------------------
const recus = [];
const PORT_SERVICE = 8790;
const service = http.createServer((req, res) => {
  const morceaux = [];
  req.on('data', (m) => morceaux.push(m));
  req.on('end', () => {
    recus.push({ chemin: req.url, entetes: req.headers, corps: Buffer.concat(morceaux) });
    res.statusCode = req.url.startsWith('/disparu') ? 410 : 201;
    res.end();
  });
});

const navigateurFactice = () => {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, cles: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
};

const dechiffrer = (navigateur, corps) => {
  const sel = corps.subarray(0, 16);
  const longueurCle = corps[20];
  const cleSite = corps.subarray(21, 21 + longueurCle);
  const chiffre = corps.subarray(21 + longueurCle);
  const partage = navigateur.ecdh.computeSecret(cleSite);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), navigateur.ecdh.getPublicKey(), cleSite]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', partage, navigateur.auth, info, 32));
  const cle = Buffer.from(crypto.hkdfSync('sha256', ikm, sel, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, sel, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cle, nonce);
  d.setAuthTag(chiffre.subarray(chiffre.length - 16));
  const clair = Buffer.concat([d.update(chiffre.subarray(0, chiffre.length - 16)), d.final()]);
  // Le dernier enregistrement se termine par l'octet 2.
  return JSON.parse(clair.subarray(0, clair.lastIndexOf(2)).toString());
};

// La signature VAPID : un jeton signé avec la clé du site, vérifié avec sa clé publique.
const vapidValable = (entete, endpoint) => {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(entete || '');
  if (!m || m[2] !== env.VAPID_PUBLIC) return false;
  const [h, c, s] = m[1].split('.');
  const revendications = JSON.parse(Buffer.from(c, 'base64url'));
  const publique = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex'), Buffer.from(m[2], 'base64url')]), format: 'der', type: 'spki' });
  const signee = crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: publique, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  return signee && revendications.aud === new URL(endpoint).origin && revendications.exp > Date.now() / 1000 && revendications.sub === env.VAPID_SUJET;
};

const tache = (entete) =>
  fetch(serveur + '/api/taches/notifications', { headers: entete ? { Authorization: entete } : {} });
const passer = async () => {
  const reponse = await tache('Bearer ' + env.CRON_SECRET);
  return { statut: reponse.status, resume: await reponse.json() };
};

(async () => {
  await new Promise((r) => service.listen(PORT_SERVICE, '127.0.0.1', r));
  const b = await chromium.launch();
  const erreurs = [];
  const debordements = [];
  const deborde = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const photo = async (page, nom) => {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dossier}/e8-${nom}.png`, fullPage: true });
    if (nom.startsWith('tel-') && await deborde(page)) debordements.push(nom);
  };
  const nouvellePage = async ({ permissionPasDemandee, ...options }) => {
    const ctx = await b.newContext({ deviceScaleFactor: 1, ...options });
    if (permissionPasDemandee) {
      await ctx.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'default' }));
    }
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(e.message));
    return page;
  };
  const saisirCode = async (page, adresse) => {
    await page.goto(base);
    await page.fill('#email', adresse);
    await page.click('button[type=submit]');
    await page.waitForSelector('text=Code à 6 chiffres');
    await page.waitForTimeout(400);
    await page.locator('input[autocomplete="one-time-code"]').pressSequentially(dernier(/saisissez ce code : (\d{6})/g));
  };
  const lire = async (page, chemin) => (await page.request.get(base + '/api' + chemin)).json();
  const statut = async (requete) => (await requete).status();

  // 1. La garde de la tâche
  ok('tâche sans secret : 401', (await tache()).status === 401);
  ok('tâche avec un faux secret : 401', (await tache('Bearer pas-le-bon')).status === 401);
  ok('tâche avec le secret nu, sans « Bearer » : 401', (await tache(env.CRON_SECRET)).status === 401);

  // 2. Le premier choix d'Alix, au téléphone
  // Le navigateur d'essai, sans écran, répond toujours « refusé » : on lui fait dire
  // « pas encore demandé », comme un vrai téléphone. On ne touche pas l'interrupteur :
  // l'abonnement passerait par le vrai service de notifications du navigateur.
  const tel = await nouvellePage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, permissionPasDemandee: true });
  await saisirCode(tel, 'alix@exemple.fr');
  await tel.waitForSelector('text=Être prévenu');
  ok('première connexion : l\'écran de choix apparaît');
  ok('il ne dit ni qui écrit ni ce qui est écrit', await tel.locator('text=jamais qui l’envoie').count() === 1);
  ok('la navigation n\'est pas encore là', await tel.locator('nav a:has-text("Écrire")').count() === 0);
  ok('l\'interrupteur du navigateur est utilisable', await tel.locator('[data-slot=switch]').first().getAttribute('data-disabled') === null);
  await tel.click('label[for=notif-arrivee]');
  await tel.click('label[for=notif-rappel]');
  await tel.waitForSelector('#notif-delai');
  ok('le rappel propose un délai, un jour par défaut', (await tel.textContent('#notif-delai')).includes('un jour'));
  await photo(tel, 'tel-choix');
  await tel.click('button:has-text("Enregistrer")');
  await tel.waitForSelector('nav a:has-text("Écrire")');
  ok('après le choix : la Réception', tel.url().endsWith('/reception'));
  ok('le choix est enregistré', sql(`select email_arrivee, email_rappel, rappel_heures, choisi_le is not null from preferences_notification where compte_id = '${id('0a')}'`) === 't|t|24|t');
  // Seconde connexion : plus d'écran de choix.
  const tel2 = await nouvellePage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const passerAlix = surveillerPremierChoix(tel2);
  await saisirCode(tel2, 'alix@exemple.fr');
  await tel2.waitForSelector('nav a:has-text("Écrire")');
  ok('seconde connexion : pas d\'écran de choix', await tel2.locator('text=Plus tard').count() === 0);
  await passerAlix();
  await tel2.context().close();

  // Le navigateur d'Alix s'abonne (par l'API, vers le faux service).
  const alixNavigateur = navigateurFactice();
  ok('abonnement d\'Alix enregistré', await statut(tel.request.post(base + '/api/joueur/abonnements', { data: { endpoint: `http://127.0.0.1:${PORT_SERVICE}/abonne/alix`, keys: alixNavigateur.cles } })) === 204);
  ok('une adresse de service qui n\'est pas https : refusée', await statut(tel.request.post(base + '/api/joueur/abonnements', { data: { endpoint: 'ftp://exemple.fr/x', keys: alixNavigateur.cles } })) === 400);
  ok('une adresse http hors de cette machine : refusée', await statut(tel.request.post(base + '/api/joueur/abonnements', { data: { endpoint: 'http://exemple.fr/x', keys: alixNavigateur.cles } })) === 400);
  ok('le canal du navigateur d\'Alix est ouvert', (await lire(tel, '/joueur/notifications')).navigateur === true);

  // 3. Le MJ choisit : e-mail, et deux navigateurs (dont un qui a disparu)
  const mj = await nouvellePage({ viewport: { width: 1280, height: 900 }, permissionPasDemandee: true });
  await saisirCode(mj, 'mj@exemple.fr');
  await mj.waitForSelector('text=Mes notifications');
  ok('MJ, première connexion : l\'écran de choix apparaît');
  await mj.click('label[for=mj-notif-email]');
  await photo(mj, 'mj-choix');
  await mj.click('button:has-text("Enregistrer")');
  await mj.waitForURL('**/mj/a-traiter');
  await mj.waitForSelector('h1:text-is("À traiter")');
  const mjNavigateur = navigateurFactice();
  await mj.request.post(base + '/api/mj/abonnements', { data: { endpoint: `http://127.0.0.1:${PORT_SERVICE}/abonne/mj`, keys: mjNavigateur.cles } });
  await mj.request.post(base + '/api/mj/abonnements', { data: { endpoint: `http://127.0.0.1:${PORT_SERVICE}/disparu/mj`, keys: navigateurFactice().cles } });
  ok('le MJ a deux navigateurs abonnés', (await lire(mj, '/mj/notifications')).navigateurs_abonnes === 2);

  // 4. Les portes : un joueur n'entre ni chez le MJ ni dans la tâche
  ok('joueur → choix du MJ : refusé', await statut(tel.request.get(base + '/api/mj/notifications')) === 403);
  ok('joueur → pastille du MJ : refusé', await statut(tel.request.get(base + '/api/mj/pastille')) === 403);
  ok('joueur connecté → tâche : 401', await statut(tel.request.get(base + '/api/taches/notifications')) === 401);
  ok('MJ connecté → tâche : 401', await statut(mj.request.get(base + '/api/taches/notifications')) === 401);
  ok('la clé publique se lit sans connexion', (await (await fetch(serveur + '/api/notifications/cle')).json()).cle === env.VAPID_PUBLIC);

  // 5. Premier passage : le MJ est prévenu (une nouvelle lettre, une date proche)
  const avantMj = emailsPour('mj@exemple.fr', 'Une date approche').length;
  let { statut: s1, resume: r1 } = await passer();
  ok('passage avec le secret : 200', s1 === 200);
  ok('une lettre nouvelle, une lettre proche (pas celle de la gazette)', r1.lettres_nouvelles === 1 && r1.lettres_proches === 1);
  ok('aucune arrivée encore : rien pour les joueurs', r1.arrivees === 0);
  const emailMj = emailsPour('mj@exemple.fr', 'Une date approche');
  ok('un e-mail au MJ, qui regroupe les deux', emailMj.length === avantMj + 1 && emailMj.at(-1).includes('1 nouvelle lettre à traiter.') && emailMj.at(-1).includes('1 lettre approche'));
  ok('l\'e-mail du MJ mène à À traiter', emailMj.at(-1).includes('http://localhost:5173/mj/a-traiter'));
  ok('la gazette n\'est pas alertée', sql(`select mj_alerte_le is null from plis where id = '${id('d9')}'`) === 't');
  await new Promise((r) => setTimeout(r, 500));
  const versMj = recus.filter((r) => r.chemin === '/abonne/mj');
  ok('une notification remise au navigateur du MJ', versMj.length === 1);
  const remise = versMj[0];
  ok('envoi chiffré (Content-Encoding: aes128gcm)', remise && remise.entetes['content-encoding'] === 'aes128gcm');
  ok('signature VAPID valable', remise && vapidValable(remise.entetes.authorization, `http://127.0.0.1:${PORT_SERVICE}/abonne/mj`));
  let contenuMj = null;
  try { contenuMj = dechiffrer(mjNavigateur, remise.corps); } catch (e) { contenuMj = null; }
  ok('le navigateur du MJ la déchiffre : ' + JSON.stringify(contenuMj), contenuMj && contenuMj.url === '/mj/a-traiter' && contenuMj.texte.includes('1 nouvelle lettre'));
  ok('le service disparu (410) a été appelé, et l\'abonnement supprimé', recus.some((r) => r.chemin === '/disparu/mj') && sql(`select count(*) from abonnements_navigateur where endpoint like '%/disparu/%'`) === '0');
  ok('rien n\'est parti vers le navigateur d\'Alix', recus.every((r) => r.chemin !== '/abonne/alix'));
  ({ resume: r1 } = await passer());
  ok('deuxième passage : le MJ n\'est pas prévenu deux fois', r1.lettres_nouvelles === 0 && r1.lettres_proches === 0 && recus.filter((r) => r.chemin === '/abonne/mj').length === 1);

  // 6. Les plis arrivent
  ok('pastille avant l\'arrivée : 0', (await lire(tel, '/joueur/pastille')).nombre === 0);
  sql(`update exemplaires set livraison_le = now() - interval '1 minute' where id in ('${id('f1')}', '${id('f2')}', '${id('f3')}')`);
  ok('pastille dès l\'arrivée, sans attendre la tâche : 1', (await lire(tel, '/joueur/pastille')).nombre === 1);
  const avantAlix = emailsPour('alix@exemple.fr', 'Un pli vous attend').length;
  const { resume: r2 } = await passer();
  ok('un seul compte prévenu (Alix)', r2.arrivees === 1);
  const emailAlix = emailsPour('alix@exemple.fr', 'Un pli vous attend');
  ok('un e-mail « Un pli vous attend » pour Alix (retenu : on n\'est pas en ligne)', emailAlix.length === avantAlix + 1 && emailAlix.at(-1).includes('e-mail retenu'));
  ok('il mène à la Réception', emailAlix.at(-1).includes('http://localhost:5173/reception'));
  ok('ni l\'auteur ni un mot du texte', !/Bertrand|SECRET|PONT/.test(emailAlix.at(-1)));
  const notifAlix = notificationsRetenuesPour('alix@exemple.fr');
  ok('la notification d\'Alix est retenue, avec le seul « Un pli vous attend. »', notifAlix.length === 1 && notifAlix[0].includes('Un pli vous attend.') && !/Bertrand|SECRET/.test(notifAlix[0]));
  ok('rien n\'est parti vers son navigateur', recus.every((r) => r.chemin !== '/abonne/alix'));
  ok('Bertrand, sans canal, ne reçoit rien', emailsPour('bertrand@exemple.fr', 'Un pli vous attend').length === 0 && notificationsRetenuesPour('bertrand@exemple.fr').length === 0);
  ok('les trois exemplaires sont marqués, celui du PNJ compris', sql(`select count(*) from exemplaires where notifie_le is not null`) === '3');
  const { resume: r3 } = await passer();
  ok('passage suivant : personne n\'est prévenu deux fois', r3.arrivees === 0 && emailsPour('alix@exemple.fr', 'Un pli vous attend').length === avantAlix + 1);

  // 7. La pastille à l'écran
  await tel.goto(base + '/reception');
  await tel.waitForSelector('[data-pli]');
  ok('un point sur la Réception, sans nombre', await tel.locator('[data-pastille]').count() === 1 && (await tel.locator('[data-pastille]').textContent()).trim() === '');
  await photo(tel, 'tel-pastille');

  // 8. Le rappel
  sql(`update exemplaires set livraison_le = now() - interval '25 hours' where id in ('${id('f1')}', '${id('f2')}')`);
  const { resume: r4 } = await passer();
  const rappels = emailsPour('alix@exemple.fr', 'Un pli vous attend toujours');
  ok('pli fermé depuis 25 heures : un rappel pour Alix', r4.rappels === 1 && rappels.length === 1 && !/Bertrand|SECRET/.test(rappels[0]));
  ok('pas de rappel pour Bertrand, qui ne l\'a pas choisi', emailsPour('bertrand@exemple.fr', 'Un pli vous attend toujours').length === 0);
  const { resume: r5 } = await passer();
  ok('le rappel ne part qu\'une fois', r5.rappels === 0 && emailsPour('alix@exemple.fr', 'Un pli vous attend toujours').length === 1);

  // 9. Ouvrir : la pastille s'éteint
  ok('ouverture du pli', await statut(tel.request.post(base + `/api/joueur/plis/${id('f1')}/ouverture`)) < 300);
  ok('pastille après l\'ouverture : 0', (await lire(tel, '/joueur/pastille')).nombre === 0);
  await tel.goto(base + '/reception');
  await tel.waitForSelector('[data-pli]');
  await tel.waitForTimeout(400);
  ok('plus de point sur la Réception', await tel.locator('[data-pastille]').count() === 0);

  // 10. Changer d'avis depuis la fiche
  await tel.click('nav a:has-text("Personnage")');
  await tel.waitForSelector('label[for=notif-arrivee]');
  await tel.click('label[for=notif-arrivee]');
  await tel.click('button:has-text("Enregistrer")');
  await tel.waitForSelector('text=C’est noté.');
  ok('fiche : e-mail d\'arrivée coupé, rappel gardé', sql(`select email_arrivee, email_rappel from preferences_notification where compte_id = '${id('0a')}'`) === 'f|t');
  await photo(tel, 'tel-fiche-notifications');
  ok('un délai hors des bornes : refusé', await statut(tel.request.put(base + '/api/joueur/notifications', { data: { email_arrivee: false, email_rappel: true, rappel_heures: 500 } })) === 400);
  ok('se désabonner coupe le canal du navigateur', await statut(tel.request.delete(base + '/api/joueur/abonnements', { data: { endpoint: `http://127.0.0.1:${PORT_SERVICE}/abonne/alix` } })) === 204 && (await lire(tel, '/joueur/notifications')).navigateur === false);

  // 11. Le MJ : pastille d'À traiter, Réglages
  ok('pastille du MJ : les 3 lettres à traiter', (await lire(mj, '/mj/pastille')).nombre === 3);
  await mj.goto(base + '/mj/reglages');
  await mj.waitForSelector('text=Mes notifications');
  ok('le nombre à côté d\'À traiter', (await mj.locator('[data-pastille]').textContent()).trim() === '3');
  await mj.locator('text=Mes notifications').scrollIntoViewIfNeeded();
  await photo(mj, 'mj-reglages');
  const mjTel = await nouvellePage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, permissionPasDemandee: true });
  await mjTel.context().addCookies(await mj.context().cookies());
  await mjTel.goto(base + '/mj/reglages');
  await mjTel.waitForSelector('text=Mes notifications');
  await photo(mjTel, 'tel-mj-reglages');

  // L'essai du MJ : par ses canaux, vers son navigateur abonné et sa boîte.
  const avantEssai = recus.filter((r) => r.chemin === '/abonne/mj').length;
  const essai = await (await mj.request.post(base + '/api/mj/notifications/essai', { data: {} })).json();
  await new Promise((r) => setTimeout(r, 300));
  const recuEssai = recus.filter((r) => r.chemin === '/abonne/mj');
  ok('essai du MJ : une notification et un e-mail', essai.navigateurs === 1 && essai.email === true && recuEssai.length === avantEssai + 1);
  ok('essai du MJ : la notification se déchiffre', dechiffrer(mjNavigateur, recuEssai.at(-1).corps).texte.startsWith('Essai'));
  ok('un joueur ne peut pas lancer l\'essai du MJ', await statut(tel.request.post(base + '/api/mj/notifications/essai', { data: {} })) === 403);

  // 12. Le site installable
  const manifeste = await (await fetch(base + '/manifest.webmanifest')).json();
  ok('le manifeste est servi', manifeste.name === 'Correspondance' && manifeste.display === 'standalone' && manifeste.icons.some((i) => i.purpose === 'maskable'));
  ok('les icônes sont servies', (await fetch(base + manifeste.icons[0].src)).headers.get('content-type') === 'image/png');
  ok('le service worker est servi tel quel', (await (await fetch(base + '/sw.js')).text()).includes("addEventListener('push'"));
  const pret = await tel.evaluate(() => Promise.race([
    navigator.serviceWorker.ready.then((r) => !!r.active),
    new Promise((r) => setTimeout(() => r(false), 8000)),
  ]));
  ok('le service worker s\'enregistre', pret);
  const tete = await tel.evaluate(() => ({
    manifeste: !!document.querySelector('link[rel=manifest]'),
    apple: !!document.querySelector('link[rel=apple-touch-icon]'),
    couleur: document.querySelector('meta[name=theme-color]')?.content,
  }));
  ok('en-tête du site installable', tete.manifeste && tete.apple && tete.couleur === '#2b2620');

  ok('aucun débordement au téléphone' + (debordements.length ? ' : ' + debordements.join(', ') : ''), debordements.length === 0);
  ok('aucune erreur dans les pages' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''), erreurs.length === 0);
  await b.close();
  service.close();
})().catch((e) => { console.log('ECHEC', e.message.split('\n')[0]); process.exit(1); });
