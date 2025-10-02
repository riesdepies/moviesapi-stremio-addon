const { addonBuilder } = require("stremio-addon-sdk");

const host = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000';

const manifest = {
    "id": "community.nepflix2.ries.resolver",
    "version": "2.1.0",
    "name": "Nepflix 2 (Resolver)",
    "description": "HLS streams van moviesapi.club met 2-staps resolving.",
    "icon": "/icon.png", // <- Simpel pad, Vercel vindt dit in de 'public' map
    "catalogs": [],
    "resources": ["stream"],
    "types": ["movie", "series"],
    "idPrefixes": ["tt"]
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
    const streamData = { type, id };
    const encodedData = Buffer.from(JSON.stringify(streamData)).toString('base64');
    const resolveUrl = `${host}/api/resolve_stream?data=${encodedData}`;

    const stream = {
        title: `Nepflix 2\nKlik om te laden`,
        url: resolveUrl
    };

    return Promise.resolve({ streams: [stream] });
});

module.exports = builder.getInterface();