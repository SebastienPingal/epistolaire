// Parcours « recevoir » : la Réception, l'ouverture d'un pli, les dossiers, la destruction,
// le carnet qui s'enrichit, et le calendrier du jeu.
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const [dossier, journal] = process.argv.slice(2);
const dernier = (re) => { const m = [...fs.readFileSync(journal, 'utf8').matchAll(re)]; return m.length ? m[m.length - 1][1] : null; };
const ok = (nom, cond = true) => console.log((cond ? 'OK   ' : 'ECHEC') + ' ' + nom);
const sql = (requete) => execFileSync('psql', [process.env.DATABASE_URL, '-At', '-c', requete]).toString().trim();
const base = 'http://localhost:5173';
const id = (suffixe) => `00000000-0000-0000-0000-0000000000${suffixe}`;
const ALIX = id('a1'), BERTRAND = id('a2'), CLEMENCE = id('a4'), CHANCELIER = id('a5');
const [A, B, C, D, E, F] = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map(id);
const PERSONNAGES = [ALIX, BERTRAND, CLEMENCE, CHANCELIER];
// Le jeu a commencé il y a 40 jours : aujourd'hui est le 41e jour, soit le 10e jour du 2e mois.
const AUJOURD_HUI = '10e jour du 2e mois, an 1';
const HIER = '9e jour du 2e mois, an 1';
const AVANT_HIER = '8e jour du 2e mois, an 1';
const IL_Y_A_TROIS_JOURS = '7e jour du 2e mois, an 1';
const HORODATAGE = /\d{4}-\d{2}-\d{2}T\d{2}:/;
const HEURE = /\b\d{1,2}(:|\s?h\s?)\d{2}\b/;

(async () => {
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
    await page.locator('input[autocomplete="one-time-code"]').pressSequentially(dernier(/saisissez ce code : (\d{6})/g));
  };
  const lire = async (page, chemin) => (await page.request.get(base + '/api' + chemin)).json();
  const statut = async (requete) => (await requete).status();
  const deborde = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const debordements = [];
  const photo = async (page, nom) => {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dossier}/e7-${nom}.png`, fullPage: true });
    if (nom.startsWith('tel-') && await deborde(page)) debordements.push(nom);
  };
  const carnet = async (page) => (await lire(page, '/joueur/ecritoire')).carnet.map((c) => c.personnage_id);

  // Un glissement au doigt, de vrais événements tactiles envoyés au navigateur.
  const glisser = async (page, element, distance, { photoAuMilieu } = {}) => {
    const cdp = await page.context().newCDPSession(page);
    const boite = await page.locator(element).boundingBox();
    const x = boite.x + boite.width / 2, y = boite.y + boite.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    const pas = 12;
    for (let i = 1; i <= pas; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (distance * i) / pas, y }] });
      await page.waitForTimeout(16);
      if (photoAuMilieu && i === pas / 2) await photo(page, photoAuMilieu);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  };
  const maintenir = async (page, duree) => {
    const boite = await page.locator('[aria-label="Ouvrir le pli"]').boundingBox();
    await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(duree);
    await page.mouse.up();
  };

  // 1. La Réception d'Alix, au téléphone
  const tel = await nouvellePage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await connecter(tel, 'alix@exemple.fr');
  await tel.waitForURL('**/reception');
  await tel.waitForSelector('[data-pli]');
  const ordre = await tel.locator('[data-pli]').evaluateAll((l) => l.map((e) => e.dataset.pli));
  ok('Réception d\'Alix : (a) puis (b), et rien d\'autre', JSON.stringify(ordre) === JSON.stringify([A, B]));
  ok('date d\'arrivée du jeu affichée, sans heure', await tel.locator(`text=Arrivé le ${HIER}`).count() === 1 && await tel.locator(`text=Arrivé le ${AVANT_HIER}`).count() === 1);
  await photo(tel, 'tel-reception');

  // 2. Ce que le serveur envoie : l'extérieur seulement
  const brut = JSON.stringify(await lire(tel, '/joueur/reception'));
  ok('réception : aucun texte de lettre', !/registres|surveille|SECRET/.test(brut));
  ok('réception : aucun horodatage', !HORODATAGE.test(brut));
  ok('réception : aucun identifiant de personnage', !PERSONNAGES.some((p) => brut.includes(p)));
  ok('réception : ni signature ni début de texte avant l\'ouverture', !/"signature":"|"debut":"/.test(brut));
  ok('réception : le nombre de plis non ouverts', JSON.parse(brut).non_ouverts === 2);
  const avant = await lire(tel, `/joueur/plis/${A}`);
  ok('pli (a) avant l\'ouverture : l\'extérieur, sans contenu ni texte', avant.contenu === null && !/registres/.test(JSON.stringify(avant)));

  // 3. Le geste au doigt : trop court, puis assez long
  const carnetAvant = await carnet(tel);
  ok('Bertrand n\'est pas encore dans le carnet d\'Alix', !carnetAvant.includes(BERTRAND));
  await tel.click(`[data-pli="${A}"] a`);
  await tel.waitForSelector('[aria-label="Ouvrir le pli"]');
  ok('pli fermé : le sceau de Bertrand se voit', await tel.locator('[aria-label="Sceau de Bertrand Lenoir"]').count() > 0);
  await photo(tel, 'tel-pli-ferme');
  await glisser(tel, '[aria-label="Ouvrir le pli"]', 50);
  await tel.waitForTimeout(800);
  ok('glissement trop court : le pli reste fermé', await tel.locator('article').count() === 0 && sql(`select ouvert_le is null from exemplaires where id = '${A}'`) === 't');
  await glisser(tel, '[aria-label="Ouvrir le pli"]', 170, { photoAuMilieu: 'tel-geste' });
  await tel.waitForSelector('article', { timeout: 5000 }).catch(() => null);
  ok('glissement au doigt : le pli s\'ouvre', await tel.locator('article').count() === 1);

  // 4. La lettre ouverte
  const lettre = tel.locator('article');
  const texteLettre = await lettre.innerText();
  ok('lettre : le texte, avec ses retours à la ligne', texteLettre.includes('les registres ont disparu de la trésorerie.\nNe dites rien'));
  const police = await lettre.locator('p').nth(1).locator('span').first().evaluate((e) => getComputedStyle(e).fontFamily);
  ok('lettre : dans l\'écriture de Bertrand (' + police + ')', police.includes('Kalam'));
  ok('lettre : sa signature et son cachet', texteLettre.includes('Bertrand Lenoir') && await lettre.locator('[aria-label="Sceau de Bertrand Lenoir"]').count() === 1);
  ok('lettre : la date d\'écriture du jeu en haut', (await lettre.locator('p').first().innerText()) === IL_Y_A_TROIS_JOURS);
  ok('lettre : la date de réception dessous', await tel.locator(`text=Reçu le ${HIER}`).count() === 1);
  ok('lettre : aucune heure', !HEURE.test(await tel.locator('main').innerText()));
  await photo(tel, 'tel-pli-ouvert');
  const carnetApres = await carnet(tel);
  ok('ouvrir (a) ajoute Bertrand au carnet d\'Alix', carnetApres.includes(BERTRAND) && carnetApres.length === carnetAvant.length + 1);
  ok('par le sceau d\'abord', sql(`select origine from contacts where proprietaire_id = '${ALIX}' and personnage_id = '${BERTRAND}'`) === 'sceau');
  const pliA = await lire(tel, `/joueur/plis/${A}`);
  ok('pli ouvert : la réponse ne contient ni horodatage ni identifiant de personnage', !HORODATAGE.test(JSON.stringify(pliA)) && !PERSONNAGES.some((p) => JSON.stringify(pliA).includes(p)));

  // 5. À la souris, sur ordinateur
  const ordi = await nouvellePage({ viewport: { width: 1200, height: 900 } });
  await connecter(ordi, 'alix@exemple.fr');
  await ordi.waitForURL('**/reception');
  await ordi.waitForSelector('[data-pli]');
  await photo(ordi, 'ordi-reception');
  await ordi.goto(`${base}/pli/${B}`);
  await ordi.waitForSelector('[aria-label="Ouvrir le pli"]');
  await maintenir(ordi, 150);
  await ordi.waitForTimeout(900);
  ok('clic bref : le pli reste fermé', await ordi.locator('article').count() === 0 && sql(`select ouvert_le is null from exemplaires where id = '${B}'`) === 't');
  await maintenir(ordi, 1200);
  await ordi.waitForSelector('article', { timeout: 5000 }).catch(() => null);
  ok('clic maintenu : le pli s\'ouvre', await ordi.locator('article').count() === 1);
  ok('lettre anonyme : ni signature ni cachet', !(await ordi.locator('article').innerText()).includes('Clémence') && await ordi.locator('article [role=img]').count() === 0);
  await photo(ordi, 'ordi-pli-ouvert');
  const carnetAnonyme = await carnet(ordi);
  ok('ouvrir (b), anonyme, n\'ajoute personne', carnetAnonyme.length === carnetApres.length);
  await ordi.request.post(`${base}/api/joueur/plis/${A}/ouverture`, { data: {} });
  ok('rouvrir (a) n\'ajoute rien de plus', (await carnet(ordi)).length === carnetApres.length);

  // 6. Ce qui n'est pas à Alix, ou pas encore arrivé
  const refus = [];
  for (const pli of [C, D, E, F]) {
    refus.push(await statut(tel.request.post(`${base}/api/joueur/plis/${pli}/ouverture`, { data: {} })));
    refus.push(await statut(tel.request.get(`${base}/api/joueur/plis/${pli}`)));
  }
  refus.push(await statut(tel.request.put(`${base}/api/joueur/plis/${F}/dossier`, { data: { dossier_id: null } })));
  refus.push(await statut(tel.request.delete(`${base}/api/joueur/plis/${F}`)));
  refus.push(await statut(tel.request.post(`${base}/api/joueur/destruction`, { data: { plis: [B, F] } })));
  ok('(c), (d), (e), (f) : ni ouverts, ni lus, ni rangés, ni détruits (' + [...new Set(refus)].join(', ') + ')', refus.every((s) => s === 404));
  ok('un geste refusé ne touche à rien : (b) n\'est pas détruit', sql(`select detruit_le is null from exemplaires where id = '${B}'`) === 't');
  ok('(c), (d), (e) ne sont pas ouverts', sql(`select count(*) from exemplaires where id in ('${C}', '${D}', '${E}', '${F}') and ouvert_le is not null`) === '0');

  // 7. Les dossiers
  await tel.goto(`${base}/reception`);
  await tel.click('button:has-text("Nouveau dossier")');
  await tel.fill('[aria-label="Nom du dossier"]', 'Intrigues');
  await tel.click('[role=dialog] button[type=submit]');
  await tel.waitForURL('**/dossiers/*');
  const intrigues = tel.url().split('/').pop();
  ok('nouveau dossier « Intrigues »', await tel.waitForSelector('h1:text-is("Intrigues")', { timeout: 5000 }).then(() => true, () => false));
  await tel.goto(`${base}/pli/${A}`);
  await tel.click('button:text-is("Ranger")');
  await tel.click('[role=dialog] button:has-text("Intrigues")');
  await tel.waitForSelector('text=Pli rangé : Intrigues.');
  let reception = await lire(tel, '/joueur/reception');
  let contenu = await lire(tel, `/joueur/dossiers/${intrigues}`);
  ok('(a) rangé : il quitte la Réception et paraît dans le dossier', !reception.plis.some((p) => p.id === A) && contenu.plis.some((p) => p.id === A) && reception.dossiers[0].nombre === 1);
  await tel.click('button:text-is("Ranger")');
  await tel.click('[role=dialog] button:has-text("Réception")');
  await tel.waitForSelector('text=Pli rangé : Réception.');
  reception = await lire(tel, '/joueur/reception');
  ok('(a) ressort dans la Réception', reception.plis.some((p) => p.id === A));
  // Par le mode choix, cette fois.
  await tel.goto(`${base}/reception`);
  await tel.click('button:text-is("Choisir")');
  await tel.click(`[data-pli="${A}"] button`);
  await tel.click('button:text-is("Ranger")');
  await tel.click('[role=dialog] button:has-text("Intrigues")');
  await tel.waitForSelector('text=Pli rangé : Intrigues.');
  contenu = await lire(tel, `/joueur/dossiers/${intrigues}`);
  ok('mode choix : (a) rangé dans « Intrigues »', contenu.plis.some((p) => p.id === A));
  await tel.goto(`${base}/dossiers/${intrigues}`);
  await tel.waitForSelector(`[data-pli="${A}"]`);
  await photo(tel, 'tel-dossiers');
  await tel.click(`[data-pli="${A}"] a`);
  await tel.waitForSelector('article');
  await tel.click('text=Retour');
  await tel.waitForURL(`**/dossiers/${intrigues}`);
  ok('le retour ramène dans le dossier d\'où l\'on vient', true);

  // 8. Bertrand ne touche pas aux dossiers d'Alix
  const bertrand = await nouvellePage({ viewport: { width: 390, height: 844 } });
  await connecter(bertrand, 'bertrand@exemple.fr');
  await bertrand.waitForURL('**/reception');
  const chezBertrand = await lire(bertrand, '/joueur/reception');
  ok('Bertrand ne voit que son pli, et aucun dossier', chezBertrand.plis.length === 1 && chezBertrand.plis[0].id === F && chezBertrand.dossiers.length === 0);
  const refusB = [
    await statut(bertrand.request.get(`${base}/api/joueur/dossiers/${intrigues}`)),
    await statut(bertrand.request.put(`${base}/api/joueur/dossiers/${intrigues}`, { data: { nom: 'Volé' } })),
    await statut(bertrand.request.delete(`${base}/api/joueur/dossiers/${intrigues}`)),
    await statut(bertrand.request.put(`${base}/api/joueur/plis/${F}/dossier`, { data: { dossier_id: intrigues } })),
    await statut(bertrand.request.put(`${base}/api/joueur/plis/${A}/dossier`, { data: { dossier_id: null } })),
    await statut(bertrand.request.get(`${base}/api/joueur/plis/${A}`)),
  ];
  ok('Bertrand : ni lire, ni renommer, ni supprimer le dossier d\'Alix, ni y ranger (' + refusB.join(', ') + ')', refusB.every((s) => s === 404));
  ok('le dossier d\'Alix est intact', sql(`select nom from dossiers where id = '${intrigues}'`) === 'Intrigues');
  ok('un joueur n\'entre pas chez le MJ', await statut(bertrand.request.get(`${base}/api/mj/detruits`)) === 403 && await statut(bertrand.request.get(`${base}/api/mj/reglages/calendrier`)) === 403);

  // 9. Le MJ fait arriver des plis instantanément
  const mj = await nouvellePage({ viewport: { width: 1200, height: 900 } });
  await connecter(mj, 'mj@exemple.fr');
  await mj.waitForURL('**/mj/a-traiter');
  await mj.locator('li:has(h3:text-is("Clémence Hardy à Alix de Montfort"))').locator('button:text-is("Livrer maintenant")').click();
  await mj.waitForSelector('text=Arrivée chez Alix de Montfort');
  const G = sql(`select id from exemplaires where pli_id = '${id('d7')}'`);
  reception = await lire(tel, '/joueur/reception');
  ok('« Livrer maintenant » dans la file : le pli est déjà dans la Réception, en premier', reception.plis[0].id === G && reception.plis[0].arrive_le.jour === 10 && reception.non_ouverts === 1);
  ok('poser_exemplaire retient qui signe', sql(`select signature_personnage_id from exemplaires where id = '${G}'`) === CLEMENCE);
  await mj.goto(`${base}/mj/en-route`);
  await mj.waitForSelector('h3');
  ok('En route : (c) y est encore', (await lire(mj, '/mj/en-route')).en_route.some((x) => x.id === C));
  await mj.locator('li:has(h3:text-is("Bertrand Lenoir à Alix de Montfort"))').first().locator('button:text-is("Faire arriver maintenant")').click();
  await mj.waitForSelector('text=Arrivé chez Alix de Montfort');
  reception = await lire(tel, '/joueur/reception');
  ok('« Faire arriver maintenant » dans En route : (c) est dans la Réception', reception.plis.some((p) => p.id === C) && reception.non_ouverts === 2 && !(await lire(mj, '/mj/en-route')).en_route.some((x) => x.id === C));
  ok('(d) retenu et (e) perdu restent où ils sont', sql(`select string_agg(acheminement, ',' order by id) from exemplaires where id in ('${D}', '${E}')`) === 'retenu,perdu');

  // 10. Animations réduites, et le clavier
  const calme = await nouvellePage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' });
  await connecter(calme, 'alix@exemple.fr');
  await calme.waitForURL('**/reception');
  await calme.goto(`${base}/pli/${G}`);
  await calme.waitForSelector('[aria-label="Ouvrir le pli"]');
  await calme.focus('[aria-label="Ouvrir le pli"]');
  await calme.keyboard.down('Space');
  await calme.waitForTimeout(1100);
  await calme.keyboard.up('Space');
  await calme.waitForSelector('article', { timeout: 5000 }).catch(() => null);
  ok('animations réduites : Espace maintenu ouvre le pli', await calme.locator('article').count() === 1);
  ok('animations réduites : la lettre paraît sans animation', await calme.locator('article').evaluate((e) => getComputedStyle(e).animationName) === 'none');
  ok('Clémence, déjà connue, n\'entre pas deux fois dans le carnet',(await carnet(calme)).includes(CLEMENCE) && (await carnet(calme)).length === carnetApres.length);

  // 11. Le calendrier : un bond ne change pas les dates passées
  let calendrier = await lire(mj, '/mj/reglages/calendrier');
  ok('aujourd\'hui dans le jeu : ' + AUJOURD_HUI, JSON.stringify(calendrier.aujourd_hui) === JSON.stringify({ an: 1, mois: 2, jour: 10 }));
  await mj.goto(`${base}/mj/reglages`);
  await mj.waitForSelector('text=Aujourd\'hui dans le jeu');
  ok('réglages : la date du jeu d\'aujourd\'hui', await mj.locator(`text=${AUJOURD_HUI}`).count() === 1);
  await mj.fill('#bond-jours', '10');
  await mj.fill('#bond-note', 'L\'hiver passe');
  await mj.click('button:text-is("Ajouter le bond")');
  await mj.waitForSelector('text=L\'hiver passe');
  calendrier = await lire(mj, '/mj/reglages/calendrier');
  ok('bond de 10 jours : aujourd\'hui devient le 20e jour du 2e mois', calendrier.aujourd_hui.jour === 20 && calendrier.bonds.length === 1);
  await photo(mj, 'ordi-reglages');
  reception = await lire(tel, '/joueur/reception');
  const pliB = reception.plis.find((p) => p.id === B);
  ok('un pli reçu avant le bond garde sa date', pliB && pliB.arrive_le.jour === 8 && pliB.arrive_le.mois === 2);
  await mj.click('[aria-label="Retirer ce bond"]');
  await mj.waitForTimeout(500);
  ok('bond retiré', (await lire(mj, '/mj/reglages/calendrier')).bonds.length === 0);

  // 12. Détruire : un pli, puis un dossier entier
  await tel.goto(`${base}/reception`);
  await tel.click('button:text-is("Choisir")');
  await tel.click(`[data-pli="${B}"] button`);
  await tel.click('button:text-is("Détruire")');
  await tel.waitForSelector('text=Il sera détruit');
  await tel.click('[role=dialog] button:text-is("Détruire")');
  await tel.waitForSelector('text=Le pli est détruit.');
  reception = await lire(tel, '/joueur/reception');
  ok('(b) détruit : il quitte la Réception', !reception.plis.some((p) => p.id === B));
  ok('(b) reste dans la base, avec la trace du geste', sql(`select detruit_le is not null from exemplaires where id = '${B}'`) === 't' && sql(`select count(*) from evenements where exemplaire_id = '${B}' and genre = 'destruction'`) === '1');
  ok('(b) détruit : ni lu, ni ouvert, ni rangé', [
    await statut(tel.request.get(`${base}/api/joueur/plis/${B}`)),
    await statut(tel.request.post(`${base}/api/joueur/plis/${B}/ouverture`, { data: {} })),
    await statut(tel.request.put(`${base}/api/joueur/plis/${B}/dossier`, { data: { dossier_id: null } })),
    await statut(tel.request.delete(`${base}/api/joueur/plis/${B}`)),
  ].every((s) => s === 404));
  await tel.goto(`${base}/dossiers/${intrigues}`);
  await tel.click('button:text-is("Supprimer")');
  await tel.waitForSelector('text=Le pli qu’il contient sera détruit avec lui');
  await photo(tel, 'tel-supprimer-dossier');
  await tel.click('[role=dialog] button:text-is("Supprimer")');
  await tel.waitForURL('**/reception');
  ok('dossier supprimé', sql(`select count(*) from dossiers where id = '${intrigues}'`) === '0');
  ok('le pli qu\'il contenait est détruit pour Alix, gardé dans la base', sql(`select detruit_le is not null from exemplaires where id = '${A}'`) === 't' && await statut(tel.request.get(`${base}/api/joueur/plis/${A}`)) === 404);
  ok('le carnet garde Bertrand', (await carnet(tel)).includes(BERTRAND));
  const detruits = await lire(mj, '/mj/detruits');
  ok('le MJ voit les deux plis détruits, avec leur texte', detruits.length === 2 && detruits.some((x) => x.id === A && x.dossier === 'Intrigues' && x.texte.includes('registres')) && detruits.some((x) => x.id === B && x.dossier === null));
  await mj.goto(`${base}/mj/detruits`);
  await mj.waitForSelector('h3');
  await photo(mj, 'ordi-detruites');

  // 13. Les écrans au téléphone ne débordent pas
  await tel.goto(`${base}/reception`);
  await tel.waitForSelector('[data-pli]');
  await photo(tel, 'tel-reception-fin');
  ok('téléphone : pas de défilement horizontal' + (debordements.length ? ' (' + debordements.join(', ') + ')' : ''), debordements.length === 0);
  ok('aucune erreur de page' + (erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''), erreurs.length === 0);
  await b.close();
})().catch((e) => { console.log('ECHEC', e.message.split('\n').slice(0, 5).join(' / ')); process.exit(1); });
