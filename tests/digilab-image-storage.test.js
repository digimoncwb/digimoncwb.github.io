const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Buffer } = require('node:buffer');
const { stripTypeScriptTypes } = require('node:module');

function setup({
    existing = [],
    status = 200,
    valid = true,
    uploadError = null,
    missingPrimary = false
} = {}) {
    const uploads = [],
        downloads = [];
    const bucket = {
        list: async () => ({ data: existing.map((name) => ({ name, metadata: { size: 6000 } })) }),
        upload: async (path, bytes, options) => {
            uploads.push({ path, bytes, options });
            return { error: uploadError };
        },
        getPublicUrl: (path) => ({
            data: {
                publicUrl: `https://project.supabase.co/storage/v1/object/public/deck-images/${path}`
            }
        })
    };
    const source = stripTypeScriptTypes(
        fs.readFileSync('supabase/functions/digilab-deck-catalog/index.ts', 'utf8')
    ).replace(/^import[\s\S]*?;\s*/gm, '');
    const sandbox = {
        withSiteAudit: (handler) => handler,
        Deno: { serve() {} },
        AbortSignal: globalThis.AbortSignal,
        fetch: async (url) => {
            downloads.push(url);
            const webp = missingPrimary && !url.includes('digilab.cards');
            const bytes = new Uint8Array(6000);
            if (valid) {
                bytes[0] = 0xff;
                bytes[1] = 0xd8;
                if (webp) {
                    bytes.set(Buffer.from('RIFF'), 0);
                    bytes.set(Buffer.from('WEBP'), 8);
                }
            }
            return {
                ok: status === 200 && !(missingPrimary && url.includes('digilab.cards')),
                headers: { get: () => (webp ? 'image/webp' : 'image/jpeg') },
                arrayBuffer: async () => bytes.buffer
            };
        }
    };
    vm.runInNewContext(source + '\nthis.store=storeCatalogImages;', sandbox);
    return {
        store: sandbox.store,
        service: { storage: { from: () => bucket } },
        uploads,
        downloads
    };
}

test('catalog images upload once per card and all decks receive the storage URL', async () => {
    const s = setup();
    const rows = [
        { display_card_id: 'ST23-09' },
        { display_card_id: 'ST23-09' },
        { display_card_id: null }
    ];
    const summary = await s.store(s.service, rows);
    assert.equal(summary.uploaded, 1);
    assert.equal(s.downloads.length, 1);
    assert.equal(s.uploads[0].path, 'digilab/ST23-09.jpg');
    assert.equal(s.uploads[0].options.contentType, 'image/jpeg');
    assert.equal(
        rows[0].image_url,
        'https://project.supabase.co/storage/v1/object/public/deck-images/digilab/ST23-09.jpg'
    );
    assert.equal(rows[1].image_url, rows[0].image_url);
    assert.equal(rows[2].image_url, null);
});

test('later syncs reuse stored images without downloading or uploading', async () => {
    const s = setup({ existing: ['ST23-09.jpg'] });
    const summary = await s.store(s.service, [{ display_card_id: 'ST23-09' }]);
    assert.equal(summary.reused, 1);
    assert.equal(s.downloads.length, 0);
    assert.equal(s.uploads.length, 0);
});

test('missing DigiLab images use the same card from storage with its actual WebP format', async () => {
    const s = setup({ missingPrimary: true });
    const rows = [{ display_card_id: 'P-203' }];
    await s.store(s.service, rows);
    assert.equal(s.downloads.length, 2);
    assert.equal(s.uploads[0].path, 'digilab/P-203.webp');
    assert.equal(s.uploads[0].options.contentType, 'image/webp');
    assert.ok(rows[0].image_url.endsWith('/digilab/P-203.webp'));
});

test('failed downloads, invalid image bytes and upload failures stop catalog publication', async () => {
    for (const options of [
        { status: 404 },
        { valid: false },
        { uploadError: { message: 'unavailable' } }
    ]) {
        const s = setup(options);
        const rows = [{ display_card_id: 'ST23-09' }];
        await assert.rejects(s.store(s.service, rows), /indisponível|inválida|armazenar/);
        assert.equal(rows[0].image_url, undefined);
    }
});

test('invalid card identifiers never trigger a storage or network request', async () => {
    const s = setup();
    await assert.rejects(s.store(s.service, [{ display_card_id: '../ST23-09' }]), /inválido/);
    assert.equal(s.downloads.length, 0);
    assert.equal(s.uploads.length, 0);
});
