// Ce que les parcours partagent.

/**
 * Le premier choix des notifications, proposé à la première connexion de chaque compte.
 * À appeler juste avant de saisir le code (ou d'ouvrir le lien) ; la fonction renvoyée,
 * appelée après, clique « Plus tard » si l'écran est apparu. Les parcours qui ne portent
 * pas sur les notifications passent ainsi leur chemin.
 */
exports.surveillerPremierChoix = (page) => {
  const reponse = page.waitForResponse(
    (r) => /\/api\/(joueur|mj)\/notifications$/.test(new URL(r.url()).pathname) && r.request().method() === 'GET',
    { timeout: 30000 },
  );
  return async () => {
    const lus = await (await reponse).json();
    if (!lus.choisi) {
      await page.click('button:has-text("Plus tard")');
      await page.waitForSelector('button:has-text("Plus tard")', { state: 'detached' });
    }
  };
};
