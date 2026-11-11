const { chromium } = require('playwright');
const fs = require('fs');
const [dossier, journal] = process.argv.slice(2);
const lire = () => fs.readFileSync(journal, 'utf8');
const dernier = (re) => { const m = [...lire().matchAll(re)]; return m.length ? m[m.length - 1][1] : null; };
const nbMails = () => (lire().match(/e-mail non envoyé/g) || []).length;
const ok = (nom, cond) => console.log((cond ? 'OK   ' : 'ECHEC') + ' ' + nom);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const base = 'http://localhost:5173';
  const saisirAdresse = async (adresse) => { await p.fill('#email', adresse); await p.click('button[type=submit]'); await p.waitForSelector('text=Code à 6 chiffres'); };
  const saisirCode = async (code) => { await p.locator('input[autocomplete="one-time-code"]').pressSequentially(code); };

  await p.goto(base);
  await p.waitForSelector('#email');
  ok('sans session : écran de connexion', true);
  await p.screenshot({ path: dossier + '/connexion-1-adresse.png' });

  // 1. Adresse inconnue : même écran, aucun e-mail.
  let avant = nbMails();
  await saisirAdresse('inconnu@exemple.fr');
  await p.waitForTimeout(500);
  ok('adresse inconnue : même réponse, aucun e-mail', nbMails() === avant);
  await p.click('text=Utiliser une autre adresse');

  // 2. MJ : e-mail, code faux, bon code.
  await saisirAdresse('MJ@Exemple.fr ');
  await p.waitForTimeout(500);
  ok('adresse du MJ : un e-mail part', nbMails() === avant + 1);
  await p.screenshot({ path: dossier + '/connexion-2-code.png' });
  const code = dernier(/saisissez ce code : (\d{6})/g);
  const faux = code === '000000' ? '111111' : '000000';
  await saisirCode(faux);
  await p.waitForSelector('[role=alert]');
  ok('code faux : refusé (' + (await p.textContent('[role=alert]')).trim() + ')', true);
  await saisirCode(code);
  await p.waitForURL('**/mj/a-traiter');
  await p.waitForSelector('h1:text-is("À traiter")');
  ok('bon code : connecté en MJ, sur la file À traiter', true);
  await p.screenshot({ path: dossier + '/connexion-3-accueil.png' });
  const cookies = await ctx.cookies();
  const c = cookies.find((x) => x.name === 'session');
  ok('cookie illisible par la page (HttpOnly) : ' + (c && c.httpOnly), c && c.httpOnly);
  ok('code déjà utilisé : refusé', (await p.request.post(base + '/api/connexion/code', { data: { email: 'mj@exemple.fr', code } })).status() === 400);

  // 3. Rechargement, puis déconnexion.
  await p.reload();
  await p.waitForURL('**/mj/a-traiter');
  await p.waitForSelector('h1:text-is("À traiter")');
  ok('rechargement : toujours connecté', true);
  // Sur téléphone, le menu du MJ est replié : on l'ouvre pour atteindre la déconnexion.
  await p.click('[data-sidebar=trigger]');
  await p.click('text=Se déconnecter');
  await p.waitForSelector('#email');
  ok('déconnexion : retour à la connexion', (await p.request.get(base + '/api/moi')).status() === 401);

  // 4. Joueur, par le lien.
  await saisirAdresse('alix@exemple.fr');
  await p.waitForTimeout(500);
  const lien = dernier(/(http:\/\/localhost:5173\/connexion\?jeton=\S+)/g);
  ok('le lien pointe vers le site', !!lien);
  await p.goto(lien);
  await p.waitForURL('**/reception');
  await p.click('nav a:has-text("Personnage")');
  await p.waitForSelector('h1:has-text("Alix")');
  ok('lien : connecté en joueur, personnage Alix', true);
  ok('le jeton a quitté la barre d\'adresse : ' + p.url(), !p.url().includes('jeton'));
  await p.click('text=Se déconnecter');
  await p.waitForSelector('#email');
  await p.goto(lien);
  await p.waitForSelector('[role=alert]');
  ok('lien réutilisé : refusé (' + (await p.textContent('[role=alert]')).trim() + ')', true);

  // 5. Cinq codes faux épuisent la demande.
  await saisirAdresse('alix@exemple.fr');
  await p.waitForTimeout(500);
  const bon = dernier(/saisissez ce code : (\d{6})/g);
  for (let i = 0; i < 5; i++) await p.request.post(base + '/api/connexion/code', { data: { email: 'alix@exemple.fr', code: bon === '999999' ? '888888' : '999999' } });
  ok('après 5 codes faux, le bon code ne passe plus', (await p.request.post(base + '/api/connexion/code', { data: { email: 'alix@exemple.fr', code: bon } })).status() === 400);
  await b.close();
})().catch((e) => { console.log('ECHEC', e.message.split('\n')[0]); process.exit(1); });
