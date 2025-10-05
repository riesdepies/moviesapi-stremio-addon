const cloudscraper = require('cloudscraper');

// --- CONSTANTEN ---
const BROWSER_PROFILES = [
    {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"', 'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"'
    },
    {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"', 'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"macOS"'
    }
];
const COMMON_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q-0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9', 'Accept-Encoding': 'gzip, deflate, br', 'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'iframe',
};
function getRandomBrowserProfile() {
    return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
}

// --- EXTRACTIE FUNCTIES ---
function findDynamicIframeSrc(html) {
    const jqueryRegex = /\$\(['"]<iframe>['"],\s*{[^}]*?src:\s*['"]([^'"]+)['"]/;
    let match = html.match(jqueryRegex);
    if (match && match[1]) return match[1];
    const genericJsRegex = /(?:src\s*[:=]\s*)['"]([^'"]*?\/(?:p?rcp)\/[^'"]*?)['"]/;
    match = html.match(genericJsRegex);
    if (match && match[1]) return match[1];
    return null;
}
function findHtmlIframeSrc(html) {
    const staticRegex = /<iframe[^>]+src\s*=\s*["']([^"']+)["']/;
    const match = html.match(staticRegex);
    return match ? match[1] : null;
}
function extractM3u8Url(html) {
    const regex = /file\s*:\s*['"]([^'"]+?\.m3u8[^'"]*?)['"]/;
    const match = html.match(regex);
    return match ? match[1] : null;
}
function extractFilename(html) {
    const regex = /atob\s*\(\s*['"]([^'"]+)['"]\s*\)/;
    const match = html.match(regex);
    if (match && match[1]) {
        try { return atob(match[1]).split('/').pop(); } catch (e) { return null; }
    }
    return null;
}

// --- FASE 1: VIND DE /PRORCP/ URL ---
async function getProrcpUrl(type, imdbId, season, episode) {
    const MOVIESAPI_DOMAIN = "cdn.moviesapi.club";
    const apiType = type === 'series' ? 'tv' : 'movie';
    const targetUrl = apiType === 'tv' && season && episode
        ? `https://${MOVIESAPI_DOMAIN}/embed/${apiType}/${imdbId}?s=${season}&e=${episode}`
        : `https://${MOVIESAPI_DOMAIN}/embed/${apiType}/${imdbId}`;

    console.log(`[FASE 1] Start voor: ${targetUrl}`);
    let currentUrl = targetUrl;
    let previousUrl = null;
    let foundFilename = null;

    try {
        for (let step = 1; step <= 5; step++) {
            const finalHeaders = { ...COMMON_HEADERS, ...getRandomBrowserProfile() };
            if (previousUrl) finalHeaders['Referer'] = previousUrl;
            delete finalHeaders['host'];

            const html = await cloudscraper.get({ uri: currentUrl, headers: finalHeaders, timeout: 15000 });
            if (!foundFilename) foundFilename = extractFilename(html);

            const nextIframeSrc = findHtmlIframeSrc(html) || findDynamicIframeSrc(html);
            if (nextIframeSrc) {
                const nextUrl = new URL(nextIframeSrc, currentUrl).href;
                if (nextUrl.includes('/prorcp/')) {
                    console.log(`[FASE 1] Succes, /prorcp/ gevonden: ${nextUrl}`);
                    return { prorcpUrl: nextUrl, filename: foundFilename };
                }
                previousUrl = currentUrl;
                currentUrl = nextUrl;
            } else { break; }
        }
        console.log(`[FASE 1] Geen /prorcp/ URL gevonden in de keten voor ${targetUrl}`);
        return null;
    } catch (error) {
        console.error(`[FASE 1 FOUT] voor ${currentUrl}:`, error.message);
        return null;
    }
}

// --- FASE 2: VIND DE M3U8 URL ---
async function getM3u8Url(prorcpUrl) {
    if (!prorcpUrl) return null;
    console.log(`[FASE 2] Start voor: ${prorcpUrl}`);
    const referer = `https://${new URL(prorcpUrl).hostname}/`;
    const headers = {
        ...getRandomBrowserProfile(),
        'Accept': 'text/html,*/*;q=0.8', 'Referer': referer,
        'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'iframe',
    };
    try {
        const response = await fetch(prorcpUrl, { headers, signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Status ${response.status}`);
        
        const html = await response.text();
        const m3u8Url = extractM3u8Url(html);

        if (m3u8Url) {
            console.log(`[FASE 2] Succes, M3U8 gevonden: ${m3u8Url}`);
            return m3u8Url;
        }
        console.log(`[FASE 2] M3U8 niet gevonden op ${prorcpUrl}`);
        return null;
    } catch (error) {
        console.error(`[FASE 2 FOUT] voor ${prorcpUrl}:`, error.message);
        return null;
    }
}

module.exports = { getProrcpUrl, getM3u8Url };