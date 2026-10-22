const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync('torneios/decklist-builder/script.js', 'utf8');
const body = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));

test('Editor clears previous cards before loading another list and consumes the import flag once', async () => {
    const url = new URL('https://example.test/?decklistId=42&openImport=1#builder');
    let imports = 0;
    const app = vm.createContext({
        URL,
        URLSearchParams,
        window: {
            location: url,
            history: {
                state: null,
                replaceState(_state, _unused, href) {
                    url.href = href;
                }
            }
        },
        context: {},
        entries: [{ code: 'OLD', count: 4 }],
        cardHydrationToken: 0,
        closeImportModal() {},
        closeSaveWarningModal() {},
        setSaveStatus() {},
        render() {},
        renderContextMeta() {},
        openImportModal() {
            imports++;
        },
        loadExistingDecklist: async () => {
            assert.equal(app.entries.length, 0);
        }
    });
    vm.runInContext(
        body('async function applyContextFromQuery()', 'function renderContextMeta('),
        app
    );
    await app.applyContextFromQuery();
    assert.equal(app.context.decklistId, '42');
    assert.equal(app.context.resultId, '');
    assert.equal(imports, 1);
    assert.equal(url.searchParams.has('openImport'), false);
    await app.applyContextFromQuery();
    assert.equal(imports, 1);
    url.searchParams.set('resultId', 'tournament-result');
    await app.applyContextFromQuery();
    assert.equal(app.context.resultId, 'tournament-result');
    assert.equal(app.context.decklistId, '');
});

test('Editor atomically replaces cards after metadata succeeds, and surfaces failure without a separate delete', async () => {
    const calls = [];
    let metadataFails = false;
    const app = vm.createContext({
        SUPABASE_URL: 'https://example.test',
        headers: { Authorization: 'anon' },
        ensureDecklistRow: async () => 42,
        upsertDecklistCardMetadata: async () => {
            if (metadataFails) throw new Error('Metadata failed');
        },
        normalizeDeckCode: (code) => code,
        getMaxCopies: () => 4,
        fetch: async (url, options) => {
            calls.push({ url, options });
            return { ok: true };
        }
    });
    vm.runInContext(
        body(
            'async function saveDecklistStructured(',
            'async function upsertDecklistCardMetadata('
        ),
        app
    );
    assert.equal(await app.saveDecklistStructured('', [{ code: 'BT1-010', count: 4 }]), true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /rpc\/replace_decklist_cards$/);
    assert.deepEqual(JSON.parse(calls[0].options.body), {
        p_decklist_id: 42,
        p_cards: [{ position: 1, card_code: 'BT1-010', qty: 4 }]
    });
    metadataFails = true;
    await assert.rejects(app.saveDecklistStructured('', []), /Metadata failed/);
    assert.equal(calls.length, 1);
    app.context = { decklistId: '42' };
    vm.runInContext(
        body('async function patchDecklistLegacy(', 'function serializeDecklist('),
        app
    );
    await app.patchDecklistLegacy('', '4 BT1-010');
    assert.equal(calls.length, 1);
});
