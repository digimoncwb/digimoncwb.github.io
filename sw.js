const CACHE_VERSION = 'v163';
const CACHE_NAME = `digistats-${CACHE_VERSION}`;

// Cache screens as they are visited, rather than downloading every tool during
// the first visit and competing with the community data and images.
const APP_SHELL_ASSETS = [
    './offline.html',
    './manifest.json',
    './icons/digimon-cwb-app-180.png',
    './icons/digimon-cwb-app-192.png',
    './icons/digimon-cwb-app-512.png',
    './icons/favicon/favicon.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) =>
                Promise.all(APP_SHELL_ASSETS.map((asset) => cache.add(asset).catch(() => null)))
            )
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
                )
            )
    );
    self.clients.claim();
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    const isNavigation = request.mode === 'navigate';
    const isScriptOrStyle = request.destination === 'script' || request.destination === 'style';
    const isStaticAsset =
        request.destination === 'image' ||
        request.destination === 'font' ||
        request.destination === 'manifest';

    if (
        isNavigation ||
        request.destination === 'manifest' ||
        url.pathname.endsWith('/manifest.json')
    ) {
        event.respondWith(networkFirst(request, './offline.html'));
        return;
    }

    if (isScriptOrStyle) {
        // Versioned and content-hashed files are immutable within a release.
        // Unversioned files still check the network to pick up new deployments.
        if (
            url.searchParams.has('v') ||
            /\/(?:assets|mfe\/shared)\/[^/]+-[\w-]{8,}\.(?:m?js|css)$/.test(url.pathname)
        ) {
            event.respondWith(cacheFirst(request));
            return;
        }
        event.respondWith(networkFirst(request));
        return;
    }

    if (isStaticAsset) {
        event.respondWith(cacheFirst(request));
        return;
    }

    event.respondWith(networkFirst(request));
});

async function networkFirst(request, fallbackAsset) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response && response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (fallbackAsset) {
            const fallback = await cache.match(fallbackAsset);
            if (fallback) return fallback;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response && response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
}
