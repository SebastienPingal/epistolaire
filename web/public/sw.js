// Le service worker du site : il affiche les notifications du navigateur.
//
// Il ne met rien en cache et ne sert aucune page : le site ne fonctionne pas hors connexion.
// Le message reçu a été déchiffré par le navigateur. Il ne dit jamais qui écrit,
// ni ce qui est écrit : seulement un titre, un texte et l'écran à ouvrir.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evenement) => evenement.waitUntil(self.clients.claim()));

self.addEventListener('push', (evenement) => {
  let message = {};
  try {
    message = evenement.data ? evenement.data.json() : {};
  } catch {
    message = {};
  }
  const titre = message.titre || 'Correspondance';
  evenement.waitUntil(
    self.registration.showNotification(titre, {
      body: message.texte || '',
      icon: '/icones/icone-192.png',
      badge: '/icones/badge-96.png',
      // Plusieurs arrivées n'en font qu'une : la nouvelle remplace l'ancienne.
      tag: 'pli',
      renotify: true,
      data: { url: message.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close();
  const url = new URL(evenement.notification.data?.url || '/', self.location.origin).href;
  evenement.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      // Un onglet du site est déjà ouvert : on le ramène, sur le bon écran.
      for (const fenetre of fenetres) {
        if (new URL(fenetre.url).origin === self.location.origin && 'focus' in fenetre) {
          return fenetre.focus().then((f) => (f && 'navigate' in f ? f.navigate(url) : f));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
