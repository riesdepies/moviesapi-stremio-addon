const { getRouter } = require('stremio-addon-sdk');
const { parse } = require('url');
const addonInterface = require('../addon.js');
const playHandler = require('./play.js');

const router = getRouter(addonInterface);

module.exports = (req, res) => {
    const { pathname } = parse(req.url, true);

    // Voeg CORS headers toe aan alle responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // Route naar de Fase 2 player
    if (pathname === '/api/play') {
        return playHandler(req, res);
    }
    
    // Alle andere requests worden door de addon-sdk router afgehandeld
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
};