const { parse } = require('url');

/**
 * VERBETERD: Haalt de M3U8 URL op.
 * Zoekt nu specifiek naar het `file: '...'` patroon binnen een Playerjs object.
 * @param {string} htmlContent De volledige HTML-broncode.
 * @returns {string|null} De gevonden M3U8 URL of null.
 */
function extractM3u8Url(htmlContent) {
    // Regex zoekt naar: file, optionele spaties, :, optionele spaties, quote, (de URL met .m3u8), sluitende quote
    const regex = /file\s*:\s*['"]([^'"]+?\.m3u8[^'"]*?)['"]/;
    const match = htmlContent.match(regex);
    return match ? match[1] : null;
}

const BROWSER_PROFILES = [
    {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }
];

function getRandomBrowserProfile() {
    return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const { query } = parse(req.url, true);
    const sourceUrl = query.source; 
    const imdbIdFull = query.imdbid;

    if (!sourceUrl || !imdbIdFull) {
        res.statusCode = 400;
        return res.end('Bad Request: "source" and "imdbid" parameters are required.');
    }
    
    console.log(`[FASE 2] Starting final resolve for: ${sourceUrl}`);
    
    const [imdbId, season, episode] = imdbIdFull.split(':');
    const type = (season && episode) ? 'tv' : 'movie';
    // De referer voor de prorcp pagina is waarschijnlijk de rcp pagina, maar de embed pagina werkt vaak ook.
    const referer = `https://${new URL(sourceUrl).hostname}/`;

    const headers = {
        ...getRandomBrowserProfile(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': referer,
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'iframe',
    };

    try {
        // De prorcp pagina heeft waarschijnlijk geen Cloudflare, dus fetch is hier prima.
        const response = await fetch(sourceUrl, { headers: headers, signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
            throw new Error(`Fetch failed with status ${response.status}`);
        }
        
        const html = await response.text();
        const m3u8Url = extractM3u8Url(html);

        if (m3u8Url) {
            console.log(`[FASE 2] Success, found M3U8: ${m3u8Url}. Redirecting...`);
            res.writeHead(302, { 'Location': m3u8Url });
            return res.end();
        } else {
            console.log(`[FASE 2] M3U8 not found on final page: ${sourceUrl}`);
            res.statusCode = 404;
            return res.end('M3U8 not found on source page.');
        }

    } catch (error) {
        console.error(`[FASE 2 ERROR] for ${sourceUrl}:`, error.message);
        res.statusCode = 502;
        return res.end('Failed to fetch the final stream URL.');
    }
};