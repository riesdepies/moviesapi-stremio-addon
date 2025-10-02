const { addonBuilder } = require("stremio-addon-sdk");

// --- DYNAMISCHE HOST & ICOON URL ---
const host = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000';
const iconUrl = `${host}/icon.png`;

// --- MANIFEST (VERSIE 2.1.0) ---
const manifest = {
    "id": "community.nepflix2.ries.resolver",
    "version": "2.1.0",
    "name": "Nepflix 2 (Resolver)",
    "description": "HLS streams van moviesapi.club met 2-staps resolving.",
    "icon": iconUrl,
    "catalogs": [],
    "resources": ["stream"],
    "types": ["movie", "series"],
    "idPrefixes": ["tt"]
};

const builder = new addonBuilder(manifest);

// --- STAP 1: GEEF DIRECT EEN 'RESOLVER' URL TERUG ---
builder.defineStreamHandler(async ({ type, id }) => {
    // Deze handler is nu supersnel. Hij doet geen scraping.
    
    // We coderen de type en id informatie zodat de resolver weet wat te fetchen.
    const streamData = { type, id };
    const encodedData = Buffer.from(JSON.stringify(streamData)).toString('base64');

    // Bouw de URL die naar onze eigen resolver-eindpunt wijst.
    const resolveUrl = `${host}/api/resolve_stream?data=${encodedData}`;

    const stream = {
        title: `Nepflix 2\nKlik om te laden`, // Duidelijke titel voor de gebruiker
        url: resolveUrl
    };

    return Promise.resolve({ streams: [stream] });
});

module.exports = builder.getInterface();