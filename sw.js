// sw.js

const CACHE_NAME = 'domux-ai-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  // Aggiungi qui altri asset statici che vuoi mettere in cache, se necessario
];

// Evento di installazione: apre la cache e aggiunge gli asset principali
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aperta');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento di attivazione: pulisce le vecchie cache non più necessarie
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Evento fetch: intercetta le richieste di rete
self.addEventListener('fetch', event => {
  // Ignora le richieste che non sono GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Per le richieste API (es. a Firebase), vai sempre alla rete.
  // Questo previene la cache di dati dinamici.
  if (event.request.url.includes('firestore.googleapis.com') || event.request.url.includes('firebaseapp.com')) {
     event.respondWith(fetch(event.request));
     return;
  }
  
  // Per tutti gli altri asset, usa una strategia "cache-first"
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Se la risorsa è in cache, restituiscila
        if (cachedResponse) {
          return cachedResponse;
        }

        // Altrimenti, recuperala dalla rete
        return fetch(event.request).then(
          networkResponse => {
            // Se la risposta è valida, mettila in cache per le prossime volte
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          }
        );
      })
  );
});
