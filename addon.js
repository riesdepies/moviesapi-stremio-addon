const { addonBuilder } = require("stremio-addon-sdk");

// --- DYNAMISCHE HOST & ICOON URL ---
const host = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000';
const iconUrl = `${host}/icon.png`;

// --- BROWSERPROFIELEN EN HEADERS (ongewijzigd) ---
const BROWSER_PROFILES = [
    { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"', 'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"' },
    { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"', 'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"macOS"' }
];
function getRandomBrowserProfile() { return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)]; }
const COMMON_HEADERS = { 'Accept': 'text/html,application/xhtml+xml,application/xml;q-0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9', 'Accept-Language': 'en-US,en;q=0.9', 'Accept-Encoding': 'gzip, deflate, br', 'Upgrade-Insecure-Requests': '1', 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'iframe' };

// --- SCRAPING FUNCTIES ---

// FASE 1: Vind de /prorcp/ URL
async function getProrcpUrl(type, imdbId, season, episode) {
    const MOVIESAPI_DOMAIN = "cdn.moviesapi.club";
    const apiType = type === 'series' ? 'tv' : 'movie';
    const targetUrl = apiType === 'tv' && season && episode
        ? `https://${MOVIESAPI_DOMAIN}/embed/${apiType}/${imdbId}?s=${season}&e=${episode}`
        : `https://${MOVIESAPI_DOMAIN}/embed/${apiType}/${imdbId}`;

    console.log(`[FASE 1] Requesting Prorcp URL for: ${targetUrl}`);
    const resolverUrl = `${host}/api/resolve`;
    const requestHeaders = { ...COMMON_HEADERS, ...getRandomBrowserProfile() };

    try {
        const response = await fetch(resolverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUrl, sourceDomain: MOVIESAPI_DOMAIN, headers: requestHeaders })
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.prorcpUrl ? { prorcpUrl: data.prorcpUrl, filename: data.filename } : null;
    } catch (error) {
        console.error(`[FASE 1] Error calling resolver for ${MOVIESAPI_DOMAIN}:`, error.message);
        return null;
    }
}

// FASE 2: Vind de M3U8 URL vanaf de /prorcp/ pagina
async function getM3u8Url(prorcpUrl) {
    if (!prorcpUrl) return null;
    console.log(`[FASE 2] Requesting M3U8 for: ${prorcpUrl}`);
    const encodedSourceUrl = encodeURIComponent(prorcpUrl);
    // We roepen onze eigen /api/play endpoint aan, die de redirect logica al heeft.
    // Dit is een 'interne' fetch naar onze eigen serverless functie.
    const playUrl = `${host}/api/play?source=${encodedSourceUrl}`;
    
    try {
        // We willen de redirect URL, niet de inhoud.
        const response = await fetch(playUrl, { redirect: 'manual' });
        // De M3U8 URL zit in de 'Location' header van de 302 redirect.
        if (response.status === 302 || response.status === 301) {
            const m3u8 = response.headers.get('location');
            console.log(`[FASE 2] Success, found M3U8: ${m3u8}`);
            return m3u8;
        }
        console.log(`[FASE 2] Failed, api/play did not redirect. Status: ${response.status}`);
        return null;
    } catch (error) {
        console.error(`[FASE 2] Error fetching from api/play:`, error.message);
        return null;
    }
}


// --- ADDON FACTORY ---

function createAddonInterface(mode = 'noprefetch') {
    const manifest = {
        "id": `community.nepflix2.ries.${mode}`,
        "version": "2.2.0", // Versie verhoogd
        "name": `Nepflix 2 (${mode})`,
        "description": `HLS streams van moviesapi.club met ${mode} laadstrategie.`,
        "icon": iconUrl,
        "catalogs": [],
        "resources": ["stream"],
        "types": ["movie", "series"],
        "idPrefixes": ["tt"]
    };

    const builder = new addonBuilder(manifest);

    builder.defineStreamHandler(async ({ type, id }) => {
        console.log(`Stream request for ${id} with mode: ${mode}`);
        const [imdbId, season, episode] = id.split(':');
        if (!imdbId) return Promise.resolve({ streams: [] });

        let stream = null;

        switch (mode) {
            case 'fullprefetch': {
                const source = await getProrcpUrl(type, imdbId, season, episode);
                if (source && source.prorcpUrl) {
                    const m3u8Url = await getM3u8Url(source.prorcpUrl);
                    if (m3u8Url) {
                        stream = { url: m3u8Url, title: source.filename || `MoviesAPI (direct)` };
                    }
                }
                break;
            }

            case 'prefetch1': {
                const source = await getProrcpUrl(type, imdbId, season, episode);
                if (source && source.prorcpUrl) {
                    const encodedSourceUrl = encodeURIComponent(source.prorcpUrl);
                    const proxyUrl = `${host}/api/play?source=${encodedSourceUrl}&imdbid=${id}`;
                    stream = { url: proxyUrl, title: source.filename || `MoviesAPI (prefetched)` };
                }
                break;
            }

            case 'noprefetch':
            default: {
                // De proxy URL bevat alleen de imdb id; /api/play doet al het werk.
                const proxyUrl = `${host}/api/play?imdbid=${id}`;
                stream = { url: proxyUrl, title: `MoviesAPI (on-demand)` };
                break;
            }
        }
        
        return Promise.resolve({ streams: stream ? [stream] : [] });
    });

    return builder.getInterface();
}

module.exports = { createAddonInterface };