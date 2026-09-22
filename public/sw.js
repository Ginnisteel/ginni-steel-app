// public/sw.js
// A minimal service worker — its only job is to exist, so Android's
// browser recognizes this site as installable. It doesn't cache
// anything, so the app always loads fresh data over the network.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Pass every request straight through to the network.
  event.respondWith(fetch(event.request));
});
