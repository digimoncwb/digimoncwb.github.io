const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('BT24-101 portrait centers on x=220 and preserves the crop of other cards', () => {
    const paintPortrait = vm.runInNewContext(
        fs.readFileSync('shared/posts/renderer.js', 'utf8').replace(/export /g, '') +
            '\npaintPortrait',
        {
            window: {
                cardPortraits: {
                    get: (src) => ({
                        center_x: /\bBT24-101(?=[._/?#]|$)/i.test(src) ? 220 / 430 : 0.5,
                        offset_y: 0,
                        zoom: 2.3
                    })
                }
            }
        }
    );
    for (const [src, center] of [
        ['https://digimon.digilab.cards/api/card/BT24-101.jpg?s=m&v=2', 220 / 430],
        ['https://storage.example/deck-images/digilab/BT24-101.webp', 220 / 430],
        ['https://storage.example/deck-images/BT24-1010.webp', 0.5],
        ['https://storage.example/deck-images/ST23-09.webp', 0.5]
    ]) {
        for (const sourceWidth of [430, 860]) {
            let draw;
            const ctx = new Proxy(
                {},
                {
                    get: (_, key) =>
                        key === 'drawImage'
                            ? (...args) => {
                                  draw = args;
                              }
                            : () => {},
                    set: () => true
                }
            );
            paintPortrait(
                ctx,
                { src, width: sourceWidth, height: (sourceWidth * 601) / 430 },
                540,
                650,
                185,
                'gold',
                'JU'
            );
            const [, left, , width] = draw;
            assert.ok(Math.abs((540 - left) / width - center) < 1e-12, src);
        }
    }
});

function loader(fail, fetch) {
    const attempts = [];
    const api = vm.runInNewContext(
        fs.readFileSync('shared/posts/renderer.js', 'utf8').replace(/export /g, '') +
            '\n({ loadPostPortrait, loadPostCardImage })',
        {
            window: {
                APP_CONFIG: { SUPABASE_URL: 'https://storage.example' },
                createSupabaseHeaders: () => ({ apikey: 'public-key' })
            },
            fetch,
            URL,
            AbortSignal: globalThis.AbortSignal,
            setTimeout,
            clearTimeout,
            Image: class {
                set src(value) {
                    attempts.push(value);
                    assert.equal(this.crossOrigin, 'anonymous');
                    Promise.resolve().then(() => (fail(value) ? this.onerror() : this.onload()));
                }
            }
        }
    );
    return { api, attempts };
}

test('canvas cards use the server image cache after CORS failure and reuse the loaded card', async () => {
    let cached = false;
    const requests = [];
    const { api, attempts } = loader(
        (src) => src.includes('digilab.cards') || !cached,
        async (url, options) => {
            requests.push({ url, code: JSON.parse(options.body).code });
            cached = true;
            return {
                ok: true,
                json: async () => ({
                    url: 'https://storage.example/storage/v1/object/public/deck-images/BT25-001.webp'
                })
            };
        }
    );
    const image = await api.loadPostCardImage(
        'BT25-001',
        'https://digimon.digilab.cards/api/card/BT25-001.jpg'
    );
    assert.ok(image);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://storage.example/functions/v1/upload-card-image');
    assert.equal(requests[0].code, 'BT25-001');
    assert.match(attempts.at(-1), /BT25-001\.webp\?v=\d+/);
    assert.equal(
        await api.loadPostCardImage(
            'BT25-001',
            'https://digimon.digilab.cards/api/card/BT25-001.jpg'
        ),
        image
    );
    assert.equal(requests.length, 1);
});

test('posts preserve the registered image when it loads for canvas', async () => {
    const { api, attempts } = loader(() => false);
    const src = 'https://digimon.digilab.cards/api/card/ST23-09.jpg';
    assert.ok(await api.loadPostPortrait(src));
    assert.deepEqual(attempts, [src]);
});

test('cards try Aegis second and stop when the EX14 image loads', async () => {
    const { api, attempts } = loader((src) => src.includes('digilab.cards'));
    assert.ok(
        await api.loadPostCardImage(
            'EX14-012',
            'https://digimon.digilab.cards/api/card/EX14-012.jpg'
        )
    );
    assert.deepEqual(attempts, [
        'https://digimon.digilab.cards/api/card/EX14-012.jpg',
        'https://aegis-digi.online/assets/card-images/EX14-012-Sample.webp'
    ]);
});

test('cards keep the primary image when available and exhaust fallbacks when missing', async () => {
    const primary = 'https://digimon.digilab.cards/api/card/EX14-012.jpg';
    const success = loader(() => false);
    assert.ok(await success.api.loadPostCardImage('EX14-012', primary));
    assert.deepEqual(success.attempts, [primary]);
    const missing = loader(() => true);
    assert.equal(await missing.api.loadPostCardImage('EX14-012', primary), null);
    assert.deepEqual(missing.attempts, [
        primary,
        'https://aegis-digi.online/assets/card-images/EX14-012-Sample.webp',
        'https://storage.example/storage/v1/object/public/deck-images/EX14-012.webp',
        'https://deckbuilder.egmanevents.com/card_images/digimon/EX14-012.png'
    ]);
});

test('posts fall back to card storage when the registered image fails CORS', async () => {
    const { api, attempts } = loader((src) => src.includes('digilab.cards'));
    assert.ok(await api.loadPostPortrait('https://digimon.digilab.cards/api/card/ST23-09.jpg'));
    assert.deepEqual(attempts, [
        'https://digimon.digilab.cards/api/card/ST23-09.jpg',
        'https://storage.example/storage/v1/object/public/deck-images/ST23-09.webp'
    ]);
});

test('failed portraits can be retried and absent portraits make no requests', async () => {
    const { api, attempts } = loader(() => true);
    assert.equal(await api.loadPostPortrait(''), null);
    assert.equal(await api.loadPostPortrait('https://example.com/custom.png'), null);
    assert.equal(await api.loadPostPortrait('https://example.com/custom.png'), null);
    assert.equal(attempts.length, 2);
});
