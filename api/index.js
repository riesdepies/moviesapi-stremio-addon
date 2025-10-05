const { getRouter } = require('stremio-addon-sdk');
const { createAddonInterface } = require('../addon.js');

// Cache om te voorkomen dat we de interface voor elke request opnieuw bouwen
const addonInterfaces = {};

function getAddon(mode) {
    if (!addonInterfaces[mode]) {
        console.log(`Creating addon interface for mode: ${mode}`);
        addonInterfaces[mode] = createAddonInterface(mode);
    }
    return addonInterfaces[mode];
}

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // Haal de modus uit de URL, bv. /noprefetch/manifest.json -> 'noprefetch'
    // Standaard is 'noprefetch' als er geen modus wordt gevonden.
    const urlParts = req.url.split('/').filter(p => p);
    const mode = ['noprefetch', 'prefetch1', 'fullprefetch'].includes(urlParts[0]) ? urlParts[0] : 'noprefetch';
    
    // Verwijder de modus uit de URL zodat de addon-sdk router het begrijpt
    // /noprefetch/manifest.json -> /manifest.json
    if (urlParts[0] === mode) {
        req.url = req.url.replace(`/${mode}`, '');
        if (req.url === '') req.url = '/';
    }

    const addonInterface = getAddon(mode);
    const router = getRouter(addonInterface);

    // Cache-logica (ongewijzigd)
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
        const body = chunk ? chunk.toString('utf-8') : '';
        if (this.statusCode === 200 && body.includes('"url":')) {
            this.setHeader('Cache-Control', 'public, s-maxage=14400, stale-while-revalidate=3600');
        } else {
            this.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
        originalEnd.call(this, chunk, encoding);
    };
    
    router(req, res, () => {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ err: 'Not Found' }));
    });
};```

---

### Bestand 4: `api/play.js` (Aangepaste versie)

Deze endpoint verwerkt nu twee soorten requests: die met `imdbid` (voor `noprefetch`) en die met een `source` URL (voor `prefetch1`).

```javascript
const { parse } = require('url');

// --- HELPER FUNCTIES (importeer ze uit de addon logica om duplicatie te voorkomen) ---
// In een Vercel-omgeving kunnen we niet direct importeren, dus we kopiëren de functies.
// In een monorepo/lokaal project zou je dit in een gedeeld utils-bestand plaatsen.
function extractM3u8Url(htmlContent) {
    const regex = /file\s*:\s*['"]([^'"]+?\.m3u8[^'"]*?)['"]/;
    const match = htmlContent.match(regex);
    return match ? match[1] : null;
}
function getRandomBrowserProfile() {
    const BROWSER_PROFILES = [
        { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    ];
    return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
}

// --- FASE 2 LOGICA ---
async function fetchAndRedirectToM3u8(prorcpUrl, res) {
    if (!prorcpUrl) {
        res.statusCode = 404;
        return res.end('Prorcp URL not found.');
    }
    
    console.log(`[FASE 2] Starting final resolve for: ${prorcpUrl}`);
    const referer = `https://${new URL(prorcpUrl).hostname}/`;
    const headers = {
        ...getRandomBrowserProfile(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': referer,
        'Upgrade-Insecure-Requests': '1', 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'iframe',
    };

    try {
        const response = await fetch(prorcpUrl, { headers: headers, signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Fetch failed with status ${response.status}`);
        
        const html = await response.text();
        const m3u8Url = extractM3u8Url(html);

        if (m3u8Url) {
            console.log(`[FASE 2] Success, found M3U8: ${m3u8Url}. Redirecting...`);
            res.writeHead(302, { 'Location': m3u8Url });
            return res.end();
        } else {
            console.log(`[FASE 2] M3U8 not found on final page: ${prorcpUrl}`);
            res.statusCode = 404;
            return res.end('M3U8 not found on source page.');
        }
    } catch (error) {
        console.error(`[FASE 2 ERROR] for ${prorcpUrl}:`, error.message);
        res.statusCode = 502;
        return res.end('Failed to fetch the final stream URL.');
    }
}

// --- HOOFD FUNCTIE ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();

    const { query } = parse(req.url, true);
    
    // Scenario 1: 'prefetch1' modus - de prorcp URL is al gevonden.
    if (query.source) {
        const sourceUrl = decodeURIComponent(query.source);
        return await fetchAndRedirectToM3u8(sourceUrl, res);
    } 
    
    // Scenario 2: 'noprefetch' modus - we moeten vanaf nul beginnen.
    else if (query.imdbid) {
        const imdbIdFull = query.imdbid;
        const [imdbId, season, episode] = imdbIdFull.split(':');
        const type = (season && episode) ? 'series' : 'movie';
        
        // We moeten een interne call maken naar onze eigen addon-logica voor Fase 1.
        // Dit is complex in een serverless omgeving. Een makkelijkere manier is om de logica te dupliceren of te verplaatsen.
        // Voor nu roepen we onze eigen resolver weer aan, net als de addon zelf.
        const host = req.headers.host ? `https://${req.headers.host}` : 'http://127.0.0.1:3000';
        const MOVIESAPI_DOMAIN = "cdn.moviesapi.club";
        const apiType = type === 'series' ? 'tv' : 'movie';
        const targetUrl = apiType === 'tv' && season && episode
            ? `https://${MOVIESAPI_DOMAIN}/embed/${apiType}/${imdbId}?s=${season}&e=${episode}`
            : `https://${MOVIESAPI_DOMAIN}/embed/${apiType}/${imdbId}`;
        
        const resolverUrl = `${host}/api/resolve`;
        const requestHeaders = { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', ...getRandomBrowserProfile() };
        
        console.log(`[FASE 1 - on-demand] Requesting Prorcp URL for: ${targetUrl}`);
        try {
            const response = await fetch(resolverUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUrl, sourceDomain: MOVIESAPI_DOMAIN, headers: requestHeaders })
            });
            if (!response.ok) throw new Error(`Resolver failed with status ${response.status}`);
            
            const data = await response.json();
            if (data.prorcpUrl) {
                return await fetchAndRedirectToM3u8(data.prorcpUrl, res);
            } else {
                throw new Error('Prorcp URL not found by resolver.');
            }
        } catch (error) {
            console.error(`[FASE 1 - on-demand ERROR] for ${targetUrl}:`, error.message);
            res.statusCode = 502;
            return res.end('Failed to resolve Prorcp URL.');
        }

    } else {
        res.statusCode = 400;
        return res.end('Bad Request: "source" or "imdbid" parameter is required.');
    }
};