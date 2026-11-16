// Parcours « sauvegarde » : la section Sauvegardes des Réglages du MJ, la tâche quotidienne
// et sa garde, le ménage des copies de plus de 30 jours, le téléchargement, l'e-mail au MJ
// quand la copie échoue. Le stockage Vercel Blob est remplacé par un faux, sur cette
// machine, qui vérifie ce qu'on lui envoie (accès privé, jamais d'écrasement, jeton).
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const zlib = require('zlib');
const { surveillerPremierChoix } = require('./commun.cjs');
const [dossier, journal] = process.argv.slice(2);
const lireJournal = () => fs.readFileSync(journal, 'utf8');
const dernier = (re) => { const m = [...lireJournal().matchAll(re)]; return m.length ? m[m.length - 1][1] : null; };
const ok = (nom, cond = true) => console.log((cond ? 'OK   ' : 'ECHEC') + ' ' + nom);
const base = 'http://localhost:5173';
const serveur = 'http://localhost:8787';
const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

// ---------------------------------------------------------------------------
// Le faux stockage. Il parle comme l'API de Vercel Blob (voir src/sauvegarde/blob.rs).
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT_FAUX_BLOB || 8791);
const API = `http://localhost:${PORT}`;
const JETON = process.env.BLOB_READ_WRITE_TOKEN;
const jours = (n) => new Date(Date.now() - n * 86400000).toISOString();
const fichiers = new Map();
const deposer = (pathname, octets, uploadedAt) =>
  fichiers.set(pathname, { url: `${API}/fichiers/${pathname}`, pathname, size: octets.length, uploadedAt, octets });
deposer('sauvegardes/2020-01-01-040000.json.gz', Buffer.from('ancienne'), jours(40));
deposer('sauvegardes/2020-02-01-040000.json.gz', Buffer.from('recente'), jours(10));
deposer('images/carte.png', Buffer.from('image'), jours(60));
const depots = [];
let enPanne = false;

const stockage = http.createServer((req, res) => {
  const morceaux = [];
  req.on('data', (m) => morceaux.push(m));
  req.on('end', () => {
    const url = new URL(req.url, API);
    const repondre = (statut, corps) => {
      res.statusCode = statut;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(corps));
    };
    if (req.headers.authorization !== `Bearer ${JETON}`) return repondre(403, { error: { code: 'forbidden' } });
    if (url.pathname.startsWith('/fichiers/')) {
      const fichier = fichiers.get(decodeURIComponent(url.pathname.slice('/fichiers/'.length)));
      if (!fichier) return repondre(404, {});
      res.statusCode = 200;
      return res.end(fichier.octets);
    }
    if (req.headers['x-vercel-blob-store-id'] !== 'essai' || !req.headers['x-api-version']) return repondre(400, { error: { code: 'bad_request' } });
    if (req.method === 'PUT' && url.pathname === '/') {
      depots.push({ entetes: req.headers, pathname: url.searchParams.get('pathname') });
      if (enPanne) return repondre(503, { error: { code: 'service_unavailable' } });
      const pathname = url.searchParams.get('pathname');
      if (fichiers.has(pathname) && req.headers['x-allow-overwrite'] !== '1') return repondre(400, { error: { code: 'blob_already_exists' } });
      deposer(pathname, Buffer.concat(morceaux), new Date().toISOString());
      const f = fichiers.get(pathname);
      return repondre(200, { url: f.url, pathname, contentType: req.headers['x-content-type'] });
    }
    if (req.method === 'GET' && url.pathname === '/') {
      // Deux par page, pour essayer la suite des pages.
      const tous = [...fichiers.values()].filter((f) => f.pathname.startsWith(url.searchParams.get('prefix') || '')).sort((a, b) => a.pathname.localeCompare(b.pathname));
      const depart = Number(url.searchParams.get('cursor') || 0);
      const page = tous.slice(depart, depart + 2);
      const encore = depart + 2 < tous.length;
      return repondre(200, { blobs: page.map(({ octets, ...f }) => f), hasMore: encore, cursor: encore ? String(depart + 2) : undefined });
    }
    if (req.method === 'POST' && url.pathname === '/delete') {
      for (const u of JSON.parse(Buffer.concat(morceaux)).urls) for (const [p, f] of fichiers) if (f.url === u) fichiers.delete(p);
      return repondre(200, {});
    }
    repondre(404, {});
  });
});

const tache = (entete) => fetch(serveur + '/api/taches/sauvegarde', { headers: entete ? { Authorization: entete } : {} });
const copies = () => [...fichiers.keys()].filter((p) => p.startsWith('sauvegardes/')).sort();

(async () => {
  await new Promise((r) => stockage.listen(PORT, r));
  const b = await chromium.launch();
  const erreurs = [];
  const connecter = async (page, adresse) => {
    await page.goto(base);
    await page.fill('#email', adresse);
    await page.click('button[type=submit]');
    await page.waitForSelector('text=Code à 6 chiffres');
    await page.waitForTimeout(400);
    const passer = surveillerPremierChoix(page);
    await page.locator('input[autocomplete="one-time-code"]').pressSequentially(dernier(/saisissez ce code : (\d{6})/g));
    await passer();
  };

  // 1. La section, avec les copies déjà là
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erreurs.push(e.message));
  await connecter(p, 'mj@exemple.fr');
  await p.waitForURL('**/mj/a-traiter');
  await p.goto(base + '/mj/reglages');
  await p.waitForSelector('h2:text-is("Sauvegardes")');
  const liste = p.locator('ul[aria-label="Copies"] > li');
  await liste.first().waitFor();
  ok('Réglages : la section Sauvegardes liste les copies présentes (' + (await liste.count()) + ')', (await liste.count()) === 2);
  ok('Réglages : seules les copies, pas les autres fichiers du stockage', !(await p.locator('text=carte').count()));

  // 2. Une copie faite à la main, et le ménage des copies de plus de 30 jours
  await p.click('button:has-text("Faire une copie maintenant")');
  await p.waitForSelector('text=Copie faite');
  await p.waitForFunction(() => document.querySelectorAll('ul[aria-label="Copies"] > li').length === 2);
  const apres = copies();
  ok('copie à la main : déposée dans le dossier des sauvegardes', apres.length === 2 && /^sauvegardes\/\d{4}-\d{2}-\d{2}-\d{6}-\d{3}\.json\.gz$/.test(apres[1]));
  ok('copie à la main : celle de plus de 30 jours est supprimée, celle de 10 jours reste', !apres.includes('sauvegardes/2020-01-01-040000.json.gz') && apres.includes('sauvegardes/2020-02-01-040000.json.gz'));
  ok('copie à la main : les autres fichiers du stockage ne sont pas touchés', fichiers.has('images/carte.png'));
  const depot = depots[depots.length - 1].entetes;
  ok('dépôt : en accès privé, sans écraser, sans suffixe au hasard', depot['x-vercel-blob-access'] === 'private' && depot['x-allow-overwrite'] === '0' && depot['x-add-random-suffix'] === '0');
  ok('dépôt : compressé', depot['x-content-type'] === 'application/gzip');
  await p.screenshot({ path: `${dossier}/e9-reglages-sauvegardes.png`, fullPage: true });

  // 3. Le téléchargement : toute la base, lisible
  const [telechargement] = await Promise.all([p.waitForEvent('download'), p.locator('ul[aria-label="Copies"] a:has-text("Télécharger")').first().click()]);
  const chemin = `${dossier}/copie-telechargee.json.gz`;
  await telechargement.saveAs(chemin);
  let copie = null;
  try { copie = JSON.parse(zlib.gunzipSync(fs.readFileSync(chemin))); } catch (e) { erreurs.push('copie illisible : ' + e.message); }
  ok('téléchargement : nommé epistolaire-…json.gz', /^epistolaire-\d{4}-\d{2}-\d{2}-\d{6}-\d{3}\.json\.gz$/.test(telechargement.suggestedFilename()));
  ok('téléchargement : une copie de toute la base', copie && copie.structure >= 6 && ['plis', 'exemplaires', 'comptes', 'evenements', '_sqlx_migrations'].every((t) => Array.isArray(copie.tables[t])));
  ok('téléchargement : la lettre y est', copie && copie.tables.plis.some((l) => l.contenu.texte.includes('registres ont disparu')));

  // 4. Un nom de copie qui sort du dossier : introuvable
  const statutsNoms = [
    (await p.request.get(base + '/api/mj/sauvegardes/' + encodeURIComponent('../images/carte.png'))).status(),
    (await p.request.get(base + '/api/mj/sauvegardes/' + encodeURIComponent('2020-09-09-000000.json.gz'))).status(),
  ];
  ok('téléchargement : un nom hors du dossier, ou absent, est introuvable (' + statutsNoms.join(', ') + ')', statutsNoms.every((s) => s === 404));

  // 5. La tâche quotidienne et sa garde
  const statuts = [(await tache(null)).status, (await tache('Bearer faux')).status];
  ok('tâche : 401 sans le secret (' + statuts.join(', ') + ')', statuts.every((s) => s === 401));
  const avant = copies().length;
  const reussie = await tache(`Bearer ${env.CRON_SECRET}`);
  const resultat = await reussie.json();
  ok('tâche : avec le secret, une copie de plus (' + reussie.status + ')', reussie.status === 200 && copies().length === avant + 1 && resultat.nom && resultat.taille > 0);

  // 6. L'échec : un e-mail au MJ, et rien n'est supprimé
  enPanne = true;
  const avantPanne = copies();
  const ratee = await tache(`Bearer ${env.CRON_SECRET}`);
  await new Promise((r) => setTimeout(r, 500));
  ok('échec : la tâche répond une erreur (' + ratee.status + ')', ratee.status === 500);
  const blocs = lireJournal().split(/\n(?=---)/).filter((bloc) => bloc.includes('Sujet : La copie de la base a échoué'));
  ok('échec : un e-mail au MJ', blocs.some((bloc) => bloc.includes('À : mj@exemple.fr') && bloc.includes('Sauvegardes')));
  ok('échec : aucune copie supprimée', JSON.stringify(copies()) === JSON.stringify(avantPanne));
  await p.click('button:has-text("Faire une copie maintenant")');
  await p.waitForSelector('[role=alert]');
  ok('échec : le bouton du MJ affiche une erreur', (await p.locator('[role=alert]').count()) > 0);
  enPanne = false;

  // 7. Au téléphone
  const tel = await b.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await tel.addCookies(await ctx.cookies());
  const t = await tel.newPage();
  t.on('pageerror', (e) => erreurs.push(e.message));
  await t.goto(base + '/mj/reglages');
  await t.waitForSelector('ul[aria-label="Copies"] > li');
  await t.locator('h2:text-is("Sauvegardes")').scrollIntoViewIfNeeded();
  const largeur = await t.evaluate(() => document.documentElement.scrollWidth);
  ok('téléphone : pas de défilement horizontal (' + largeur + ')', largeur <= 390);
  const hauteur = await t.locator('ul[aria-label="Copies"] a').first().evaluate((e) => e.getBoundingClientRect().height);
  ok('téléphone : le bouton Télécharger fait au moins 44 px (' + hauteur + ')', hauteur >= 44);
  await t.screenshot({ path: `${dossier}/e9-tel-sauvegardes.png`, fullPage: true });

  // 8. Un joueur n'y a pas accès
  const autre = await b.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1 });
  const j = await autre.newPage();
  await connecter(j, 'alix@exemple.fr');
  await j.waitForURL('**/reception');
  const fermes = [
    (await j.request.get(base + '/api/mj/sauvegardes')).status(),
    (await j.request.post(base + '/api/mj/sauvegardes', { data: {} })).status(),
    (await j.request.get(base + '/api/mj/sauvegardes/' + apres[1].slice('sauvegardes/'.length))).status(),
  ];
  ok('joueuse : liste, copie et téléchargement fermés (' + fermes.join(', ') + ')', fermes.every((s) => s === 403));

  ok('aucune erreur de page' + (erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''), erreurs.length === 0);
  await b.close();
  stockage.close();
})().catch((e) => { console.log('ECHEC', e.message.split('\n').slice(0, 5).join(' / ')); process.exit(1); });
