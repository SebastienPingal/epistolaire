// Tire les icônes du site installé de leur source, web/src/theme/icone.svg.
// À relancer quand l'icône change :   node web/scripts/icones.cjs
// (depuis la racine du repo ; Playwright et son navigateur doivent être installés).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.join(__dirname, '../src/theme/icone.svg'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '');
const cachet = source.match(/<g id="cachet">[\s\S]*?<\/g>/)[0];
const sortie = path.join(__dirname, '../public/icones');

// L'icône « masquable » : Android la découpe en cercle ou en goutte. Le cachet doit tenir
// dans la zone sûre (un cercle de 80 % du côté) : on le réduit.
const masquable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#f6f1e7"/>
  <g transform="translate(256 256) scale(0.78) translate(-256 -256)">${cachet}</g></svg>`;

// La petite icône de la barre d'état d'Android : une silhouette blanche sur fond transparent.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect x="104" y="150" width="304" height="216" rx="20" fill="none" stroke="#fff" stroke-width="36"/>
  <polyline points="112,164 256,276 400,164" fill="none" stroke="#fff" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const icones = [
  ['icone-192.png', source, 192],
  ['icone-512.png', source, 512],
  ['apple-touch-icon.png', source, 180],
  ['icone-masquable-512.png', masquable, 512],
  ['badge-96.png', badge, 96],
];

(async () => {
  fs.mkdirSync(sortie, { recursive: true });
  const navigateur = await chromium.launch();
  for (const [nom, svg, taille] of icones) {
    const page = await navigateur.newPage({ viewport: { width: taille, height: taille }, deviceScaleFactor: 1 });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${taille}px;height:${taille}px}</style>${svg}`,
    );
    await page.screenshot({ path: path.join(sortie, nom), omitBackground: true });
    await page.close();
    console.log(nom);
  }
  await navigateur.close();
})();
