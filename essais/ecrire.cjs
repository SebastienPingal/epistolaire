const { chromium } = require('playwright');
const fs = require('fs');
const [dossier, journal] = process.argv.slice(2);
const dernier = (re) => { const m = [...fs.readFileSync(journal, 'utf8').matchAll(re)]; return m.length ? m[m.length - 1][1] : null; };
const ok = (nom, cond = true) => console.log((cond ? 'OK   ' : 'ECHEC') + ' ' + nom);
const base = 'http://localhost:5173';
const BERTRAND = '00000000-0000-0000-0000-0000000000a2', DAME = '00000000-0000-0000-0000-0000000000a3', SCEAU_B = '00000000-0000-0000-0000-0000000000c2';

(async () => {
  const b = await chromium.launch();
  const ouvrir = async (adresse, viewport) => {
    const ctx = await b.newContext({ viewport, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const erreurs = [];
    p.on('pageerror', (e) => erreurs.push(e.message));
    await p.goto(base);
    await p.fill('#email', adresse);
    await p.click('button[type=submit]');
    await p.waitForSelector('text=Code à 6 chiffres');
    await p.waitForTimeout(400);
    await p.locator('input[autocomplete="one-time-code"]').pressSequentially(dernier(/saisissez ce code : (\d{6})/g));
    await p.waitForURL('**/reception');
    return { p, erreurs };
  };
  const { p, erreurs } = await ouvrir('alix@exemple.fr', { width: 390, height: 800 });
  const api = p.request;
  await p.waitForSelector('text=Aucun pli ne vous attend');
  ok('joueur connecté : arrive sur la Réception, vide');

  await p.click('nav a:has-text("Écrire")');
  await p.waitForSelector('text=Il vous reste 3 lettres');
  ok('écritoire : compteur « 3 lettres », aucun brouillon', await p.locator('text=Rien en cours').count() === 1);

  // Brouillon, sauvegarde automatique
  await p.click('text=Nouveau billet');
  await p.waitForURL('**/ecrire/*-*');
  const id1 = p.url().split('/').pop();
  const zone = p.locator('textarea');
  await zone.fill('Cher Bertrand,\nles comptes du duché ne tombent pas juste. Retrouvez-moi à la chapelle.');
  await p.waitForSelector('text=Choisissez à qui vous écrivez');
  ok('sans destinataire : envoi bloqué', await p.locator('button:text-is("Envoyer")').isDisabled());
  await p.waitForTimeout(1500);
  await p.reload();
  await p.waitForSelector('textarea');
  ok('sauvegarde automatique : texte retrouvé après rechargement', (await zone.inputValue()).startsWith('Cher Bertrand'));

  // Destinataire, signature, sceau
  await p.click('text=Choisir un destinataire');
  await p.waitForSelector('[role=dialog] >> text=intendant');
  await p.screenshot({ path: dossier + '/e5-destinataire.png' });
  await p.click('[role=dialog] button:has-text("Bertrand Lenoir")');
  await p.click('label:has-text("Signer")');
  await p.waitForSelector('[data-slot=switch][data-checked]');
  await p.click('button:has-text("Alix de Montfort"):has(svg)');
  await p.waitForSelector('text=Brouillon enregistré');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: dossier + '/e5-billet.png', fullPage: true });
  ok('destinataire, signature et sceau choisis', !(await p.locator('button:text-is("Envoyer")').isDisabled()));

  // Débordement
  const court = await zone.inputValue();
  await zone.fill('x'.repeat(501));
  await p.waitForSelector('text=Votre billet déborde');
  ok('501 caractères : la jauge déborde, envoi bloqué', await p.locator('button:text-is("Envoyer")').isDisabled() && await p.locator('[role=meter] > div.bg-destructive').count() === 1);
  await p.screenshot({ path: dossier + '/e5-deborde.png' });
  await zone.fill('é'.repeat(500));
  await p.waitForTimeout(300);
  ok('500 caractères accentués : ça passe', !(await p.locator('button:text-is("Envoyer")').isDisabled()));
  ok('aucun chiffre affiché à l\'écran', !/\b(500|501|\d+ ?\/ ?\d+|caract)/i.test(await p.locator('main').innerText()));
  await zone.fill(court);
  await p.waitForTimeout(1200);

  // Envoi
  await p.click('button:text-is("Envoyer")');
  await p.waitForSelector('[role=dialog] >> text=vous n’en gardez aucune copie');
  await p.screenshot({ path: dossier + '/e5-confirmation.png' });
  await p.click('[role=dialog] button:text-is("Envoyer")');
  await p.waitForSelector('text=Votre pli est parti');
  await p.screenshot({ path: dossier + '/e5-parti.png' });
  await p.click('text=Revenir à l’écritoire');
  await p.waitForSelector('text=Il vous reste 2 lettres');
  ok('envoi : pli parti, compteur à 2, plus aucun brouillon', await p.locator('text=Rien en cours').count() === 1);
  ok('aucune copie : la lettre envoyée est introuvable pour son auteur', (await api.get(`${base}/api/joueur/brouillons/${id1}`)).status() === 404);
  ok('une lettre envoyée ne se modifie plus', (await api.put(`${base}/api/joueur/brouillons/${id1}`, { data: { texte: 'autre', destinataire: null, sceau_id: null, signe: false } })).status() === 404);
  ok('une lettre envoyée ne se renvoie pas', (await api.post(`${base}/api/joueur/brouillons/${id1}/envoi`, { data: {} })).status() === 404);

  // Gazette, puis autre destinataire
  const ecrire = async (texte, choisir) => {
    await p.goto(base + '/ecrire');
    await p.click('text=Nouveau billet');
    await p.waitForURL('**/ecrire/*-*');
    await p.locator('textarea').fill(texte);
    await p.click('text=Choisir un destinataire');
    await choisir();
    await p.waitForTimeout(1200);
  };
  await ecrire('Avis aux lecteurs : on cherche un scribe.', () => p.click('[role=dialog] button:text-is("La gazette")'));
  await p.goto(base + '/ecrire');
  await p.waitForSelector('text=À la gazette');
  await p.screenshot({ path: dossier + '/e5-ecritoire.png' });
  ok('écritoire : le brouillon pour la gazette apparaît dans la liste');
  await p.click('a:has-text("À la gazette")');
  await p.waitForSelector('textarea');
  await p.click('button:text-is("Envoyer")'); await p.click('[role=dialog] button:text-is("Envoyer")');
  await p.waitForSelector('text=Votre pli est parti');
  await ecrire('Monseigneur, une affaire urgente.', async () => { await p.fill('#autre-destinataire', 'L\'évêque de Clairval'); await p.click('[role=dialog] button:text-is("Choisir")'); });
  ok('autre destinataire : adresse libre retenue', await p.locator('button:has-text("L\'évêque de Clairval")').count() === 1);
  await p.click('button:text-is("Envoyer")'); await p.click('[role=dialog] button:text-is("Envoyer")');
  await p.waitForSelector('text=Votre pli est parti');

  // Quota épuisé
  await ecrire('Une quatrième lettre.', () => p.click('[role=dialog] button:text-is("La gazette")'));
  await p.waitForSelector('text=Vous avez envoyé toutes vos lettres de la semaine');
  const id4 = p.url().split('/').pop();
  ok('quota épuisé : envoi bloqué à l\'écran', await p.locator('button:text-is("Envoyer")').isDisabled());
  ok('quota épuisé : envoi refusé par le serveur aussi', (await api.post(`${base}/api/joueur/brouillons/${id4}/envoi`, { data: {} })).status() === 400);

  // Destinataire hors carnet, sceau d'un autre
  ok('écrire à un personnage hors de son carnet : refusé', (await api.put(`${base}/api/joueur/brouillons/${id4}`, { data: { texte: 't', destinataire: { genre: 'personnage', id: DAME }, sceau_id: null, signe: false } })).status() === 400);
  await api.put(`${base}/api/joueur/brouillons/${id4}`, { data: { texte: 't', destinataire: { genre: 'gazette' }, sceau_id: SCEAU_B, signe: false } });
  ok('sceller avec le sceau d\'un autre : le sceau est ignoré', (await (await api.get(`${base}/api/joueur/brouillons/${id4}`)).json()).sceau_id === null);

  // Jeter
  await p.reload(); await p.waitForSelector('textarea');
  await p.click('button:text-is("Jeter")'); await p.click('[role=dialog] button:text-is("Jeter")');
  await p.waitForURL('**/ecrire');
  await p.waitForSelector('text=Rien en cours');
  ok('jeter un brouillon');

  // Fiche
  await p.click('nav a:has-text("Personnage")');
  await p.waitForSelector('text=Trésorière du duché');
  await p.waitForTimeout(600);
  await p.screenshot({ path: dossier + '/e5-fiche.png', fullPage: true });
  const fiche = JSON.stringify(await (await api.get(base + '/api/joueur/fiche')).json());
  ok('fiche : visible, sans les notes du MJ', !fiche.includes('SECRET') && !fiche.includes('notes'));
  ok('un joueur n\'entre pas par la porte du MJ', (await api.get(base + '/api/mj/personnages')).status() === 403);

  // Un autre joueur ne voit pas les brouillons d'Alix
  await ecrire('Brouillon privé d\'Alix.', () => p.click('[role=dialog] button:text-is("La gazette")'));
  const idPrive = p.url().split('/').pop();
  const autre = await ouvrir('bertrand@exemple.fr', { width: 1100, height: 800 });
  ok('Bertrand ne lit pas le brouillon d\'Alix', (await autre.p.request.get(`${base}/api/joueur/brouillons/${idPrive}`)).status() === 404);
  ok('Bertrand ne peut ni le modifier ni l\'envoyer', (await autre.p.request.put(`${base}/api/joueur/brouillons/${idPrive}`, { data: { texte: 'x', destinataire: null, sceau_id: null, signe: false } })).status() === 404 && (await autre.p.request.post(`${base}/api/joueur/brouillons/${idPrive}/envoi`, { data: {} })).status() === 404);
  await autre.p.goto(base + '/ecrire');
  await autre.p.waitForSelector('text=Il vous reste 3 lettres');
  ok('le quota d\'Alix n\'entame pas celui de Bertrand');
  await autre.p.click('text=Nouveau billet');
  await autre.p.waitForURL('**/ecrire/*-*');
  await autre.p.locator('textarea').fill('Sur ordinateur, la même feuille.');
  await autre.p.waitForTimeout(800);
  await autre.p.screenshot({ path: dossier + '/e5-ordi.png' });
  ok('aucune erreur de page', erreurs.length + autre.erreurs.length === 0);
  if (erreurs.length) console.log(erreurs.slice(0, 3));
  await b.close();
})().catch((e) => { console.log('ECHEC', e.message.split('\n').slice(0, 5).join(' / ')); process.exit(1); });
