// Parcours « documents » : le MJ envoie les six gabarits à Alix et Bertrand, à des dates
// différentes, avec une image de carte et une image de sceau. Chacun ne reçoit qu'à sa date ;
// une image ne se sert qu'à son destinataire, une fois le pli ouvert.
const { chromium } = require('playwright');
const { surveillerPremierChoix } = require('./commun.cjs');
const fs = require('fs');
const http = require('http');
const { execFileSync } = require('child_process');
const [dossier, journal] = process.argv.slice(2);
const dernier = (re) => { const m = [...fs.readFileSync(journal, 'utf8').matchAll(re)]; return m.length ? m[m.length - 1][1] : null; };
const ok = (nom, cond = true) => console.log((cond ? 'OK   ' : 'ECHEC') + ' ' + nom);
const sql = (requete) => execFileSync('psql', [process.env.DATABASE_URL, '-At', '-c', requete]).toString().trim();
const base = 'http://localhost:5173';
const id = (suffixe) => `00000000-0000-0000-0000-0000000000${suffixe}`;
const ALIX = id('a1'), BERTRAND = id('a2'), CHANCELIER = id('a5'), CARTOGRAPHE = id('a6');
const SCEAU = id('c5');

// ---------------------------------------------------------------------------
// Le faux stockage : il parle comme l'API de Vercel Blob (voir src/sauvegarde/blob.rs).
// ---------------------------------------------------------------------------
const PORT = 8791;
const API = `http://localhost:${PORT}`;
const fichiers = new Map();
const depots = [];
const stockage = http.createServer((req, res) => {
  const morceaux = [];
  req.on('data', (m) => morceaux.push(m));
  req.on('end', () => {
    const url = new URL(req.url, API);
    const repondre = (statut, corps) => { res.statusCode = statut; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(corps)); };
    if (req.headers.authorization !== `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`) return repondre(403, {});
    if (url.pathname.startsWith('/fichiers/')) {
      const fichier = fichiers.get(decodeURIComponent(url.pathname.slice('/fichiers/'.length)));
      if (!fichier) return repondre(404, {});
      res.statusCode = 200;
      return res.end(fichier);
    }
    if (req.method === 'PUT' && url.pathname === '/') {
      const pathname = url.searchParams.get('pathname');
      depots.push({ pathname, acces: req.headers['x-vercel-blob-access'], type: req.headers['x-content-type'] });
      fichiers.set(pathname, Buffer.concat(morceaux));
      return repondre(200, { url: `${API}/fichiers/${pathname}`, pathname });
    }
    repondre(404, {});
  });
});

(async () => {
  await new Promise((r) => stockage.listen(PORT, r));
  const b = await chromium.launch();
  const erreurs = [];
  const nouvellePage = async (options) => {
    const ctx = await b.newContext({ deviceScaleFactor: 1, ...options });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(e.message));
    return page;
  };
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
  // Une liste refermée reste un instant dans la page : on vise celle qui vient de s'ouvrir.
  const choisir = async (page, champ, nom) => {
    await page.click(champ);
    await page.locator(`[role=option]:visible:has-text("${nom}")`).last().click();
    await page.waitForTimeout(300);
  };
  const deborde = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

  // Deux vraies images PNG, tirées d'une page : une carte, et un dessin de sceau.
  const atelier = await nouvellePage({ viewport: { width: 600, height: 400 } });
  await atelier.setContent('<body style="margin:0;background:linear-gradient(135deg,#c9b68a,#7c9a6b)"><svg width="600" height="400"><path d="M40 300 Q200 60 340 220 T560 120" fill="none" stroke="#3a2f22" stroke-width="5"/><circle cx="340" cy="220" r="12" fill="#7a2e2e"/></svg></body>');
  await atelier.screenshot({ path: dossier + '/carte.png' });
  await atelier.setContent('<body style="margin:0;background:#7a2e2e"><svg width="200" height="200"><path d="M100 30 L160 170 L40 170 Z" fill="none" stroke="#f6f1e7" stroke-width="12"/></svg></body>');
  await atelier.screenshot({ path: dossier + '/sceau.png', clip: { x: 0, y: 0, width: 200, height: 200 } });
  await atelier.context().close();

  // -------------------------------------------------------------------------
  // 1. Le MJ : l'outil Documents
  // -------------------------------------------------------------------------
  const p = await nouvellePage({ viewport: { width: 1200, height: 900 } });
  await connecter(p, 'mj@exemple.fr');
  await p.waitForURL('**/mj/a-traiter');
  const api = p.request;
  const envoyer = (document) => api.post(base + '/api/mj/documents', { data: document });
  const enRoute = async () => (await api.get(base + '/api/mj/en-route')).json();
  const demain = new Date(Date.now() + 86400000).toISOString();
  const maintenant = new Date().toISOString();
  const aTous = [{ personnage_id: ALIX, livraison_le: maintenant }, { personnage_id: BERTRAND, livraison_le: demain }];
  const document = (contenu, plus = {}) => ({ auteur_id: CHANCELIER, contenu, signe: false, sceau_id: null, ecriture_id: null, destinataires: aTous, ...plus });

  // L'image du sceau, depuis l'écran Sceaux.
  await p.click('a[href="/mj/sceaux"]');
  await p.waitForSelector('summary:has-text("Donner une image à ce sceau")');
  await p.click('summary:has-text("Donner une image à ce sceau")');
  await p.setInputFiles('input[aria-label="Image du sceau Chancellerie du Duché"]', dossier + '/sceau.png');
  await p.waitForSelector('summary:has-text("Image du sceau")');
  const imageSceau = sql(`select image_id from sceaux where id = '${SCEAU}'`);
  ok('sceau : son image est déposée et lui est donnée', imageSceau.length === 36);
  ok('stockage : le dépôt est privé, rangé parmi les images', depots.length === 1 && depots[0].acces === 'private' && depots[0].pathname.startsWith('images/') && depots[0].type === 'image/png');
  await p.waitForTimeout(600);
  await p.screenshot({ path: dossier + '/e11-sceaux.png', fullPage: true });

  // Attend qu'une condition soit vraie : un enregistrement automatique, par exemple.
  const attendreQue = async (condition, ms = 5000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      if (await condition()) return true;
      await p.waitForTimeout(100);
    }
    return false;
  };
  const nouveauDocument = async () => {
    await p.click('a[href="/mj/documents"]');
    await p.waitForSelector('h1:has-text("Documents")');
    await p.click('button:has-text("Nouveau document")');
    await p.waitForURL('**/mj/documents/*-*');
    await p.waitForSelector('h1:has-text("Brouillon")');
  };

  // Une carte, par l'écran : image, titre, légende, deux destinataires à des dates différentes.
  await nouveauDocument();
  await p.click('button:has-text("Carte ou illustration")');
  await choisir(p, '#auteur', 'Le Chancelier');
  await p.setInputFiles('input[aria-label="Image de la carte"]', dossier + '/carte.png');
  await p.waitForSelector('article[data-document] img');
  await p.fill('#doc-titre', 'Les marches du nord');
  await p.fill('#doc-legende', 'Le gué est marqué d\'un point rouge.');
  ok('carte : ni signature ni écriture à choisir', await p.locator('#document-signer').count() === 0 && await p.locator('legend:has-text("Écriture de")').count() === 0);
  await p.click('button:has-text("Chancellerie du Duché")');
  await choisir(p, '#destinataire', 'Alix de Montfort');
  await choisir(p, '#destinataire', 'Bertrand Lenoir');
  await p.locator('li:has-text("Alix de Montfort") button:text-is("Tout de suite")').click();
  ok('aperçu : la carte, son titre et sa légende', await p.locator('article[data-document]:has-text("Les marches du nord"):has-text("Le gué est marqué")').count() === 1);
  await p.waitForTimeout(600);
  await p.screenshot({ path: dossier + '/e11-documents-carte.png', fullPage: true });
  await p.click('button:text-is("Envoyer")');
  await p.waitForURL('**/mj/en-route');
  ok('carte : le brouillon disparaît à l\'envoi', sql('select count(*) from brouillons_mj') === '0');
  let route = await enRoute();
  const carteBertrand = route.en_route.find((x) => x.contenu.gabarit === 'carte');
  const imageCarte = carteBertrand?.contenu.image;
  const heures = carteBertrand ? (new Date(carteBertrand.livraison_le) - Date.now()) / 3600000 : -1;
  ok('carte : un seul pli, un exemplaire par destinataire', sql(`select count(*) from plis where gabarit = 'carte'`) === '1' && sql(`select count(*) from exemplaires x join plis p on p.id = x.pli_id where p.gabarit = 'carte'`) === '2');
  ok('carte : celle de Bertrand est en route, au délai habituel de 24 h ± 4 h (' + heures.toFixed(1) + ' h)', heures >= 19.9 && heures <= 28.1);
  ok('carte : celle d\'Alix est arrivée, scellée', sql(`select count(*) from plis_recus where destinataire_id = '${ALIX}' and gabarit = 'carte' and sceau_nom = 'Chancellerie du Duché'`) === '1');

  // Un rapport, par l'écran : une seconde rubrique, montée en premier.
  await nouveauDocument();
  await p.click('button:has-text("Rapport")');
  await choisir(p, '#auteur', 'Le Chancelier');
  await p.fill('#doc-titre', 'État des greniers');
  await p.fill('#doc-auteur', 'L\'intendance');
  await p.fill('#doc-rubriques-0-titre', 'Le blé');
  await p.fill('#doc-rubriques-0-texte', 'Les réserves tiendront jusqu\'au dégel.');
  await p.click('button:has-text("Ajouter une rubrique")');
  await p.fill('#doc-rubriques-1-titre', 'Le sel');
  await p.fill('#doc-rubriques-1-texte', 'Il manque trois charrois.');
  await p.click('button[aria-label="Monter la rubrique 2"]');
  ok('rubriques : l\'ordre change', await p.inputValue('#doc-rubriques-0-titre') === 'Le sel');
  await p.click('button:text-is("Tous les joueurs")');
  await p.locator('li:has-text("Alix de Montfort") button:text-is("Tout de suite")').click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: dossier + '/e11-documents-rapport.png', fullPage: true });
  await p.click('button:text-is("Envoyer")');
  await p.waitForURL('**/mj/en-route');
  ok('rapport : rubriques rangées dans l\'ordre choisi', sql(`select contenu->'rubriques'->0->>'titre' from plis where gabarit = 'rapport'`) === 'Le sel');

  // Les brouillons et les modèles : enregistrés tout seuls, repris, recopiés.
  const CONVOCATION = 'Le conseil se tiendra à l\'aube.';
  await nouveauDocument();
  const brouillonId = p.url().split('/').pop();
  await choisir(p, '#auteur', 'Le Chancelier');
  await p.fill('#doc-texte', CONVOCATION);
  await choisir(p, '#destinataire', 'Alix de Montfort');
  ok('brouillon : enregistré tout seul sur le serveur, destinataire compris', await attendreQue(() => sql(`select contenu->>'texte' || ' ' || (destinataires->0->>'personnage_id') from brouillons_mj where id = '${brouillonId}'`) === `${CONVOCATION} ${ALIX}`));
  await p.waitForSelector('[role=status]:text-is("Enregistré")');
  await p.reload();
  await p.waitForSelector('#doc-texte');
  ok('brouillon : repris tel quel en rouvrant la page', await p.inputValue('#doc-texte') === CONVOCATION && await p.locator('ul[aria-label="Destinataires"] li:has-text("Alix de Montfort")').count() === 1);
  await p.click('button:has-text("Enregistrer comme modèle")');
  await p.fill('#nom-modele', 'Convocation au conseil');
  await p.click('[role=dialog] button[type=submit]');
  await p.waitForSelector('text=Modèle enregistré');
  ok('modèle : enregistré sans destinataires, le brouillon reste', sql(`select count(*) from modeles where nom = 'Convocation au conseil' and contenu->>'texte' = '${CONVOCATION.replace("'", "''")}' and auteur_id = '${CHANCELIER}'`) === '1' && sql(`select count(*) from brouillons_mj where id = '${brouillonId}'`) === '1');
  await p.fill('#doc-texte', 'Le conseil se tiendra à midi.');
  await p.click('button:has-text("Enregistrer comme modèle")');
  await p.fill('#nom-modele', 'convocation au conseil');
  ok('modèle : un nom déjà pris propose de remplacer', await p.locator('[role=dialog] button[type=submit]:text-is("Remplacer")').count() === 1);
  await p.click('[role=dialog] button[type=submit]');
  await p.waitForSelector('text=Modèle remplacé');
  ok('modèle : remplacé, pas doublé', sql(`select count(*) || ' ' || max(contenu->>'texte') from modeles`) === '1 Le conseil se tiendra à midi.');
  await p.click('a[href="/mj/documents"]');
  await p.waitForSelector('ul[aria-label="Modèles"]');
  ok('Documents : le brouillon et le modèle sont dans la liste', await p.locator('ul[aria-label="Brouillons"] li').count() === 1 && await p.locator('ul[aria-label="Modèles"] li:has-text("convocation au conseil")').count() === 1);
  await p.waitForTimeout(500);
  await p.screenshot({ path: dossier + '/e11-documents-liste.png', fullPage: true });
  await p.click('ul[aria-label="Modèles"] li button:has-text("Partir de ce modèle")');
  await p.waitForURL((url) => /\/mj\/documents\/.+-/.test(url.pathname) && !url.pathname.endsWith(brouillonId));
  await p.waitForSelector('#doc-texte');
  ok('partir d\'un modèle : un nouveau brouillon, prérempli, sans destinataire', await p.inputValue('#doc-texte') === 'Le conseil se tiendra à midi.' && await p.locator('ul[aria-label="Destinataires"]').count() === 0 && sql('select count(*) from brouillons_mj') === '2');
  await p.click('button:text-is("Jeter")');
  await p.click('[role=dialog] button:text-is("Jeter")');
  await p.waitForURL('**/mj/documents');
  ok('jeter un brouillon : il disparaît', sql('select count(*) from brouillons_mj') === '1');
  await p.click('ul[aria-label="Modèles"] li button:text-is("Renommer")');
  await p.fill('#renommer-modele', 'Convocation');
  await p.click('[role=dialog] button[type=submit]');
  ok('renommer un modèle', await attendreQue(() => sql('select nom from modeles') === 'Convocation'));
  // Le document que ce navigateur gardait avant les brouillons devient un brouillon.
  await p.evaluate(() => localStorage.setItem('epistolaire:mj:document', JSON.stringify({ gabarit: 'billet', contenus: { billet: { gabarit: 'billet', texte: 'Gardé dans le navigateur.' } }, auteurId: null, sansExpediteur: false, ecritureId: null, signe: true, sceauId: null, destinataires: [], dateCommune: '' })));
  await p.reload();
  ok('le document gardé dans le navigateur devient un brouillon', await attendreQue(() => sql(`select count(*) from brouillons_mj where contenu->>'texte' = 'Gardé dans le navigateur.'`) === '1'));
  ok('… et le navigateur l\'oublie', await attendreQue(() => p.evaluate(() => localStorage.getItem('epistolaire:mj:document') === null)));
  ok('un modèle sans nom : refusé', (await api.post(base + '/api/mj/modeles', { data: { nom: ' ', auteur_id: null, sans_expediteur: true, contenu: { gabarit: 'billet', texte: '' }, signe: false, sceau_id: null, ecriture_id: null } })).status() === 400);
  ok('un brouillon démesuré : refusé', (await api.put(`${base}/api/mj/brouillons/${brouillonId}`, { data: { auteur_id: null, sans_expediteur: false, contenu: { gabarit: 'billet', texte: 'x'.repeat(20001) }, signe: true, sceau_id: null, ecriture_id: null, destinataires: [], livraison_commune: null } })).status() === 400);
  ok('un brouillon reste incomplet sans être refusé', (await api.post(base + '/api/mj/brouillons', { data: { auteur_id: null, sans_expediteur: false, contenu: { gabarit: 'gazette', titre: '', numero: '', date: '', articles: [], courrier: [] }, signe: true, sceau_id: null, ecriture_id: null, destinataires: [], livraison_commune: null } })).status() === 200);

  // Les quatre autres gabarits, directement.
  const gazette = { gabarit: 'gazette', titre: 'La Gazette du Duché', numero: '12', date: '3e jour du 2e mois', articles: [{ titre: 'Le conseil se réunit', texte: 'Les registres du duché seront ouverts à tous, a promis le Chancelier.' }, { titre: 'Marché', texte: 'Le prix du sel reste stable cette semaine.' }], courrier: [{ texte: 'Qui paiera la réfection du pont ?', signature: null }, { texte: 'Bravo pour le dernier numéro.', signature: 'Un lecteur fidèle' }] };
  const r1 = await envoyer(document({ gabarit: 'billet', texte: 'Venez au conseil, demain.' }, { signe: true }));
  const r2 = await envoyer(document({ gabarit: 'lettre_longue', lieu_et_date: 'Au château, à la nuit tombée', texte: 'Madame,\n\nles nouvelles du nord sont mauvaises. '.repeat(3) }, { signe: true, sceau_id: SCEAU }));
  const r3 = await envoyer(document({ gabarit: 'acte', autorite: 'La Chancellerie du Duché', objet: 'Nomination', texte: 'Il est décidé que la charge de trésorier revient à qui de droit.', formule_finale: 'Fait pour valoir ce que de droit.' }, { signe: true, sceau_id: SCEAU }));
  const r4 = await envoyer(document(gazette, { sceau_id: SCEAU }));
  ok('billet, lettre longue, acte et gazette : envoyés', [r1, r2, r3, r4].every((r) => r.status() === 204));
  route = await enRoute();
  ok('En route : les six plis de Bertrand, un par gabarit', new Set(route.en_route.filter((x) => x.destinataire_id === BERTRAND).map((x) => x.contenu.gabarit)).size === 6);
  ok('Alix a reçu ses six documents ; Bertrand, rien encore', sql(`select count(*) from plis_recus where destinataire_id = '${ALIX}'`) === '7' && sql(`select count(*) from plis_recus where destinataire_id = '${BERTRAND}'`) === '0');
  ok('les documents du MJ ne comptent dans aucun quota, et ne passent pas par la file', (await (await api.get(base + '/api/mj/a-traiter')).json()).lettres.length === 0);

  // Ce qui est refusé.
  const refus = async (nom, doc) => ok(nom + ' : refusé', (await envoyer(doc)).status() === 400);
  await refus('écrire au nom d\'un joueur', document({ gabarit: 'billet', texte: 'x' }, { auteur_id: ALIX, destinataires: [{ personnage_id: BERTRAND, livraison_le: null }] }));
  await refus('signer un rapport', document({ gabarit: 'rapport', titre: 't', auteur: '', rubriques: [{ titre: '', texte: 'x' }] }, { signe: true }));
  await refus('un document sans expéditeur, signé', document({ gabarit: 'carte', image: imageCarte, titre: '', legende: '' }, { auteur_id: null, signe: true }));
  await refus('une lettre sans expéditeur ni écriture', document({ gabarit: 'lettre_longue', lieu_et_date: '', texte: 'x' }, { auteur_id: null }));
  await refus('une lettre sans expéditeur, dans l\'écriture d\'un joueur', document({ gabarit: 'lettre_longue', lieu_et_date: '', texte: 'x' }, { auteur_id: null, ecriture_id: sql(`select ecriture_id from personnages where id = '${ALIX}'`) }));
  await refus('un PNJ sans écriture, pour un billet', document({ gabarit: 'billet', texte: 'x' }, { auteur_id: CARTOGRAPHE }));
  await refus('une carte dont l\'image n\'existe pas', document({ gabarit: 'carte', image: id('99'), titre: '', legende: '' }));
  await refus('un rapport sans rubrique', document({ gabarit: 'rapport', titre: 't', auteur: '', rubriques: [] }));
  await refus('deux exemplaires pour le même destinataire', document({ gabarit: 'billet', texte: 'x' }, { destinataires: [{ personnage_id: ALIX, livraison_le: null }, { personnage_id: ALIX, livraison_le: null }] }));
  await refus('aucun destinataire', document({ gabarit: 'billet', texte: 'x' }, { destinataires: [] }));
  await refus('un sceau que l\'expéditeur ne détient pas', document({ gabarit: 'carte', image: imageCarte, titre: '', legende: '' }, { auteur_id: CARTOGRAPHE, sceau_id: SCEAU }));
  ok('un fichier qui n\'est pas une image : refusé', (await api.post(base + '/api/mj/images?largeur=10&hauteur=10', { data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), headers: { 'content-type': 'image/png' } })).status() === 400);

  // Sans expéditeur, et à un PNJ.
  const libre = sql(`select e.id from ecritures e where not exists (select 1 from personnages p where p.ecriture_id = e.id) limit 1`);
  const r5 = await envoyer(document({ gabarit: 'lettre_longue', lieu_et_date: '', texte: 'Une lettre trouvée sous une porte.' }, { auteur_id: null, ecriture_id: libre, destinataires: [{ personnage_id: BERTRAND, livraison_le: demain }] }));
  ok('une lettre sans expéditeur, dans une écriture choisie', r5.status() === 204 && sql(`select count(*) from exemplaires x join plis p on p.id = x.pli_id where p.auteur_id is null and x.ecriture_id = '${libre}' and x.signature_etat = 'absente'`) === '1');
  const r6 = await envoyer(document({ gabarit: 'carte', image: imageCarte, titre: 'Relevé', legende: '' }, { auteur_id: CARTOGRAPHE, destinataires: [{ personnage_id: CHANCELIER, livraison_le: demain }] }));
  ok('un document adressé à un PNJ : arrivé et lu aussitôt', r6.status() === 204 && sql(`select count(*) from exemplaires where destinataire_id = '${CHANCELIER}' and ouvert_le is not null and livraison_le <= now()`) === '1');
  ok('un PNJ sans écriture envoie une carte sans en recevoir une', sql(`select ecriture_id is null from personnages where id = '${CARTOGRAPHE}'`) === 't');

  // L'altération d'une case d'article, pour Bertrand : réécrite, abîmée, remarquée.
  const gazetteBertrand = route.en_route.find((x) => x.destinataire_id === BERTRAND && x.contenu.gabarit === 'gazette');
  const longueur = (texte) => [...texte].length;
  const ABIME = 'seront ouverts à tous';
  const texte0 = gazette.articles[0].texte;
  const debut = longueur(texte0.slice(0, texte0.indexOf(ABIME)));
  const livree = structuredClone(gazette);
  livree.articles[1].texte = 'Le prix du sel va doubler cette semaine.';
  const detailAvant = await (await api.get(`${base}/api/mj/exemplaires/${gazetteBertrand.id}`)).json();
  const version = { ...detailAvant.version, contenu: livree, passages_abimes: [{ champ: 'articles.0.texte', debut, fin: debut + longueur(ABIME) }], faussaire_ecriture_id: libre, remarque_texte: true };
  const alteration = await api.put(`${base}/api/mj/exemplaires/${gazetteBertrand.id}/version`, { data: version });
  const detail = await alteration.json();
  ok('altération d\'une gazette : enregistrée', alteration.status() === 200);
  ok('le serveur repère la réécriture dans sa case', JSON.stringify(detail.passages_reecrits.map((x) => x.champ)) === '["articles.1.texte"]');
  ok('l\'original n\'a pas changé', sql(`select contenu->'articles'->1->>'texte' from plis where gabarit = 'gazette'`) === gazette.articles[1].texte);
  ok('retirer un article de la version livrée : refusé', (await api.put(`${base}/api/mj/exemplaires/${gazetteBertrand.id}/version`, { data: { ...version, contenu: { ...livree, articles: [livree.articles[0]] } } })).status() === 400);
  ok('abîmer une case qui n\'existe pas : refusé', (await api.put(`${base}/api/mj/exemplaires/${gazetteBertrand.id}/version`, { data: { ...version, passages_abimes: [{ champ: 'articles.5.texte', debut: 0, fin: 3 }] } })).status() === 400);
  await p.goto(`${base}/mj/en-route/${gazetteBertrand.id}`);
  await p.waitForSelector('textarea[aria-label="Version livrée : Article 2 · texte"]');
  ok('atelier : une case par champ de la gazette', await p.locator('textarea[aria-label^="Version livrée"]').count() === 10);
  await p.waitForTimeout(600);
  await p.screenshot({ path: dossier + '/e11-atelier-gazette.png', fullPage: true });
  // Par l'écran : abîmer un passage du titre d'un article.
  await p.locator('textarea[aria-label="Version livrée : Article 1 · titre"]').evaluate((zone) => zone.setSelectionRange(3, 10));
  await p.locator('[data-case="articles.0.titre"] button:has-text("Abîmer la sélection")').click();
  await p.click('button:text-is("Enregistrer")');
  await p.waitForSelector('text=Version livrée enregistrée');
  ok('atelier : un passage abîmé dans une autre case, par l\'écran', sql(`select passages_abimes from exemplaires where id = '${gazetteBertrand.id}'`).includes('"articles.0.titre"'));
  // Une fausse carte pour Bertrand : une autre image.
  const autreImage = await (await api.post(base + '/api/mj/images?largeur=200&hauteur=200', { data: fs.readFileSync(dossier + '/sceau.png'), headers: { 'content-type': 'image/png' } })).json();
  const detailCarte = await (await api.get(`${base}/api/mj/exemplaires/${carteBertrand.id}`)).json();
  const fausse = await api.put(`${base}/api/mj/exemplaires/${carteBertrand.id}/version`, { data: { ...detailCarte.version, contenu: { ...detailCarte.version.contenu, image: autreImage.id } } });
  ok('fausse carte : une autre image dans l\'exemplaire de Bertrand', fausse.status() === 200 && sql(`select contenu->>'image' from exemplaires where id = '${carteBertrand.id}'`) === autreImage.id && sql(`select contenu->>'image' from plis where gabarit = 'carte' and auteur_id = '${CHANCELIER}'`) === imageCarte);
  await p.goto(base + '/mj/en-route');
  await p.waitForSelector('h3');
  await p.waitForTimeout(600);
  await p.screenshot({ path: dossier + '/e11-en-route.png', fullPage: true });

  // -------------------------------------------------------------------------
  // 2. Alix, au téléphone
  // -------------------------------------------------------------------------
  const a = await nouvellePage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const recues = [];
  a.on('response', async (r) => { if (r.url().includes('/api/joueur/') && !/\/(images|sceaux)\//.test(r.url())) recues.push(await r.text().catch(() => '')); });
  await connecter(a, 'alix@exemple.fr');
  await a.waitForURL('**/reception');
  await a.waitForSelector('li[data-pli]');
  ok('Réception d\'Alix : sept plis fermés', await a.locator('li[data-pli]').count() === 7);
  ok('la forme du pli : un rouleau pour la carte, un journal pour la gazette', await a.locator('[data-forme=rouleau]').count() === 1 && await a.locator('[data-forme=journal]').count() === 1 && await a.locator('[data-forme=pli]').count() === 5);
  await a.waitForTimeout(700);
  await a.screenshot({ path: dossier + '/e11-tel-reception.png', fullPage: true });
  const debordements = [];
  if (await deborde(a)) debordements.push('réception');

  const joueur = a.request;
  const plisAlix = Object.fromEntries(sql(`select gabarit || '=' || id from plis_recus where destinataire_id = '${ALIX}' and ecrit_le > now() - interval '1 hour'`).split('\n').map((ligne) => ligne.split('=')));
  const image = (requete, pli, img) => requete.get(`${base}/api/joueur/plis/${pli}/images/${img}`);
  ok('image du sceau : visible sur un pli fermé', (await joueur.get(`${base}/api/joueur/sceaux/${imageSceau}`)).status() === 200);
  ok('image de la carte : refusée avant l\'ouverture', (await image(joueur, plisAlix.carte, imageCarte)).status() === 404);
  ok('image de la carte : pas par la route des sceaux', (await joueur.get(`${base}/api/joueur/sceaux/${imageCarte}`)).status() === 404);
  ok('les images du MJ : refusées à un joueur', (await joueur.get(`${base}/api/mj/images/${imageCarte}`)).status() === 403);
  await a.goto(`${base}/pli/${plisAlix.carte}`);
  await a.waitForSelector('[data-forme=rouleau]');
  await a.waitForTimeout(500);
  await a.screenshot({ path: dossier + '/e11-tel-carte-fermee.png' });

  for (const gabarit of ['billet', 'lettre_longue', 'acte', 'rapport', 'gazette', 'carte']) {
    const ouverture = await joueur.post(`${base}/api/joueur/plis/${plisAlix[gabarit]}/ouverture`, { data: {} });
    const pli = await ouverture.json();
    ok(`${gabarit} : s'ouvre, avec ses cases`, ouverture.status() === 200 && pli.contenu.document.gabarit === gabarit);
    await a.goto(`${base}/pli/${plisAlix[gabarit]}`);
    await a.waitForSelector('article[data-document]');
    if (gabarit === 'carte') await a.waitForFunction(() => document.querySelector('article[data-document] img')?.naturalWidth > 0);
    await a.waitForTimeout(700);
    const cachets = await a.locator('article[data-document] [aria-label^="Sceau de"]').count();
    if (gabarit === 'lettre_longue' || gabarit === 'acte') ok(`${gabarit} : signé et scellé à l'intérieur`, cachets === 1 && (await a.locator('article[data-document]').innerText()).includes('Le Chancelier'));
    if (gabarit === 'gazette' || gabarit === 'carte') ok(`${gabarit} : scellé dehors, pas de cachet à l'intérieur`, cachets === 0 && pli.exterieur.sceau !== null);
    await a.screenshot({ path: `${dossier}/e11-tel-${gabarit}.png`, fullPage: true });
    if (await deborde(a)) debordements.push(gabarit);
  }
  const servie = await image(joueur, plisAlix.carte, imageCarte);
  ok('image de la carte : servie une fois le pli ouvert, telle qu\'elle a été déposée', servie.status() === 200 && servie.headers()['content-type'] === 'image/png' && Buffer.compare(await servie.body(), fs.readFileSync(dossier + '/carte.png')) === 0);
  ok('image : réponse privée, que seul son navigateur garde', (servie.headers()['cache-control'] || '').startsWith('private'));
  ok('image : seulement celle que le pli cite', (await image(joueur, plisAlix.carte, imageSceau)).status() === 404 && (await image(joueur, plisAlix.rapport, imageCarte)).status() === 404);
  ok('image de la fausse carte de Bertrand : refusée à Alix', (await image(joueur, plisAlix.carte, autreImage.id)).status() === 404);
  const ancien = await joueur.post(`${base}/api/joueur/plis/${id('e1')}/ouverture`, { data: {} });
  ok('un billet d\'avant l\'étape s\'ouvre toujours', ancien.status() === 200 && (await ancien.json()).contenu.document.texte === 'Un billet d\'avant les gabarits.');
  await a.goto(base + '/reception');
  await a.waitForSelector('li[data-pli]');
  await a.waitForTimeout(600);
  await a.screenshot({ path: dossier + '/e11-tel-reception-ouverte.png', fullPage: true });
  ok('téléphone : pas de défilement horizontal' + (debordements.length ? ' (' + debordements.join(', ') + ')' : ''), debordements.length === 0);

  // -------------------------------------------------------------------------
  // 3. Bertrand : rien avant la date, puis la gazette altérée et la fausse carte
  // -------------------------------------------------------------------------
  const be = await nouvellePage({ viewport: { width: 1000, height: 900 } });
  const recuesParBertrand = [];
  be.on('response', async (r) => { if (r.url().includes('/api/joueur/') && !/\/(images|sceaux)\//.test(r.url())) { const texte = await r.text().catch(() => ''); recues.push(texte); recuesParBertrand.push(texte); } });
  await connecter(be, 'bertrand@exemple.fr');
  await be.waitForURL('**/reception');
  ok('Bertrand : aucun pli avant sa date', await be.locator('li[data-pli]').count() === 0);
  ok('Bertrand : ni son pli en route, ni son image', (await be.request.get(`${base}/api/joueur/plis/${carteBertrand.id}`)).status() === 404 && (await image(be.request, carteBertrand.id, autreImage.id)).status() === 404);
  ok('Bertrand : pas l\'image du pli d\'Alix', (await image(be.request, plisAlix.carte, imageCarte)).status() === 404);
  for (const exemplaire of [gazetteBertrand, carteBertrand]) {
    await api.put(`${base}/api/mj/exemplaires/${exemplaire.id}`, { data: { destinataire_id: BERTRAND, acheminement: 'en_route', livraison_le: maintenant } });
  }
  ok('image : toujours refusée tant que le pli arrivé est fermé', (await image(be.request, carteBertrand.id, autreImage.id)).status() === 404);
  const lue = await (await be.request.post(`${base}/api/joueur/plis/${gazetteBertrand.id}/ouverture`, { data: {} })).json();
  const doc = lue.contenu.document;
  ok('gazette de Bertrand : la version livrée', doc.articles[1].texte === 'Le prix du sel va doubler cette semaine.');
  ok('gazette de Bertrand : le passage abîmé est voilé', doc.articles[0].texte === texte0.replace(ABIME, '·'.repeat(longueur(ABIME))));
  ok('gazette de Bertrand : la réécriture remarquée, dans sa case', JSON.stringify(lue.contenu.passages_reecrits.map((x) => x.champ)) === '["articles.1.texte"]' && lue.contenu.police_reecriture !== null);
  await be.goto(`${base}/pli/${gazetteBertrand.id}`);
  await be.waitForSelector('article[data-document] .tache');
  await be.waitForTimeout(700);
  await be.screenshot({ path: dossier + '/e11-gazette-alteree.png', fullPage: true });
  const carteLue = await (await be.request.post(`${base}/api/joueur/plis/${carteBertrand.id}/ouverture`, { data: {} })).json();
  ok('fausse carte : Bertrand reçoit l\'autre image, pas l\'originale', carteLue.contenu.document.image === autreImage.id && (await image(be.request, carteBertrand.id, autreImage.id)).status() === 200 && (await image(be.request, carteBertrand.id, imageCarte)).status() === 404);

  const tout = recues.join('\n');
  ok('aucune réponse faite à un joueur ne contient une adresse du stockage', !tout.includes('8791') && !tout.includes('fichiers/') && !tout.includes('blob') && !tout.includes('images/0'));
  const pourBertrand = recuesParBertrand.join('\n');
  ok('Bertrand ne reçoit ni le texte abîmé, ni l\'original réécrit (' + recuesParBertrand.length + ' réponses)', recuesParBertrand.length > 3 && !pourBertrand.includes(ABIME) && !pourBertrand.includes('reste stable'));
  ok('aucune erreur dans les pages' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''), erreurs.length === 0);

  await b.close();
  stockage.close();
})().catch((e) => { console.log('ECHEC ' + e.message.split('\n')[0]); process.exit(1); });
