// --- HELPER FUNCTIES ---

function extractFilename(htmlContent) {
    const regex = /atob\s*\(\s*['"]([^'"]+)['"]\s*\)/;
    const match = htmlContent.match(regex);

    if (match && match[1]) {
        try {
            const decodedString = atob(match[1]);
            const pathParts = decodedString.split('/');
            return pathParts[pathParts.length - 1];
        } catch (e) {
            return null;
        }
    }
    return null;
}

function findJsIframeSrc(html) {
    const combinedRegex = /(?:src:\s*|\.src\s*=\s*)["']([^"']+)["']/g;
    let match;
    while ((match = combinedRegex.exec(html)) !== null) {
        const url = match[1];
        if (url) {
            const path = url.split('?')[0].split('#')[0];
            if (!path.endsWith('.js')) return url;
        }
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
    const initialReferer = `https://${sourceDomain}/`;
    let foundFilename = null;

    console.log(`[RESOLVER FASE 1] Starting chain for ${targetUrl}`);

    try {
        for (let step = 1; step <= MAX_REDIRECTS; step++) {
            if (visitedUrls.has(currentUrl)) break;
            visitedUrls.add(currentUrl);
            
            // Check of de huidige URL al de prorcp link is
            if (currentUrl.includes('/prorcp/')) {
                 console.log(`[RESOLVER FASE 1] Found Prorcp URL directly: ${currentUrl}`);
                 return res.status(200).json({
                     prorcpUrl: currentUrl,
                     sourceDomain: sourceDomain,
                     filename: foundFilename
                 });
            }

            const finalHeaders = { ...headers, 'Referer': previousUrl || initialReferer };
            delete finalHeaders['host'];

            const response = await fetch(currentUrl, {
                headers: finalHeaders,
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) break;

            const html = await response.text();

            if (!foundFilename) {
                foundFilename = extractFilename(html);
            }

            const nextIframeSrc = findHtmlIframeSrc(html) || findJsIframeSrc(html);
            if (nextIframeSrc) {
                const nextUrl = new URL(nextIframeSrc, currentUrl).href;
                console.log(`[RESOLVER FASE 1] Found next iframe: ${nextUrl}`);
                
                // Belangrijkste wijziging: check op /prorcp/ en stop dan
                if (nextUrl.includes('/prorcp/')) {
                    console.log(`[RESOLVER FASE 1] Success, found Prorcp URL: ${nextUrl}`);
                    return res.status(200).json({
                        prorcpUrl: nextUrl,
                        sourceDomain: sourceDomain,
                        filename: foundFilename
                    });
                }
                previousUrl = currentUrl;
                currentUrl = nextUrl;
            } else {
                break;
            }
        }

        console.log(`[RESOLVER FASE 1] Chain finished without Prorcp URL for ${targetUrl}`);
        return res.status(404).json({ error: 'Prorcp URL not found' });

    } catch (error) {
        console.error(`[RESOLVER FASE 1 ERROR]`, error.message);
        return res.status(502).json({ error: 'Proxy fetch failed', details: error.message });
    }
};
