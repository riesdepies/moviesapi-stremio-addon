const { addonBuilder } = require("stremio-addon-sdk");
const { getProrcpUrl, getM3u8Url } = require("./utils/resolvers.js");

// --- CONFIGURATIE VOOR ELKE MODUS ---
const MODES = {
    'no-prefetch': {
        name: 'Nepflix 2 (no prefetch)',
        description: 'Zoekt de stream pas wanneer erop geklikt wordt.'
    },
    'prefetch-1': {
        name: 'Nepflix 2 (prefetch 1)',
        description: 'Prefetches de bron-URL voor sneller starten.'
    },
    'full-prefetch': {
        name: 'Nepflix 2 (full prefetch)',
        description: 'Prefetches de definitieve .m3u8 link voor direct starten.'
    }
};

function createAddon(mode, host) {
    const config = MODES[mode];
    if (!config) throw new Error(`Ongeldige modus: ${mode}`);

    const manifest = {
        "id": `community.nepflix2.ries.${mode}`,
        "version": "3.0.0",
        "name": config.name,
        "description": config.description,
        "icon": `${host}/icon.png`,
        "resources": ["stream"],
        "types": ["movie", "series"],
        "idPrefixes": ["tt"],
        "catalogs": []
    };

    const builder = new addonBuilder(manifest);

    builder.defineStreamHandler(async ({ type, id }) => {
        console.log(`Stream request voor modus "${mode}": ${id}`);
        const [imdbId, season, episode] = id.split(':');
        if (!imdbId) return Promise.resolve({ streams: [] });

        let stream = null;

        // --- TITELS AANGEPAST ---
        switch (mode) {
            case 'no-prefetch': {
                const proxyUrl = `${host}/${mode}/play?imdbid=${id}`;
                // Titel is nu cleaner, zonder emoji.
                stream = { url: proxyUrl, title: "[NP] Nepflix" };
                break;
            }
            case 'prefetch-1': {
                const source = await getProrcpUrl(type, imdbId, season, episode);
                if (source && source.prorcpUrl) {
                    const encodedUrl = encodeURIComponent(source.prorcpUrl);
                    const proxyUrl = `${host}/${mode}/play?prorcp=${encodedUrl}`;
                    // Titel is nu cleaner, met [P1] als prefix.
                    stream = { url: proxyUrl, title: `[P1] ${source.filename || 'Nepflix'}` };
                }
                break;
            }
            case 'full-prefetch': {
                const source = await getProrcpUrl(type, imdbId, season, episode);
                if (source && source.prorcpUrl) {
                    const m3u8Url = await getM3u8Url(source.prorcpUrl);
                    if (m3u8Url) {
                        // Titel is nu cleaner, met [FP] als prefix.
                        stream = { url: m3u8Url, title: `[FP] ${source.filename || 'Nepflix'}` };
                    }
                }
                break;
            }
        }
        
        if (stream) {
            return Promise.resolve({ streams: [stream] });
        }
        return Promise.resolve({ streams: [] });
    });

    return builder.getInterface();
}

module.exports = { createAddon };