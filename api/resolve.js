const cloudscraper = require('cloudscraper');

// --- HELPER FUNCTIES ---

/**
 * NIEUW & VERBETERD: Zoekt naar dynamisch gegenereerde iframe bronnen.
 * Dit is voor iframes die worden aangemaakt met JavaScript/jQuery, zoals:
 * - $('<iframe>', { src: '/prorcp/...' })
 * - .src = '/prorcp/...'
 * - src: '/prorcp/...'
 * @param {string} htmlContent De volledige HTML-broncode.
 * @returns {string|null} De gevonden URL of null.
 */
function findDynamicIframeSrc(htmlContent) {
    // Patroon 1: Specifiek voor jQuery constructor $('<iframe>', { ... })
    const jqueryRegex = /\$\(['"]<iframe>['"],\s*{[^}]*?src:\s*['"]([^'"]+)['"]/;
    let match = htmlContent.match(jqueryRegex);
    if (match && match[1]) return match[1];

    // Patroon 2: Algemener voor .src = '...' of src: '...'
    const genericJsRegex = /(?:src\s*[:=]\s*)['"]([^'"]*?\/(?:p?rcp)\/[^'"]*?)['"]/;
    match = htmlContent.match(genericJsRegex);
    if (match && match[1]) return match[1];

    return null;
}


function extractFilename(htmlContent) {
    const regex = /atob\s*\(\s*['"]([^'"]+)['"]\s*\)/;
    const match = htmlContent.match(regex);
    if (match && match[1]) {
        try {
            const decodedString = atob(match[1]);
            const pathParts = decodedString.split('/');
            return pathParts[pathParts.length - 1];
        } catch (e) { return null; }
    }
    return null;
}

function findHtmlIframeSrc(html) {
    const staticRegex = /<iframe[^>]+src\s*=\s*["']([^"']+)["']/;
    const match = html.match(staticRegex);
    return match ? match[1] : null;
}

// --- HOOFDFUNCTIE ---

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { targetUrl, sourceDomain, headers } = req.body;
    if (!targetUrl || !sourceDomain || !headers) {
        return res.status(400).json({ error: 'Bad Request' });
    }

    const MAX_REDIRECTS = 5;
    const visitedUrls = new Set();
    let currentUrl = targetUrl;
    let previousUrl = null;
    let foundFilename = null;

    console.log(`[RESOLVER FASE 1] Starting chain for ${targetUrl} using Cloudscraper`);

    try {
        for (let step = 1; step <= MAX_REDIRECTS; step++) {
            if (visitedUrls.has(currentUrl)) {
                console.log(`[RESOLVER FASE 1] Loop detected, stopping chain at ${currentUrl}`);
                break;
            }
            visitedUrls.add(currentUrl);

            const finalHeaders = { ...headers };
            if (previousUrl) {
                finalHeaders['Referer'] = previousUrl;
            }
            delete finalHeaders['host'];

            const options = { uri: currentUrl, headers: finalHeaders, timeout: 15000 };

            let html;
            try {
                 html = await cloudscraper.get(options);
            } catch (error) {
                console.log(`[RESOLVER FASE 1] Cloudscraper failed for ${currentUrl} with status ${error.statusCode || 'N/A'}`);
                break;
            }

            if (!foundFilename) {
                foundFilename = extractFilename(html);
            }

            // --- AANGEPASTE LOGICA: Gebruik de slimmere scraper ---
            const nextIframeSrc = findHtmlIframeSrc(html) || findDynamicIframeSrc(html);

            if (nextIframeSrc) {
                const nextUrl = new URL(nextIframeSrc, currentUrl).href;
                console.log(`[RESOLVER FASE 1] Step ${step}: Found next iframe -> ${nextUrl}`);
                
                if (nextUrl.includes('/prorcp/')) {
                    console.log(`[RESOLVER FASE 1] Success! Found final Prorcp URL: ${nextUrl}`);
                    return res.status(200).json({
                        prorcpUrl: nextUrl,
                        sourceDomain: sourceDomain,
                        filename: foundFilename
                    });
                }

                previousUrl = currentUrl;
                currentUrl = nextUrl;
            } else {
                console.log(`[RESOLVER FASE 1] No next iframe found on ${currentUrl}`);
                break;
            }
        }

        console.log(`[RESOLVER FASE 1] Chain finished without finding a /prorcp/ URL for ${targetUrl}`);
        return res.status(404).json({ error: 'Prorcp URL not found in chain' });

    } catch (error) {
        console.error(`[RESOLVER FASE 1 FATAL ERROR] for ${currentUrl}:`, error.message);
        return res.status(502).json({ error: 'Proxy fetch failed', details: error.message });
    }
};