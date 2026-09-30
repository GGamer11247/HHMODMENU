// Local no-op service worker for the HAR-based HammyHome mirror.
// The original sw.js was not present in the supplied HAR, so this intentionally
// does not intercept or rewrite network requests.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
