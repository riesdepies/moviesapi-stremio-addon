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

    const { url } = req;
    const parts = url.split('/').filter(Boolean);
    const mode = parts[0];

    // --- PROXY HANDLERS ---
    if (mode && parts[1] === 'play') {
        const { query } = parse(req.url, true);

        if (mode === 'no-prefetch' && query.imdbid) {
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
            const m3u8Url = await getM3u8Url(query.prorcp);
            if (m3u8Url) {
                res.writeHead(302, { 'Location': m3u8Url });
                return res.end();
            }
        }
        
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
            res.end('Not Found');
        });
    } else {
        // Fallback voor onbekende URLs (bijv. icoon, of de hoofdpagina)
        if (url === '/icon.png') {
             // Handle icon serving if you have one in /public
        }
        res.statusCode = 404;
        res.end('Not Found. Check the URL for a valid mode.');
    }
};