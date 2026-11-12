const { chromium } = require('playwright');
const { surveillerPremierChoix } = require('./commun.cjs');
const fs = require('fs');
const { execFileSync } = require('child_process');
const [dossier, journal] = process.argv.slice(2);
const dernier = (re) => { const m = [...fs.readFileSync(journal, 'utf8').matchAll(re)]; return m.length ? m[m.length - 1][1] : null; };
const ok = (nom, cond = true) => console.log((cond ? 'OK   ' : 'ECHEC') + ' ' + nom);
const sql = (requete) => execFileSync('psql', [process.env.DATABASE_URL, '-At', '-c', requete]).toString().trim();
const base = 'http://localhost:5173';
const perso = (n) => `00000000-0000-0000-0000-0000000000a${n}`;
const pliId = (n) => `00000000-0000-0000-0000-0000000000d${n}`;
const ALIX = perso(1), BERTRAND = perso(2), CHANCELIER = perso(5), SCEAU_B = '00000000-0000-0000-0000-0000000000c2';
const billet = (plus = {}) => ({ ecriture_id: null, texte: 'x', signe: true, sceau_id: null, livraison_le: null, ...plus });

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(e.message));
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
  const api = p.request;
  const file = async () => (await api.get(base + '/api/mj/a-traiter')).json();
  const enRoute = async () => (await api.get(base + '/api/mj/en-route')).json();
  const carte = (titre) => p.locator(`li:has(h3:text-is("${titre}"))`);
  // Une liste refermée reste un instant dans la page : on vise celle qui vient de s'ouvrir.
  const choisir = async (page, champ, nom) => {
    await page.click(champ);
    await page.locator(`[role=option]:visible:has-text("${nom}")`).last().click();
    await page.waitForTimeout(300);
  };

  // 1. La file, triée par urgence
  await connecter(p, 'mj@exemple.fr');
  await p.waitForURL('**/mj/a-traiter');
  await p.waitForSelector('h3');
  const titres = await p.locator('h3').allTextContents();
  ok('MJ connecté : arrive sur À traiter');
  ok('file triée par date proposée, la plus proche en premier', JSON.stringify(titres.slice(0, 5)) === JSON.stringify([
    'Bertrand Lenoir à Alix de Montfort',
    'Bertrand Lenoir à « L\'évêque de Clairval »',
    'Bertrand Lenoir à Le Chancelier',
    'Alix de Montfort à Bertrand Lenoir',
    'Alix de Montfort à Dame Inconnue',
  ]));
  ok('lettres pour la gazette rangées à part', titres.length === 7 && titres.slice(5).every((t) => t.endsWith('à la gazette')) && await p.locator('h2:text-is("Pour la gazette")').count() === 1);
  ok('alerte sur les deux dates dépassées', await p.locator('[data-slot=badge]:has-text("Date dépassée")').count() === 2);
  await p.waitForTimeout(800);
  await p.screenshot({ path: dossier + '/e6-file.png', fullPage: true });

  // 2. Validation en un clic, à la date proposée
  const proposee = (await file()).lettres.find((l) => l.id === pliId(1)).date_proposee;
  await carte('Alix de Montfort à Bertrand Lenoir').locator('button:text-is("Valider")').click();
  await p.waitForSelector('text=En route vers Bertrand Lenoir');
  let route = await enRoute();
  const ex1 = route.en_route.find((x) => x.pli_id === pliId(1));
  ok('un clic : en route vers Bertrand, à la date proposée', ex1 && ex1.livraison_le === proposee && ex1.destinataire_nom === 'Bertrand Lenoir' && ex1.origine === 'destinataire');
  ok('la version livrée reprend le texte, la signature, le sceau et l\'écriture de l\'auteur', ex1 && ex1.texte.startsWith('Cher Bertrand') && ex1.signature === 'Alix de Montfort' && ex1.sceau.initiales === 'AM' && ex1.police === 'caveat');

  // 3. Date proposée dépassée : dix minutes après la validation
  await carte('Bertrand Lenoir à Alix de Montfort').locator('button:text-is("Valider")').click();
  await p.waitForSelector('text=En route vers Alix de Montfort');
  route = await enRoute();
  const ex5 = route.en_route.find((x) => x.pli_id === pliId(5));
  const minutes = ex5 ? (new Date(ex5.livraison_le) - Date.now()) / 60000 : -1;
  ok('date dépassée : arrive 10 minutes après la validation (' + minutes.toFixed(1) + ' min)', minutes > 9 && minutes <= 10.1);

  // 4. Adresse libre : PNJ créé à la volée, écriture choisie et gardée, réponse
  await carte('Bertrand Lenoir à « L\'évêque de Clairval »').locator('a:text-is("Choisir le destinataire")').click();
  await p.waitForURL('**/mj/a-traiter/*-*');
  await p.waitForSelector('text=une adresse libre');
  ok('adresse libre : rien ne part sans destinataire', await p.locator('button:text-is("Livrer")').count() === 0 && await p.locator('button:text-is("Écarter")').count() === 1);
  await p.click('button:has-text("Nouveau PNJ")');
  await p.waitForSelector('#pnj-nom');
  ok('nouveau PNJ : le nom proposé est l\'adresse écrite par le joueur', await p.inputValue('#pnj-nom') === 'L\'évêque de Clairval');
  await p.click('[role=dialog] button[type=submit]');
  await p.waitForSelector('h2:has-text("Réponse de L\'évêque de Clairval")');
  const envoyerReponse = p.locator('button:text-is("Envoyer la réponse")');
  ok('réponse vide : envoi bloqué', await envoyerReponse.isDisabled());
  await p.locator('textarea').fill('Mon fils, venez à Clairval dimanche. Nous parlerons.');
  ok('PNJ sans écriture : envoi bloqué tant qu\'elle n\'est pas choisie', await envoyerReponse.isDisabled());
  const mains = await p.locator('fieldset:has(legend:has-text("Écriture de")) button').allTextContents();
  ok('écritures proposées : les génériques d\'abord, pas celles des joueurs (' + mains.length + ')', mains.length === 11 && mains[0].includes('générique') && mains[1].includes('générique') && !mains[2].includes('générique') && !mains.some((m) => /Vive|Appliquée|Ronde/.test(m)));
  await p.click('fieldset:has(legend:has-text("Écriture de")) button:has-text("Soignée")');
  await p.waitForTimeout(800);
  await p.screenshot({ path: dossier + '/e6-reponse.png', fullPage: true });
  await envoyerReponse.click();
  await p.waitForURL('**/mj/a-traiter');
  await p.waitForSelector('text=Réponse en route');
  route = await enRoute();
  const reponse = route.en_route.find((x) => x.auteur_nom === 'L\'évêque de Clairval');
  ok('réponse du PNJ : en route vers l\'auteur, signée, dans l\'écriture choisie, sans sceau', reponse && reponse.destinataire_nom === 'Bertrand Lenoir' && reponse.signature === 'L\'évêque de Clairval' && reponse.police === 'marck-script' && reponse.sceau === null);
  const eveque = (await (await api.get(base + '/api/mj/personnages')).json()).find((x) => x.nom === 'L\'évêque de Clairval');
  ok('l\'écriture choisie reste celle du PNJ', eveque && eveque.genre === 'pnj' && eveque.ecriture_id !== null);
  ok('la lettre d\'origine est remise au PNJ : arrivée et lue aussitôt', sql(`select count(*) from exemplaires where pli_id = '${pliId(3)}' and destinataire_id = '${eveque.id}' and livraison_le <= now() and ouvert_le is not null`) === '1');
  ok('elle a quitté la file', !(await file()).lettres.some((l) => l.id === pliId(3)));

  // 5. Lettre à un PNJ : rediriger vers un joueur, copier pour un tiers, changer la date
  await carte('Alix de Montfort à Dame Inconnue').locator('a:text-is("Répondre")').click();
  await p.waitForSelector('h2:has-text("Réponse de Dame Inconnue")');
  await choisir(p, '[aria-label="Destinataire"]', 'Bertrand Lenoir');
  await p.waitForSelector('text=Redirigée');
  ok('redirigée vers un joueur : Livrer, Retenir, Perdre, et plus de réponse de PNJ', await p.locator('h2:has-text("Réponse de")').count() === 0 && await p.locator('button:text-is("Livrer")').count() === 1 && await p.locator('button:text-is("Retenir")').count() === 1 && await p.locator('button:text-is("Perdre")').count() === 1);
  await choisir(p, '[aria-label="Ajouter une copie"]', 'Clémence Hardy');
  await p.waitForSelector('[aria-label="Retirer cette copie"]');
  const choisie = '2030-01-15T08:30';
  await p.fill('#livraison', choisie);
  await p.waitForTimeout(500);
  await p.screenshot({ path: dossier + '/e6-traitement.png', fullPage: true });
  await p.click('button:text-is("Livrer")');
  await p.waitForURL('**/mj/a-traiter');
  route = await enRoute();
  const ex2 = route.en_route.filter((x) => x.pli_id === pliId(2));
  ok('redirection vers Bertrand et copie pour Clémence, à la date choisie', ex2.length === 2 && ex2.some((x) => x.origine === 'redirection' && x.destinataire_nom === 'Bertrand Lenoir') && ex2.some((x) => x.origine === 'copie' && x.destinataire_nom === 'Clémence Hardy') && ex2.every((x) => new Date(x.livraison_le).getTime() === new Date(choisie).getTime()));
  ok('une lettre anonyme reste anonyme : ni signature ni sceau', ex2.every((x) => x.signature === null && x.sceau === null));

  // 6. Lettre à un PNJ : classer sans réponse
  await carte('Bertrand Lenoir à Le Chancelier').locator('button:text-is("Classer sans réponse")').click();
  await p.click('[role=dialog] button:text-is("Classer")');
  await p.waitForSelector('text=Lettre classée');
  ok('classée sans réponse : remise au PNJ, hors de la file, rien en route', sql(`select count(*) from exemplaires where pli_id = '${pliId(7)}' and destinataire_id = '${CHANCELIER}' and ouvert_le is not null`) === '1' && !(await file()).lettres.some((l) => l.id === pliId(7)) && !(await enRoute()).en_route.some((x) => x.pli_id === pliId(7)));

  // 7. Gazette : écarter, reprendre, remettre à quelqu'un
  await carte('Alix de Montfort à la gazette').locator('button:text-is("Écarter")').click();
  await p.waitForSelector('h2:text-is("Écartées")');
  ok('lettre à la gazette écartée', (await file()).ecartees.some((l) => l.id === pliId(4)));
  await p.waitForTimeout(500);
  await p.screenshot({ path: dossier + '/e6-file-apres.png', fullPage: true });
  await carte('Alix de Montfort à la gazette').locator('button:text-is("Remettre dans la file")').click();
  await p.waitForSelector('h2:text-is("Écartées")', { state: 'detached' });
  ok('lettre écartée remise dans la file', (await file()).lettres.some((l) => l.id === pliId(4)));
  await carte('Bertrand Lenoir à la gazette').locator('a:text-is("Ouvrir")').click();
  await p.waitForSelector('text=Cette lettre est pour la gazette');
  await choisir(p, '[aria-label="Destinataire"]', 'Alix de Montfort');
  await p.click('button:text-is("Retenir")');
  await p.waitForURL('**/mj/a-traiter');
  route = await enRoute();
  ok('lettre à la gazette interceptée : retenue, pour Alix', route.retenus.some((x) => x.pli_id === pliId(6) && x.origine === 'redirection' && x.destinataire_nom === 'Alix de Montfort'));
  ok('une lettre déjà traitée ne se traite pas deux fois', (await api.post(`${base}/api/mj/a-traiter/${pliId(1)}/traitement`, { data: { destinataire_id: null, decision: 'livrer', livraison_le: null, copies: [], reponse: null } })).status() === 404);
  ok('une lettre déjà traitée ne s\'écarte pas', (await api.post(`${base}/api/mj/a-traiter/${pliId(1)}/ecart`, { data: {} })).status() === 400);

  // 8. En route : retenir, perdre, remettre en route, rediriger, copier
  await p.click('a[href="/mj/en-route"]');
  await p.waitForSelector('h2:text-is("Retenus")');
  await p.waitForTimeout(800);
  await p.screenshot({ path: dossier + '/e6-en-route.png', fullPage: true });
  const ligne = (extrait) => p.locator(`li:has-text("${extrait}")`);
  const modifier = async (extrait, geste) => {
    await ligne(extrait).first().locator('button:text-is("Modifier")').click();
    await p.waitForSelector('[role=dialog]');
    await geste();
    await p.click('[role=dialog] button:text-is("Enregistrer")');
    await p.waitForSelector('[role=dialog]', { state: 'detached' });
    await p.waitForTimeout(300);
    return enRoute();
  };
  route = await modifier('les comptes du duché', () => p.click('[role=dialog] button:text-is("Retenu")'));
  ok('en route : pli retenu', route.retenus.some((x) => x.pli_id === pliId(1)) && !route.en_route.some((x) => x.pli_id === pliId(1)));
  route = await modifier('les comptes du duché', () => p.click('[role=dialog] button:text-is("Perdu")'));
  ok('pli retenu, puis perdu', route.perdus.some((x) => x.pli_id === pliId(1)));
  route = await modifier('les comptes du duché', async () => {
    await p.click('[role=dialog] button:text-is("En route")');
    await p.fill('#exemplaire-date', '2030-02-01T10:00');
    await choisir(p, '#exemplaire-destinataire', 'Clémence Hardy');
  });
  const ex1b = route.en_route.find((x) => x.pli_id === pliId(1));
  ok('pli perdu retrouvé : remis en route, redirigé vers Clémence, à une nouvelle date', ex1b && ex1b.destinataire_nom === 'Clémence Hardy' && ex1b.origine === 'redirection' && new Date(ex1b.livraison_le).getTime() === new Date('2030-02-01T10:00').getTime());

  await ligne('Jeudi, à la chapelle').first().locator('button:text-is("Modifier")').click();
  await choisir(p, '#exemplaire-copie', 'Clémence Hardy');
  await p.click('[role=dialog] button:text-is("Envoyer une copie")');
  await p.waitForSelector('text=Copie en route vers Clémence Hardy');
  await p.waitForTimeout(500);
  await p.screenshot({ path: dossier + '/e6-modifier.png' });
  await p.keyboard.press('Escape');
  await p.waitForSelector('[role=dialog]', { state: 'detached' });
  route = await enRoute();
  const ex5b = route.en_route.find((x) => x.pli_id === pliId(5) && x.origine === 'destinataire');
  ok('copie pour un tiers depuis En route', route.en_route.filter((x) => x.pli_id === pliId(5)).length === 2 && route.en_route.some((x) => x.pli_id === pliId(5) && x.origine === 'copie' && x.destinataire_nom === 'Clémence Hardy'));
  ok('pas deux exemplaires du même pli pour le même personnage', (await api.post(`${base}/api/mj/exemplaires/${ex5b.id}/copie`, { data: { destinataire_id: ALIX, livraison_le: null } })).status() === 400);

  ok('ni par redirection', (await api.put(`${base}/api/mj/exemplaires/${ex5b.id}`, { data: { destinataire_id: perso(4), acheminement: 'en_route', livraison_le: null } })).status() === 400);

  // 9. La livraison : une date passée vaut « arrivé », et un pli arrivé ne se modifie plus
  const avancer = () => api.put(`${base}/api/mj/exemplaires/${ex5b.id}`, { data: { destinataire_id: ALIX, acheminement: 'en_route', livraison_le: '2020-01-01T00:00:00Z' } });
  ok('date avancée dans le passé : le pli arrive aussitôt', (await avancer()).status() === 204 && !(await enRoute()).en_route.some((x) => x.id === ex5b.id));
  ok('un pli arrivé ne se modifie plus', (await avancer()).status() === 400);
  ok('un pli arrivé ne se copie plus', (await api.post(`${base}/api/mj/exemplaires/${ex5b.id}/copie`, { data: { destinataire_id: BERTRAND, livraison_le: null } })).status() === 400);
  ok('porte des joueurs : Alix ne reçoit que le pli arrivé, pas le pli retenu', sql(`select count(*) from plis_recus where destinataire_id = '${ALIX}'`) === '1');
  ok('porte des joueurs : rien pour Bertrand tant que ses plis sont en route', sql(`select count(*) from plis_recus where destinataire_id = '${BERTRAND}'`) === '0');

  // 10. Écrire au nom d'un PNJ
  await p.click('a[href="/mj/ecrire"]');
  await p.waitForSelector('h1:has-text("Écrire au nom")');
  await choisir(p, '#auteur', 'Le Chancelier');
  await choisir(p, '#destinataire', 'Alix de Montfort');
  await p.waitForSelector('textarea');
  ok('PNJ qui a déjà une écriture : aucun choix d\'écriture', await p.locator('legend:has-text("Écriture de")').count() === 0);
  await p.locator('textarea').fill('Madame la Trésorière,\nvous êtes attendue au conseil, demain à l\'aube.');
  await p.click('button:has-text("Chancellerie du Duché")');
  await p.waitForTimeout(800);
  await p.screenshot({ path: dossier + '/e6-ecrire.png', fullPage: true });
  await p.click('button:text-is("Envoyer")');
  await p.waitForURL('**/mj/en-route');
  await p.waitForSelector('text=Le pli est en route');
  route = await enRoute();
  const duChancelier = route.en_route.find((x) => x.auteur_nom === 'Le Chancelier');
  const heures = duChancelier ? (new Date(duChancelier.livraison_le) - Date.now()) / 3600000 : -1;
  ok('lettre du Chancelier : en route, délai habituel de 24 h ± 4 h (' + heures.toFixed(1) + ' h)', heures >= 19.9 && heures <= 28.1);
  ok('signée, scellée et de sa main', duChancelier && duChancelier.signature === 'Le Chancelier' && duChancelier.sceau.initiales === 'CD' && duChancelier.police === 'parisienne');
  ok('elle ne passe pas par la file', !(await file()).lettres.some((l) => l.auteur_nom === 'Le Chancelier'));
  ok('écrire au nom d\'un joueur : refusé', (await api.post(base + '/api/mj/lettres', { data: { auteur_id: ALIX, destinataire_id: BERTRAND, billet: billet() } })).status() === 400);
  ok('sceller avec un sceau que le PNJ ne détient pas : refusé', (await api.post(base + '/api/mj/lettres', { data: { auteur_id: CHANCELIER, destinataire_id: ALIX, billet: billet({ sceau_id: SCEAU_B }) } })).status() === 400);
  ok('PNJ sans écriture et sans choix : refusé', (await api.post(base + '/api/mj/lettres', { data: { auteur_id: perso(3), destinataire_id: ALIX, billet: billet() } })).status() === 400);
  ok('les lettres du MJ ne comptent dans aucun quota', sql(`select count(*) from plis where redige_par_mj and etat = 'traite'`) === '2');

  // 11. Téléphone
  const tel = await ctx.newPage();
  await tel.setViewportSize({ width: 390, height: 780 });
  const debordements = [];
  const photo = async (chemin, attente, nom) => {
    await tel.goto(base + chemin);
    await tel.waitForSelector(attente);
    await tel.waitForTimeout(700);
    await tel.screenshot({ path: `${dossier}/e6-tel-${nom}.png`, fullPage: true });
    if (await tel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) debordements.push(nom);
  };
  await photo('/mj/a-traiter', 'h3', 'file');
  await photo(`/mj/a-traiter/${pliId(4)}`, 'text=Cette lettre est pour la gazette', 'traitement');
  await photo('/mj/en-route', 'h3', 'en-route');
  await photo('/mj/ecrire', 'h1', 'ecrire');
  await tel.click('[data-sidebar=trigger]');
  await tel.waitForSelector('a[href="/mj/en-route"]');
  await tel.waitForTimeout(400);
  await tel.screenshot({ path: dossier + '/e6-tel-menu.png' });
  ok('téléphone : pas de défilement horizontal' + (debordements.length ? ' (' + debordements.join(', ') + ')' : ''), debordements.length === 0);

  // 12. Un joueur n'entre pas par la porte du MJ
  const autre = await b.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1 });
  const j = await autre.newPage();
  await connecter(j, 'bertrand@exemple.fr');
  await j.waitForURL('**/reception');
  const statuts = [
    (await j.request.get(base + '/api/mj/a-traiter')).status(),
    (await j.request.get(base + '/api/mj/en-route')).status(),
    (await j.request.post(`${base}/api/mj/a-traiter/${pliId(4)}/traitement`, { data: { destinataire_id: BERTRAND, decision: 'livrer', livraison_le: null, copies: [], reponse: null } })).status(),
    (await j.request.post(`${base}/api/mj/a-traiter/${pliId(4)}/ecart`, { data: {} })).status(),
    (await j.request.put(`${base}/api/mj/exemplaires/${ex1b.id}`, { data: { destinataire_id: BERTRAND, acheminement: 'en_route', livraison_le: '2020-01-01T00:00:00Z' } })).status(),
    (await j.request.post(`${base}/api/mj/exemplaires/${ex1b.id}/copie`, { data: { destinataire_id: BERTRAND, livraison_le: null } })).status(),
    (await j.request.post(base + '/api/mj/lettres', { data: { auteur_id: CHANCELIER, destinataire_id: BERTRAND, billet: billet() } })).status(),
  ];
  ok('joueur connecté : file, plis en route et plume du MJ fermés (' + statuts.join(', ') + ')', statuts.every((s) => s === 403));
  ok('aucune erreur de page' + (erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''), erreurs.length === 0);
  await b.close();
})().catch((e) => { console.log('ECHEC', e.message.split('\n').slice(0, 5).join(' / ')); process.exit(1); });
