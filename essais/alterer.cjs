// Parcours « alterer » : le MJ réécrit une lettre, abîme un passage, recolle le sceau,
// contrefait la signature, désigne le faussaire, et décide de ce que chacun remarque.
// Puis chaque destinataire lit sa lettre : on vérifie ce qu'il voit, et ce qu'il ne reçoit jamais.
const { chromium } = require('playwright');
const { surveillerPremierChoix } = require('./commun.cjs');
const fs = require('fs');
const { execFileSync } = require('child_process');
const [dossier, journal] = process.argv.slice(2);
const dernier = (re) => { const m = [...fs.readFileSync(journal, 'utf8').matchAll(re)]; return m.length ? m[m.length - 1][1] : null; };
const ok = (nom, cond = true) => console.log((cond ? 'OK   ' : 'ECHEC') + ' ' + nom);
const sql = (requete) => execFileSync('psql', [process.env.DATABASE_URL, '-At', '-c', requete]).toString().trim();
const base = 'http://localhost:5173';
const id = (suffixe) => `00000000-0000-0000-0000-0000000000${suffixe}`;
const ALIX = id('a1'), BERTRAND = id('a2'), CLEMENCE = id('a4'), CHANCELIER = id('a5');
const SCEAU_ALIX = id('c1'), SCEAU_CHANCELLERIE = id('c5');
const PLI_1 = id('d1'), PLI_2 = id('d2');

const ORIGINAL = 'Cher Bertrand 🕯,\nles registres sont à l\'abri chez le notaire. Retrouvez-moi à la chapelle, jeudi soir.\nBrûlez cette lettre.';
const LIVRE = ORIGINAL.replace('à la chapelle,', 'au vieux moulin,');
const ABIME = 'chez le notaire';
// Les secrets : ce qui est abîmé, et ce que l'original disait.
const SECRETS = ['chez le notaire', 'le notaire', 'la chapelle', 'porte nord'];

// Les positions comptent les caractères Unicode, comme le serveur : la bougie en vaut un.
const longueur = (texte) => [...texte].length;
const passage = (texte, extrait) => {
  const debut = longueur(texte.slice(0, texte.indexOf(extrait)));
  return { champ: 'texte', debut, fin: debut + longueur(extrait) };
};
const extrait = (texte, p) => [...texte].slice(p.debut, p.fin).join('');
// Ce que le destinataire doit lire à la place du passage abîmé : des points, espaces compris.
const voile = (texte) => texte.replace(ABIME, '·'.repeat(longueur(ABIME)));

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
  const debordements = [];
  const photo = async (page, nom) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${dossier}/e10-${nom}.png`, fullPage: true });
    if (nom.startsWith('tel-') && await deborde(page)) debordements.push(nom);
  };

  // --- Le MJ ---------------------------------------------------------------
  const p = await nouvellePage({ viewport: { width: 1200, height: 900 } });
  const api = p.request;
  const enRoute = async () => (await api.get(base + '/api/mj/en-route')).json();
  const detail = async (exemplaire) => (await api.get(`${base}/api/mj/exemplaires/${exemplaire}`)).json();
  const alterer = (exemplaire, version) => api.put(`${base}/api/mj/exemplaires/${exemplaire}/version`, { data: version });
  const carte = (titre) => p.locator(`li:has(h3:text-is("${titre}"))`);
  const zone = 'textarea[aria-label="Version livrée"]';

  await connecter(p, 'mj@exemple.fr');
  await p.waitForURL('**/mj/a-traiter');

  // 1. La première lettre part telle quelle, avec une copie pour Clémence.
  await p.goto(`${base}/mj/a-traiter/${PLI_1}`);
  await p.waitForSelector('h2:text-is("Altération")');
  await choisir(p, '[aria-label="Ajouter une copie"]', 'Clémence Hardy');
  await p.click('button:text-is("Livrer")');
  await p.waitForURL('**/mj/a-traiter');
  let route = await enRoute();
  const pourBertrand = route.en_route.find((x) => x.pli_id === PLI_1 && x.origine === 'destinataire');
  const pourClemence = route.en_route.find((x) => x.pli_id === PLI_1 && x.origine === 'copie');
  ok('la lettre part vers Bertrand, avec une copie pour Clémence, sans altération', pourBertrand && pourClemence && !pourBertrand.altere && !pourClemence.altere);

  // 2. L'atelier : l'original à gauche, la version livrée à droite
  await p.goto(base + '/mj/en-route');
  await carte('Alix de Montfort à Bertrand Lenoir').locator('a:text-is("Altérer")').click();
  await p.waitForURL(`**/mj/en-route/${pourBertrand.id}`);
  await p.waitForSelector(zone);
  ok('atelier : la version livrée part de l\'original', await p.inputValue(zone) === ORIGINAL);
  ok('rien à enregistrer tant que rien ne change', await p.locator('button:text-is("Enregistrer")').isDisabled());
  ok('rien à remarquer tant que rien n\'est altéré', await p.locator('#remarque-texte').isDisabled() && await p.locator('#remarque-sceau').isDisabled() && await p.locator('#remarque-signature').isDisabled());

  // 3. Réécrire une phrase : le passage est surligné pendant la frappe
  await p.fill(zone, LIVRE);
  await p.waitForTimeout(300);
  const surlignes = await p.locator(`${zone} >> xpath=preceding-sibling::div//span[contains(@class,"bg-bon")]`).allTextContents();
  ok('le passage réécrit est surligné pendant la frappe (' + JSON.stringify(surlignes) + ')', JSON.stringify(surlignes) === JSON.stringify(['au vieux moulin,']));

  // 4. Abîmer un passage : la sélection du champ compte en UTF-16, le serveur en caractères
  const depart = LIVRE.indexOf(ABIME);
  await p.locator(zone).evaluate((champ, [debut, fin]) => { champ.focus(); champ.setSelectionRange(debut, fin); }, [depart, depart + ABIME.length]);
  await p.click('button:text-is("Abîmer la sélection")');
  await p.waitForSelector('[aria-label="Passages abîmés"] li');
  ok('le passage abîmé est bien celui qui était sélectionné', (await p.locator('[aria-label="Passages abîmés"] li').allTextContents()).join('|') === `« ${ABIME} »`);
  // Écrire avant un passage abîmé le décale, sans le perdre.
  await p.fill(zone, 'Mon ' + LIVRE);
  ok('une frappe avant le passage abîmé le décale', (await p.locator('[aria-label="Passages abîmés"] li').allTextContents()).join('|') === `« ${ABIME} »`);
  await p.fill(zone, LIVRE);
  ok('et il revient à sa place quand on l\'efface', (await p.locator('[aria-label="Passages abîmés"] li').allTextContents()).join('|') === `« ${ABIME} »`);

  // 5. Le sceau, la signature, le faussaire, et ce que Bertrand remarque
  await p.click('fieldset:has(legend:text-is("Sceau")) button:text-is("Recollé")');
  await p.click('fieldset:has(legend:text-is("Signature")) button:text-is("Contrefaite")');
  ok('signature contrefaite : par défaut, celle de l\'auteur', await p.inputValue('#signature-nom') === 'Alix de Montfort');
  await p.click('label[for=remarque-texte]');
  await p.waitForSelector('[role=alert]:has-text("Désignez le faussaire")');
  ok('remarqué sans faussaire : l\'enregistrement est bloqué', await p.locator('button:text-is("Enregistrer")').isDisabled());
  await choisir(p, '[aria-label="Faussaire"]', 'Clémence Hardy');
  await p.click('label[for=remarque-sceau]');
  await p.click('label[for=remarque-signature]');
  ok('aperçu : la tache, le sceau, et la signature dans la main de Clémence', await p.locator('article .tache').count() === 1 && await p.locator('article [aria-label="Sceau de Alix de Montfort"]').count() === 1 && await p.locator('article span[style*="Patrick Hand"]:has-text("Alix de Montfort")').count() === 1);
  ok('aperçu : le texte abîmé n\'est pas dans la lettre', !(await p.locator('article').innerText()).includes('notaire'));
  await photo(p, 'alteration');
  await p.click('button:text-is("Enregistrer")');
  await p.waitForSelector('text=Version livrée enregistrée');

  // 6. Ce que le serveur a retenu
  let vu = await detail(pourBertrand.id);
  ok('le serveur repère le passage réécrit au bon endroit', vu.passages_reecrits.length === 1 && extrait(LIVRE, vu.passages_reecrits[0]) === 'au vieux moulin,');
  ok('le passage abîmé tombe juste malgré la bougie', vu.version.passages_abimes.length === 1 && extrait(LIVRE, vu.version.passages_abimes[0]) === ABIME);
  ok('sceau recollé, signature contrefaite, Clémence pour faussaire, tout est remarqué', vu.version.sceau_etat === 'recolle' && vu.version.sceau_id === SCEAU_ALIX && vu.version.signature_etat === 'contrefaite' && vu.version.signature_personnage_id === ALIX && vu.version.faussaire_personnage_id === CLEMENCE && vu.version.remarque_texte && vu.version.remarque_sceau && vu.version.remarque_signature);
  ok('l\'original n\'a pas changé', vu.original.contenu.texte === ORIGINAL && sql(`select contenu->>'texte' from plis where id = '${PLI_1}'`) === ORIGINAL);
  const trace = vu.historique.filter((e) => e.genre === 'alteration');
  ok('l\'historique garde l\'avant et l\'après', trace.length === 1 && trace[0].details.avant.contenu.texte === ORIGINAL && trace[0].details.apres.contenu.texte === LIVRE && trace[0].details.avant.sceau_etat === 'intact' && trace[0].details.apres.sceau_etat === 'recolle');
  await p.locator('summary:has-text("Voir l\'avant et l\'après")').click();
  ok('l\'historique se lit dans l\'atelier', await p.locator('details p:has-text("la chapelle")').count() === 1 && await p.locator('details p:has-text("vieux moulin")').count() === 1);
  ok('enregistrer deux fois la même version n\'ajoute rien à l\'historique', (await alterer(pourBertrand.id, vu.version)).status() === 200 && (await detail(pourBertrand.id)).historique.filter((e) => e.genre === 'alteration').length === 1);

  // 7. La copie de Clémence : la même altération, mais elle ne remarque rien
  const pourClemenceVersion = { ...vu.version, remarque_texte: false, remarque_sceau: false, remarque_signature: false };
  ok('la copie de Clémence reçoit la même version, sans rien remarquer', (await alterer(pourClemence.id, pourClemenceVersion)).status() === 200);
  await p.goto(base + '/mj/en-route');
  await p.waitForSelector('h3');
  ok('En route : un repère sur les plis altérés', await carte('Alix de Montfort à Bertrand Lenoir').locator('[data-slot=badge]:text-is("Altéré · remarqué")').count() === 1 && await carte('Alix de Montfort à Clémence Hardy').locator('[data-slot=badge]:text-is("Altéré")').count() === 1);
  await photo(p, 'en-route');

  // 8. Ce que le serveur refuse
  const refus = async (changement) => (await alterer(pourClemence.id, { ...pourClemenceVersion, ...changement })).status();
  ok('un autre sceau que celui de l\'auteur ne peut pas être « intact »', await refus({ sceau_id: SCEAU_CHANCELLERIE, sceau_etat: 'intact' }) === 400);
  ok('un sceau posé par l\'auteur ne se retire pas', await refus({ sceau_id: null, sceau_etat: null }) === 400);
  ok('une lettre signée ne devient pas « sans signature »', await refus({ signature_etat: 'absente' }) === 400);
  ok('remarqué sans faussaire : refusé', await refus({ faussaire_personnage_id: null, faussaire_ecriture_id: null, remarque_texte: true }) === 400);
  const ecritureDAlix = sql(`select ecriture_id from personnages where id = '${ALIX}'`);
  ok('main inconnue : pas l\'écriture d\'un personnage', await refus({ faussaire_personnage_id: null, faussaire_ecriture_id: ecritureDAlix }) === 400);
  ok('un passage abîmé hors du texte : refusé', await refus({ passages_abimes: [{ champ: 'texte', debut: 10, fin: 5000 }] }) === 400);
  ok('un texte vide : refusé', await refus({ contenu: { gabarit: 'billet', texte: '  ' }, passages_abimes: [] }) === 400);
  ok('les passages réécrits ne viennent jamais de l\'interface', (await alterer(pourClemence.id, { ...pourClemenceVersion, passages_reecrits: [] })).status() === 200 && (await detail(pourClemence.id)).passages_reecrits.length === 1);
  sql(`insert into personnages (id, nom, genre) values ('${id('a9')}', 'Sans Main', 'pnj')`);
  ok('un PNJ sans écriture ne peut pas être désigné', await refus({ faussaire_personnage_id: id('a9') }) === 400);

  // 9. Altérer au traitement : la même version part vers tous, rien n'est remarqué
  await p.goto(`${base}/mj/a-traiter/${PLI_2}`);
  await p.waitForSelector('h2:text-is("Altération")');
  await choisir(p, '[aria-label="Ajouter une copie"]', 'Bertrand Lenoir');
  await p.click('button:text-is("Altérer cette lettre")');
  await p.waitForSelector(zone);
  ok('au traitement : pas de « remarqué », il se décide ensuite', await p.locator('#remarque-texte').count() === 0);
  await p.fill(zone, 'Clémence, doublez la garde à la porte sud dès demain.');
  await p.click('fieldset:has(legend:text-is("Sceau")) button:text-is("Contrefait")');
  await photo(p, 'traitement');
  await p.click('button:text-is("Livrer")');
  await p.waitForURL('**/mj/a-traiter');
  route = await enRoute();
  const duPli2 = route.en_route.filter((x) => x.pli_id === PLI_2);
  ok('la version altérée part vers le destinataire et vers la copie', duPli2.length === 2 && duPli2.every((x) => x.altere && !x.remarque && x.contenu.texte.includes('porte sud') && x.sceau && x.sceau.initiales === 'AM'));
  const copieBertrand = duPli2.find((x) => x.origine === 'copie');
  vu = await detail(copieBertrand.id);
  ok('le serveur a repéré le mot changé, et gardé l\'original', vu.passages_reecrits.length === 1 && extrait(vu.version.contenu.texte, vu.passages_reecrits[0]) === 'sud' && vu.original.contenu.texte.includes('porte nord') && vu.version.sceau_etat === 'contrefait' && vu.version.sceau_id === SCEAU_ALIX);
  ok('rien n\'est remarqué, et chaque exemplaire a sa ligne d\'historique', !vu.version.remarque_texte && !vu.version.remarque_sceau && sql(`select count(*) from evenements where pli_id = '${PLI_2}' and genre = 'alteration'`) === '2');
  // Une main inconnue : une écriture qu'aucun personnage n'utilise.
  const libre = sql(`select e.id from ecritures e where not exists (select 1 from personnages p where p.ecriture_id = e.id) and e.police = 'marck-script'`);
  ok('main inconnue : une écriture libre, et Bertrand remarque le mot changé', (await alterer(copieBertrand.id, { ...vu.version, faussaire_ecriture_id: libre, remarque_texte: true })).status() === 200);
  // Une copie faite dans En route reprend la version livrée de l'exemplaire copié.
  ok('copie depuis En route : elle reprend la version altérée, sans rien remarquer', (await api.post(`${base}/api/mj/exemplaires/${copieBertrand.id}/copie`, { data: { destinataire_id: CHANCELIER, livraison_le: null } })).status() === 204 && sql(`select contenu->>'texte' like '%porte sud%' and not remarque_texte and passages_reecrits <> '[]' from exemplaires where pli_id = '${PLI_2}' and destinataire_id = '${CHANCELIER}'`) === 't');

  // 10. L'atelier au téléphone
  const tel = await p.context().newPage();
  tel.on('pageerror', (e) => erreurs.push(e.message));
  await tel.setViewportSize({ width: 390, height: 844 });
  await tel.goto(`${base}/mj/en-route/${pourBertrand.id}`);
  await tel.waitForSelector(zone);
  await photo(tel, 'tel-alteration');

  // 11. Un exemplaire arrivé ne s'altère plus
  const arriver = (x) => api.put(`${base}/api/mj/exemplaires/${x.id}`, { data: { destinataire_id: x.destinataire_id, acheminement: 'en_route', livraison_le: '2020-01-01T00:00:00Z' } });
  ok('les trois exemplaires arrivent', (await arriver(pourBertrand)).status() === 204 && (await arriver(pourClemence)).status() === 204 && (await arriver(copieBertrand)).status() === 204);
  ok('un exemplaire arrivé ne s\'altère plus', (await alterer(pourBertrand.id, pourClemenceVersion)).status() === 400 && (await detail(pourBertrand.id)).version.remarque_texte === true);
  await p.goto(`${base}/mj/en-route/${pourBertrand.id}`);
  await p.waitForSelector('text=Ce pli est arrivé : il ne se modifie plus.');
  ok('arrivé : l\'atelier ne propose plus rien à changer, mais montre l\'original', await p.locator(zone).count() === 0 && await p.locator('button:text-is("Enregistrer")').count() === 0 && await p.locator('text=la chapelle').count() >= 1);
  await photo(p, 'arrive');

  // --- Les joueurs ---------------------------------------------------------
  // Tout ce que le serveur leur envoie est gardé, pour y chercher ce qui ne doit pas sortir.
  const recu = [];
  const ecouter = (page) => page.on('response', async (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) recu.push(await r.text().catch(() => ''));
  });
  const lire = async (page, chemin, options) => {
    const reponse = options ? await page.request.post(base + '/api' + chemin, options) : await page.request.get(base + '/api' + chemin);
    const texte = await reponse.text();
    recu.push(texte);
    return JSON.parse(texte);
  };
  const ouvrirEtLire = async (page, exemplaire, nom) => {
    const pli = await lire(page, `/joueur/plis/${exemplaire}/ouverture`, { data: {} });
    await page.goto(`${base}/pli/${exemplaire}`);
    await page.waitForSelector('article');
    await photo(page, nom);
    return pli;
  };

  // 12. Bertrand a tout remarqué
  const tb = await nouvellePage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  ecouter(tb);
  await connecter(tb, 'bertrand@exemple.fr');
  await tb.waitForURL('**/reception');
  await tb.waitForSelector('[data-pli]');
  const lettreB = await ouvrirEtLire(tb, pourBertrand.id, 'tel-bertrand');
  ok('Bertrand lit la version livrée, le passage abîmé voilé', lettreB.contenu.document.texte === voile(LIVRE));
  ok('Bertrand voit la phrase réécrite dans l\'écriture de Clémence', lettreB.contenu.passages_reecrits.length === 1 && extrait(lettreB.contenu.document.texte, lettreB.contenu.passages_reecrits[0]) === 'au vieux moulin,' && lettreB.contenu.police === 'caveat' && lettreB.contenu.police_reecriture === 'patrick-hand');
  ok('Bertrand voit la signature dans l\'écriture de Clémence, et le sceau recollé', lettreB.contenu.signature.nom === 'Alix de Montfort' && lettreB.contenu.signature.police === 'patrick-hand' && lettreB.exterieur.sceau.etat === 'recolle');
  ok('Bertrand voit où est la tache', lettreB.contenu.passages_abimes.length === 1 && extrait(lettreB.contenu.document.texte, lettreB.contenu.passages_abimes[0]) === '·'.repeat(longueur(ABIME)));
  ok('à l\'écran : une tache, et le passage réécrit dans une autre main', await tb.locator('article .tache').count() === 1 && await tb.locator('article p span[style*="Patrick Hand"]:has-text("au vieux moulin,")').count() === 1 && await tb.locator('article p span[style*="Caveat"]').count() >= 2);
  ok('à l\'écran : aucun mot n\'explique l\'altération', !/alt[ée]r|faux|fauss|contref|recoll|remarqu|abîm/i.test(await tb.locator('main, body').first().innerText()));
  // La copie du second pli : Bertrand y remarque le mot changé, d'une main inconnue.
  const copieB = await ouvrirEtLire(tb, copieBertrand.id, 'tel-bertrand-copie');
  ok('la main inconnue paraît dans son écriture, sans que le sceau imité se remarque', copieB.contenu.police_reecriture === 'marck-script' && extrait(copieB.contenu.document.texte, copieB.contenu.passages_reecrits[0]) === 'sud' && copieB.exterieur.sceau.etat === 'intact' && copieB.exterieur.sceau.nom === 'Alix de Montfort');

  // 13. Clémence n'a rien remarqué
  const tc = await nouvellePage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  ecouter(tc);
  await connecter(tc, 'clemence@exemple.fr');
  await tc.waitForURL('**/reception');
  await tc.waitForSelector('[data-pli]');
  const lettreC = await ouvrirEtLire(tc, pourClemence.id, 'tel-clemence');
  ok('Clémence lit la même version livrée', lettreC.contenu.document.texte === voile(LIVRE));
  ok('Clémence voit tout dans l\'écriture d\'Alix, et le sceau intact', lettreC.contenu.passages_reecrits.length === 0 && lettreC.contenu.police_reecriture === null && lettreC.contenu.police === 'caveat' && lettreC.contenu.signature.police === 'caveat' && lettreC.exterieur.sceau.etat === 'intact');
  ok('Clémence voit aussi le passage abîmé', lettreC.contenu.passages_abimes.length === 1 && await tc.locator('article .tache').count() === 1);
  ok('à l\'écran : rien d\'une autre main', await tc.locator('article span[style*="Patrick Hand"]').count() === 0);
  await lire(tc, '/joueur/reception');
  await lire(tb, '/joueur/reception');
  await lire(tb, '/joueur/ecritoire');

  // 14. Ce qui ne sort jamais
  const tout = recu.join('\n');
  ok('le texte abîmé et l\'original ne sont dans aucune réponse faite aux joueurs (' + recu.length + ' réponses)', recu.length > 10 && !SECRETS.some((secret) => tout.includes(secret)));
  ok('ni le faussaire, ni les états cachés', !tout.includes('faussaire') && !tout.includes('remarque') && !/"sceau_etat"|"signature_etat"/.test(tout) && !lettreC.exterieur.sceau.etat.includes('recolle'));
  ok('la vue des joueurs voile le texte dans la base elle-même', sql(`select count(*) from plis_recus where contenu::text like '%notaire%'`) === '0' && sql(`select count(*) from exemplaires where contenu::text like '%notaire%'`) === '2');
  const portes = [
    (await tb.request.get(`${base}/api/mj/exemplaires/${pourBertrand.id}`)).status(),
    (await tb.request.put(`${base}/api/mj/exemplaires/${pourBertrand.id}/version`, { data: pourClemenceVersion })).status(),
  ];
  ok('un joueur n\'entre pas dans l\'atelier (' + portes.join(', ') + ')', portes.every((s) => s === 403));

  ok('téléphone : pas de défilement horizontal' + (debordements.length ? ' (' + debordements.join(', ') + ')' : ''), debordements.length === 0);
  ok('aucune erreur de page' + (erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''), erreurs.length === 0);
  await b.close();
})().catch((e) => { console.log('ECHEC', e.message.split('\n').slice(0, 5).join(' / ')); process.exit(1); });
