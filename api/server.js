const { getRouter } = require('stremio-addon-sdk');
const { createAddon } = require('../addon.js');
const { getProrcpUrl, getM3u8Url } = require('../utils/resolvers.js');
const { parse } = require('url');

const host = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000';

// Maak een addon en router voor elke modus
const noPrefetchAddon = createAddon('no-prefetch', host);
const prefetch1Addon = createAddon('prefetch-1', host);
const fullPrefetchAddon = createAddon('full-prefetch', host);

const routers = {
    'no-prefetch': getRouter(noPrefetchAddon),
    'prefetch-1': getRouter(prefetch1Addon),
    'full-prefetch': getRouter(fullPrefetchAddon),
};

// --- HOOFD SERVER LOGICA ---
module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();

    // --- DIT IS DE CORRECTIE ---
    // We parsen de URL hier één keer en gebruiken 'pathname' voor de routing.
    const { pathname, query } = parse(req.url, true);
    const parts = pathname.split('/').filter(Boolean);
    const mode = parts[0];
    const action = parts[1];
    // --- EINDE CORRECTIE ---

    // --- PROXY HANDLERS ---
    if (mode && action === 'play') {
        if (mode === 'no-prefetch' && query.imdbid) {
            console.log(`[PROXY] no-prefetch: Ontvangen imdbid ${query.imdbid}`);
            const [imdbId, season, episode] = query.imdbid.split(':');
            const type = (season && episode) ? 'series' : 'movie';
            const source = await getProrcpUrl(type, imdbId, season, episode);
            if (source && source.prorcpUrl) {
                const m3u8Url = await getM3u8Url(source.prorcpUrl);
                if (m3u8Url) {
                    res.writeHead(302, { 'Location': m3u8Url });
                    return res.end();
                }
            }
        } else if (mode === 'prefetch-1' && query.prorcp) {
            console.log(`[PROXY] prefetch-1: Ontvangen prorcp URL`);
            const m3u8Url = await getM3u8Url(query.prorcp);
            if (m3u8Url) {
                res.writeHead(302, { 'Location': m3u8Url });
                return res.end();
            }
        }
        
        console.error(`[PROXY] Fout: Stream niet gevonden voor modus ${mode} met query`, query);
        res.statusCode = 404;
        return res.end('Stream niet gevonden.');
    }
    
    // --- STREMIO ADDON ROUTING ---
    const router = routers[mode];
    if (router) {
        // Verwijder de modus-prefix van de URL zodat de SDK het begrijpt
        req.url = req.url.replace(`/${mode}`, '') || '/';
        router(req, res, () => {
            res.statusCode = 404;
            res.end('Not Found in Stremio router');
        });
    } else {
        // Fallback voor onbekende URLs (bijv. icoon, of de hoofdpagina)
        if (req.url === '/icon.png' || req.url.startsWith('/favicon')) {
             // Handle icon serving if you have one in /public
             return res.status(204).end(); // Stuur no content terug als er geen icoon is
        }
        res.statusCode = 404;
        res.end(`Not Found. Geen geldige modus of actie in URL: ${pathname}`);
    }
};