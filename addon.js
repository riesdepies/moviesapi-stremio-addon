const { addonBuilder } = require("stremio-addon-sdk");

// --- DYNAMISCHE HOST & ICOON URL ---
const host = process.env.VERCEL_URL || 'http://127.0.0.1:3000';
const iconUrl = host.startsWith('http') ? `${host}/icon.png` : `https://${host}/icon.png`;

// --- MANIFEST (VERSIE 2.0.1) ---
const manifest = {
    "id": "community.nepflix2.ries",
    "version": "2.0.1",
    "name": "Nepflix 2",
    "description": "HLS streams van moviesapi.club",
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
    },
    {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0'
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

async function getMoviesApiStream(type, imdbId, season, episode) {
    const MOVIESAPI_DOMAIN = "cdn.moviesapi.club";
    const apiType = type === 'series' ? 'tv' : 'movie';
    let targetUrl;

    if (apiType === 'tv' && season && episode) {
        // Voor series, gebruik query parameters
        targetUrl = `https://${MOVIESAPI_DOMAIN}/embed/${apiType}/${imdbId}?s=${season}&e=${episode}`;
    } else {
        // Voor films
        targetUrl = `https://${MOVIESAPI_DOMAIN}/embed/${apiType}/${imdbId}`;
    }

    console.log(`[GETSTREAM] Requesting stream from resolver for: ${targetUrl}`);

    const resolverUrl = host.startsWith('http') ? `${host}/api/resolve` : `https://${host}/api/resolve`;
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
            const errorBody = await response.text();
            console.log(`[RESOLVER CLIENT] Resolver failed for ${targetUrl} with status ${response.status}: ${errorBody}`);
            return null;
        }

        const data = await response.json();
        if (data.masterUrl) {
            console.log(`[SUCCESS] Resolver found m3u8 for domain ${MOVIESAPI_DOMAIN}`);
            // Stuur het volledige resultaatobject door, inclusief de bestandsnaam
            return {
                masterUrl: data.masterUrl,
                sourceDomain: data.sourceDomain,
                filename: data.filename
            };
        }
        return null;
    } catch (error) {
        console.error(`[RESOLVER CLIENT] Error calling resolver for ${MOVIESAPI_DOMAIN}:`, error.message);
        return null;
    }
}


const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
    const [imdbId, season, episode] = id.split(':');
    if (!imdbId) return Promise.resolve({ streams: [] });

    const streamSource = await getMoviesApiStream(type, imdbId, season, episode);

    if (streamSource) {
        // Gebruik de gevonden bestandsnaam als titel. Gebruik "MoviesAPI" als fallback.
        const title = streamSource.filename || `MoviesAPI`;
        const stream = {
            url: streamSource.masterUrl,
            title: title
        };
        return Promise.resolve({ streams: [stream] });
    }

    return Promise.resolve({ streams: [] });
});

module.exports = builder.getInterface();
