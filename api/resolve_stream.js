// --- BROWSERPROFIELEN EN HEADERS ---
const BROWSER_PROFILES = [
    {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
    },
    // ... (andere profielen)
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

// --- HELPER FUNCTIES (van je oude resolve.js) ---
function extractM3u8Url(htmlContent) {
    const regex = /(https?:\/\/[^\s'"]+?\.m3u8[^\s'"]*)/;
    const match = htmlContent.match(regex);
    return match ? match[1] : null;
}
function findJsIframeSrc(html) { /* ... implementatie ... */ }
function findHtmlIframeSrc(html) { /* ... implementatie ... */ }


// --- DE RESOLVER SERVERLESS FUNCTIE ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(204).end();
    
    try {
        const { data } = req.query;
        if (!data) {
            return res.status(400).send("Bad Request: 'data' parameter is missing.");
        }

        const decodedData = JSON.parse(Buffer.from(data, 'base64').toString('ascii'));
        const { type, id } = decodedData;
        const [imdbId, season, episode] = id.split(':');

        // --- BOUW DE INITIALE URL ---
        const MOVIESAPI_DOMAIN = "cdn.moviesapi.club";
        const apiType = type === 'series' ? 'tv' : 'movie';
        let targetUrl;

        if (apiType === 'tv' && season && episode) {
            targetUrl = `https://${MOVIESAPI_DOMAIN}/embed/${apiType}/${imdbId}?s=${season}&e=${episode}`;
        } else {
            targetUrl = `https://${MOVIESAPI_DOMAIN}/embed/${apiType}/${imdbId}`;
        }
        console.log(`[RESOLVER] Starting chain for ${targetUrl}`);

        // --- SCRAPE LOGICA (uit je oude /api/resolve) ---
        let currentUrl = targetUrl;
        let previousUrl = `https://${MOVIESAPI_DOMAIN}/`;
        const visitedUrls = new Set();
        const MAX_REDIRECTS = 5;

        for (let step = 1; step <= MAX_REDIRECTS; step++) {
            if (visitedUrls.has(currentUrl)) break;
            visitedUrls.add(currentUrl);

            const requestHeaders = { ...COMMON_HEADERS, ...getRandomBrowserProfile(), 'Referer': previousUrl };
            delete requestHeaders['host'];
            
            const response = await fetch(currentUrl, { headers: requestHeaders, signal: AbortSignal.timeout(15000) });
            if (!response.ok) break;
            
            const html = await response.text();
            const m3u8Url = extractM3u8Url(html);

            if (m3u8Url) {
                console.log(`[SUCCESS] Found M3U8: ${m3u8Url}. Redirecting player.`);
                // STUUR EEN REDIRECT NAAR DE SPELER
                res.redirect(302, m3u8Url);
                return; // Stop de executie
            }

            const nextIframeSrc = findHtmlIframeSrc(html) || findJsIframeSrc(html);
            if (nextIframeSrc) {
                previousUrl = currentUrl;
                currentUrl = new URL(nextIframeSrc, currentUrl).href;
                console.log(`[RESOLVER] Found next iframe, redirecting to: ${currentUrl}`);
            } else {
                break;
            }
        }
        
        console.log(`[FAILURE] Chain finished without result for ${targetUrl}`);
        return res.status(404).send("Stream not found after resolving.");

    } catch (error) {
        console.error(`[RESOLVER ERROR]`, error.message);
        return res.status(500).send("Internal Server Error");
    }
};