// sw.js — Service Worker para Combustible LVP
// =============================================
// Objetivo: que cuando despliegues una versión nueva en GitHub Pages, el celular
// la reciba SIEMPRE en cuanto haya red — sin que tengas que cerrar la app, borrar
// datos del sitio, ni reinstalar la PWA (que es lo que rompe localStorage).
//
// Estrategia:
//   - Mismo origen + GET → network-first (intenta red; cae al caché si no hay).
//   - Otros orígenes (Google APIs, Gemini, Drive, Chart.js CDN, etc.) → no se tocan.
//   - POST/PUT/DELETE/etc → no se tocan (son llamadas a APIs externas).
//
// Importante: no usamos versioning manual del caché. La estrategia network-first
// hace que el caché se refresque solo en cada visita con red. El nombre del caché
// solo cambia si modifico la lógica del SW y necesito invalidar el viejo.
//
// Patrón heredado de CajaChica-PWA, mismo enfoque (v.0008 de Combustible LVP).

const CACHE = 'lvp-shell-v1';
const SHELL = ['./', './index.html'];

self.addEventListener('install', e => {
  // Activar inmediatamente sin esperar que cierren tabs viejas
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL).catch(err => {
      console.warn('[SW] precache parcial:', err);
    }))
  );
});

self.addEventListener('activate', e => {
  // Tomar control inmediato y limpiar caches de versiones anteriores del SW
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // Solo interceptar GET. POST/PUT van directos a la red (Drive, Gemini).
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  // Solo interceptar mismo origen. Las APIs externas pasan sin tocar.
  if(url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req).then(res => {
      // Solo cachear respuestas OK. Si hay error 4xx/5xx, no contaminar el caché.
      if(res && res.status === 200){
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() =>
      caches.match(req).then(cached =>
        cached || new Response('Sin conexión y sin versión guardada en caché', {
          status: 503, statusText: 'Service Unavailable'
        })
      )
    )
  );
});

// Permitir que la app dispare un purge desde el botón "Forzar actualización"
self.addEventListener('message', e => {
  if(e.data === 'skipWaiting'){
    self.skipWaiting();
  } else if(e.data === 'purgeAndReload'){
    e.waitUntil(
      caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => self.clients.matchAll())
        .then(clients => clients.forEach(c => c.navigate(c.url)))
    );
  }
});
