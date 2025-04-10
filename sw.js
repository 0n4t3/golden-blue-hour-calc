// sw.js

const CACHE_NAME = 'golden-blue-hour-cache-v1'; // Increment version if assets change

// List of essential files to cache during installation
const URLS_TO_CACHE = [
    '/', // Cache the root URL (often serves index.html)
    'index.html', // Explicitly cache index.html as a fallback
    'manifest.json',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/suncalc@1.8.0/suncalc.min.js',
    'https://cdn.jsdelivr.net/npm/lucide-static@latest/font/Lucide.ttf',
    'https://webfonts.fontsquirrel.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap'
    // Note: The actual Open Sans font files (.woff2, etc.) requested by the CSS above
    // will be cached dynamically by the 'fetch' event handler when first requested online.
];

// --- Installation ---
// Cache core assets when the service worker is installed.
self.addEventListener('install', event => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Caching app shell');
                // Add all essential URLs to the cache
                return cache.addAll(URLS_TO_CACHE);
            })
            .then(() => {
                console.log('[Service Worker] Installation complete, resources cached.');
                // Force the waiting service worker to become the active service worker.
                // Useful for development and ensures updates are applied faster.
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('[Service Worker] Cache addAll failed:', error);
            })
    );
});

// --- Activation ---
// Clean up old caches when the service worker is activated.
self.addEventListener('activate', event => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // If the cache name is different from the current one, delete it
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[Service Worker] Activation complete, old caches removed.');
            // Take control of uncontrolled clients (tabs) immediately.
            return self.clients.claim();
        })
    );
});

// --- Fetch ---
// Intercept network requests and serve from cache if available (Cache First).
self.addEventListener('fetch', event => {
    // console.log('[Service Worker] Fetching:', event.request.url);

    // Use respondWith() to hijack the request and provide a response
    event.respondWith(
        // 1. Check if the request matches anything in the cache
        caches.match(event.request)
            .then(cachedResponse => {
                // 2. If a cached response is found, return it
                if (cachedResponse) {
                    // console.log('[Service Worker] Serving from cache:', event.request.url);
                    return cachedResponse;
                }

                // 3. If not in cache, fetch from the network
                // console.log('[Service Worker] Fetching from network:', event.request.url);
                return fetch(event.request)
                    .then(networkResponse => {
                        // 4. Check if we received a valid response from the network
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && !networkResponse.type === 'opaque') {
                            // Don't cache invalid or opaque responses (like from CDNs without CORS sometimes) unless necessary
                            // For CDNs like tailwind/suncalc/fonts, opaque is expected and okay to cache.
                            // Let's refine this slightly: cache successful responses and opaque ones (often from CDNs)
                            if (!networkResponse || networkResponse.status !== 200 && networkResponse.type !== 'opaque') {
                                return networkResponse; // Return the error response as is
                            }
                        }

                        // 5. Clone the response: a response is a stream and can only be consumed once.
                        // We need one copy for the browser and one for the cache.
                        const responseToCache = networkResponse.clone();

                        // 6. Open the cache and store the fetched response
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                // console.log('[Service Worker] Caching new resource:', event.request.url);
                                cache.put(event.request, responseToCache);
                            });

                        // 7. Return the original network response to the browser
                        return networkResponse;
                    })
                    .catch(error => {
                        // Handle network errors (e.g., offline and not in cache)
                        console.error('[Service Worker] Fetch failed; returning offline fallback if applicable.', error);
                        // Optionally, you could return a custom offline fallback page/resource here:
                        // if (event.request.mode === 'navigate') { // Only for page navigations
                        //   return caches.match('/offline.html');
                        // }
                        // For this app, just letting the fetch fail might be okay,
                        // as the core functionality relies on cached JS/CSS.
                        // Geolocation itself might fail offline anyway.
                    });
            })
    );
});
