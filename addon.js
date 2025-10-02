const { addonBuilder } = require("stremio-addon-sdk");

// --- DYNAMISCHE HOST & ICOON URL ---
const host = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000';
const iconUrl = `${host}/icon.png`;

// --- MANIFEST (VERSIE 2.1.1) ---
const manifest = {
    "id": "community.nepflix2.ries",
    "version": "2.1.1",
    "name": "Nepflix 2 (Proxy)",
    "description": "HLS streams van moviesapi.club via een 2-fase proxy",
    "icon": iconUrl,
    "catalogs": [],
    "resources": ["stream"],
    "types": ["movie", "series"],
    "idPrefixes": ["tt"]
};

// --- BROWSERPROFIELEN VOOR REALISTISCHE HEADERS ---
const BROWSER_PROFILES = [
    {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
    },
    {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"'
    }
];

function getRandomBrowserProfile() {
    return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
}

const COMMON_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q-0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Dest': 'iframe',
};

async function getProrcpUrl(type, imdbId, season, episode) {
    const MOVIESAPI_DOMAIN = "cdn.moviesapi.club";
    const apiType = type === 'series' ? 'tv' : 'movie';
    let targetUrl;

    if (apiType === 'tv' && season && episode) {
        targetUrl = `https://${MOVIESAPI_DOMAIN}/embed/${apiType}/${imdbId}?s=${season}&e=${episode}`;
    } else {
        targetUrl = `https://${MOVIESAPI_DOMAIN}/embed/${apiType}/${imdbId}`;
    }

    console.log(`[FASE 1] Requesting Prorcp URL for: ${targetUrl}`);

    const resolverUrl = `${host}/api/resolve`;
    const requestHeaders = { ...COMMON_HEADERS, ...getRandomBrowserProfile() };

    try {
        const response = await fetch(resolverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetUrl: targetUrl,
                sourceDomain: MOVIESAPI_DOMAIN,
                headers: requestHeaders
            })
        });

        if (!response.ok) {
            console.log(`[FASE 1] Resolver failed for ${targetUrl} with status ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (data.prorcpUrl) {
            console.log(`[FASE 1] Success, found Prorcp URL: ${data.prorcpUrl}`);
            return {
                prorcpUrl: data.prorcpUrl,
                filename: data.filename
            };
        }
        return null;
    } catch (error) {
        console.error(`[FASE 1] Error calling resolver for ${MOVIESAPI_DOMAIN}:`, error.message);
        return null;
    }
}

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
    const [imdbId, season, episode] = id.split(':');
    if (!imdbId) return Promise.resolve({ streams: [] });

    const streamSource = await getProrcpUrl(type, imdbId, season, episode);

    if (streamSource && streamSource.prorcpUrl) {
        // WIJZIGING: Gebruik encodeURIComponent voor robuustheid
        const encodedSourceUrl = encodeURIComponent(streamSource.prorcpUrl);
        const proxyUrl = `${host}/api/play?source=${encodedSourceUrl}&imdbid=${id}`;

        const title = streamSource.filename || `MoviesAPI`;
        const stream = {
            url: proxyUrl,
            title: title
        };
        return Promise.resolve({ streams: [stream] });
    }

    return Promise.resolve({ streams: [] });
});

module.exports = builder.getInterface();