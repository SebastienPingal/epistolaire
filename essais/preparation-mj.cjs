const { chromium } = require('playwright');
const fs = require('fs');
const [dossier, journal] = process.argv.slice(2);
const dernier = (re) => { const m = [...fs.readFileSync(journal, 'utf8').matchAll(re)]; return m.length ? m[m.length - 1][1] : null; };
const ok = (nom, cond = true) => console.log((cond ? 'OK   ' : 'ECHEC') + ' ' + nom);
const base = 'http://localhost:5173';

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const erreursConsole = [];
  p.on('console', (m) => m.type() === 'error' && erreursConsole.push(m.text()));
  p.on('pageerror', (e) => erreursConsole.push('pageerror: ' + e.message));

  const connecter = async (adresse) => {
    await p.goto(base);
    await p.fill('#email', adresse);
    await p.click('button[type=submit]');
    await p.waitForSelector('text=Code à 6 chiffres');
    await p.waitForTimeout(400);
    await p.locator('input[autocomplete="one-time-code"]').pressSequentially(dernier(/saisissez ce code : (\d{6})/g));
  };

  await connecter('mj@exemple.fr');
  await p.waitForURL('**/mj/personnages');
  await p.waitForSelector('text=Aucun joueur');
  ok('MJ connecté : arrive sur Personnages');

  const creer = async (nom, genre, email) => {
    await p.goto(base + '/mj/personnages');
    await p.click('text=Nouveau personnage');
    await p.click(`[role=dialog] button:text-is("${genre}")`);
    await p.fill('#nouveau-nom', nom);
    if (email) await p.fill('#nouveau-email', email);
    await p.click('[role=dialog] button[type=submit]');
    await p.waitForURL('**/mj/personnages/*-*');
    await p.waitForSelector(`h1:text-is("${nom}")`);
  };

  // Joueur 1
  await creer('Alix de Montfort', 'Joueur', 'alix@exemple.fr');
  ok('création d\'un joueur avec adresse');
  ok('son sceau est créé avec les initiales AM', await p.locator('svg[aria-label="Sceau de Alix de Montfort"] text').textContent() === 'AM');
  await p.click('button:has-text("Vive")');
  await p.fill('#role', 'Trésorière du duché');
  await p.fill('#aptitudes', 'Comptes, intrigues de cour.');
  await p.fill('#notes', 'Ne sait pas que Bertrand la surveille.');
  await p.click('button:text-is("Enregistrer")');
  await p.waitForSelector('text=Enregistré');
  await p.reload();
  await p.waitForSelector('#role');
  ok('fiche enregistrée et relue', await p.inputValue('#role') === 'Trésorière du duché' && await p.inputValue('#notes') === 'Ne sait pas que Bertrand la surveille.');
  ok('écriture retenue', await p.locator('button[aria-pressed=true]:has-text("Vive")').count() === 1);
  await p.screenshot({ path: dossier + '/e4-fiche.png', fullPage: true });

  // Joueur 2 : même écriture refusée, même adresse refusée
  await creer('Bertrand Lenoir', 'Joueur', '');
  await p.click('button:has-text("Vive")');
  await p.click('button:text-is("Enregistrer")');
  await p.waitForSelector('[role=alert]');
  ok('même écriture pour deux joueurs : ' + (await p.textContent('[role=alert]')).trim());
  await p.click('button:has-text("Ronde")');
  await p.fill('#email', 'alix@exemple.fr');
  await p.click('button:text-is("Enregistrer")');
  await p.waitForFunction(() => document.querySelector('[role=alert]')?.textContent.includes('adresse'));
  ok('même adresse pour deux joueurs : ' + (await p.textContent('[role=alert]')).trim());
  await p.fill('#email', 'bertrand@exemple.fr');
  await p.click('button:text-is("Enregistrer")');
  await p.waitForSelector('text=Enregistré');
  ok('joueur 2 enregistré avec une autre écriture et une autre adresse');

  // PNJ
  await creer('Chancellerie', 'PNJ', '');
  ok('création d\'un PNJ', await p.locator('#email').count() === 0);

  // Carnet d'Alix
  await p.goto(base + '/mj/personnages');
  await p.click('a:has-text("Alix de Montfort")');
  await p.waitForSelector('text=Le carnet est vide');
  await p.click('[aria-label="Personnage à ajouter"]');
  await p.click('[role=option]:has-text("Bertrand Lenoir")');
  await p.fill('[aria-label="Qualité du nouveau contact"]', 'trésorier');
  await p.click('button:text-is("Ajouter")');
  await p.waitForSelector('[aria-label="Qualité de Bertrand Lenoir"]');
  ok('carnet : contact ajouté avec sa qualité', await p.inputValue('[aria-label="Qualité de Bertrand Lenoir"]') === 'trésorier');
  await p.fill('[aria-label="Qualité de Bertrand Lenoir"]', 'intendant');
  await p.locator('[aria-label="Qualité de Bertrand Lenoir"]').blur();
  await p.waitForTimeout(500);
  await p.reload();
  await p.waitForSelector('[aria-label="Qualité de Bertrand Lenoir"]');
  ok('carnet : qualité modifiée', await p.inputValue('[aria-label="Qualité de Bertrand Lenoir"]') === 'intendant');
  await p.screenshot({ path: dossier + '/e4-fiche-bas.png', fullPage: true });

  // Sceaux : transfert
  await p.goto(base + '/mj/sceaux');
  await p.waitForSelector('[aria-label="Détenteur du sceau Alix de Montfort"]');
  await p.click('[aria-label="Détenteur du sceau Alix de Montfort"]');
  await p.click('[role=option]:has-text("Bertrand Lenoir")');
  await p.waitForTimeout(600);
  await p.goto(base + '/mj/personnages');
  await p.click('a:has-text("Bertrand Lenoir")');
  await p.waitForSelector('svg[aria-label="Sceau de Alix de Montfort"]');
  ok('sceau d\'Alix transféré à Bertrand, nom gravé inchangé');
  await p.goto(base + '/mj/sceaux');
  await p.click('text=Nouveau sceau');
  await p.fill('#sceau-nom', 'Chancellerie du Duché');
  ok('initiales proposées : ' + await p.inputValue('#sceau-initiales'), await p.inputValue('#sceau-initiales') === 'CD');
  await p.click('[role=dialog] button[type=submit]');
  await p.waitForSelector('[aria-label="Détenteur du sceau Chancellerie du Duché"]');
  ok('nouveau sceau sans détenteur');
  await p.screenshot({ path: dossier + '/e4-sceaux.png', fullPage: true });

  // Écritures
  await p.goto(base + '/mj/ecritures');
  await p.waitForSelector('text=Alix de Montfort');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: dossier + '/e4-ecritures.png', fullPage: true });
  ok('écritures : 14 mains, Alix affichée sur la sienne', await p.locator('li:has([aria-label="Nom de l\'écriture"])').count() === 14);

  // Réglages
  await p.goto(base + '/mj/reglages');
  await p.waitForSelector('#delai');
  ok('réglages par défaut : délai ' + await p.inputValue('#delai') + ' h, hasard ' + await p.inputValue('#hasard') + ' h');
  await p.fill('#delai', '36'); await p.fill('#hasard', '48');
  await p.click('button:text-is("Enregistrer")');
  await p.waitForSelector('[role=alert]');
  ok('hasard plus grand que le délai : refusé');
  await p.fill('#hasard', '6');
  await p.click('button:text-is("Enregistrer")');
  await p.waitForSelector('text=Enregistré');
  await p.reload(); await p.waitForSelector('#delai');
  ok('réglages enregistrés et relus', await p.inputValue('#delai') === '36' && await p.inputValue('#hasard') === '6');

  // Suppression du PNJ
  await p.goto(base + '/mj/personnages');
  await p.click('a:has-text("Chancellerie")');
  await p.click('text=Supprimer ce personnage');
  await p.click('[role=dialog] button:text-is("Supprimer")');
  await p.waitForURL('**/mj/personnages');
  await p.waitForSelector('text=Aucun PNJ');
  ok('suppression d\'un PNJ');
  await p.screenshot({ path: dossier + '/e4-personnages.png', fullPage: true });

  // Téléphone
  const tel = await ctx.newPage();
  await tel.setViewportSize({ width: 390, height: 780 });
  await tel.goto(base + '/mj/personnages');
  await tel.waitForSelector('a:has-text("Alix de Montfort")');
  await tel.screenshot({ path: dossier + '/e4-tel-personnages.png' });
  await tel.click('[data-sidebar=trigger]');
  await tel.waitForSelector('a:has-text("Sceaux")');
  await tel.waitForTimeout(400);
  await tel.screenshot({ path: dossier + '/e4-tel-menu.png' });
  await tel.click('a:has-text("Sceaux")');
  await tel.waitForSelector('[aria-label="Détenteur du sceau Alix de Montfort"]');
  await tel.waitForTimeout(400);
  await tel.screenshot({ path: dossier + '/e4-tel-sceaux.png' });
  ok('téléphone : menu et navigation');
  const deborde = await tel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  ok('téléphone : pas de défilement horizontal', !deborde);

  // Un joueur n'entre pas par la porte du MJ
  await p.click('text=Se déconnecter');
  await p.waitForSelector('#email');
  await connecter('alix@exemple.fr');
  await p.waitForURL('**/reception');
  const statuts = [];
  for (const chemin of ['/api/mj/personnages', '/api/mj/sceaux', '/api/mj/reglages', '/api/mj/ecritures']) statuts.push((await p.request.get(base + chemin)).status());
  ok('joueur connecté : porte du MJ fermée (' + statuts.join(', ') + ')', statuts.every((s) => s === 403));
  ok('aucune erreur dans la console du navigateur' + (erreursConsole.length ? ' : ' + erreursConsole.slice(0, 3).join(' | ') : ''), erreursConsole.filter((e) => !e.includes('401') && !e.includes('400') && !e.includes('403')).length === 0);
  await b.close();
})().catch((e) => { console.log('ECHEC', e.message.split('\n').slice(0, 4).join(' / ')); process.exit(1); });
