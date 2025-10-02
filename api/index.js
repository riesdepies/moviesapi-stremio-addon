const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('../addon.js');

const router = getRouter(addonInterface);

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

    // Cache de manifest en streamlijst (met de resolver URL) voor 1 uur.
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=1800');

    router(req, res, () => {
        res.statusCode = 404;
        res.end('Not Found');
    });
};