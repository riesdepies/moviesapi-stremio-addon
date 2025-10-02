const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('../addon.js');

const router = getRouter(addonInterface);

module.exports = (req, res) => {
    // Voeg CORS headers toe
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // Onderschep de 'end' functie om de cache-header conditioneel in te stellen.
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
        const body = chunk ? chunk.toString('utf-8') : '';

        if (this.statusCode === 200 && body.includes('"url":')) {
            // SUCCES: Cache voor 4 uur.
            this.setHeader('Cache-Control', 'public, s-maxage=14400, stale-while-revalidate=3600');
        } else {
            // FOUT of LEGE RESPONS: NIET CACHEN.
            this.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
        originalEnd.call(this, chunk, encoding);
    };

    // Stuur alle requests door naar de addon router
    router(req, res, () => {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ err: 'Not Found' }));
    });
};