const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const Response = globalThis.Response;
function setup(respond) {
    const calls = [];
    const sandbox = {
        URL,
        Response,
        AbortController,
        window: {
            APP_CONFIG: { SUPABASE_URL: 'https://api.test' },
            createSupabaseHeaders: (extra) => ({ Authorization: 'current-session', ...extra })
        },
        fetch: async (url, options) => {
            calls.push({ url, options });
            return respond(url, options, calls.length);
        }
    };
    const source = stripTypeScriptTypes(
        fs.readFileSync('frontend/apps/workspace/catalog-service.ts', 'utf8')
    )
        .replace(/^import .*;$/gm, '')
        .replace(/export /g, '');
    vm.runInNewContext(
        source +
            '\nthis.api={paginate,normalizeSearch,readRows,loadPlayers,savePlayer,setActivity,loadDecks,loadDecklistIds,loadHistory,saveDeck,loadTournamentResults,orderedDeckColors,loadBuilderResults};',
        sandbox
    );
    return { ...sandbox, calls };
}
const json = (value, status = 200) =>
    new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });

test('builder result query uses existing result columns and includes saved lists', async () => {
    const schema = fs.readFileSync('database/schema.latest.sql', 'utf8');
    const table = schema.match(
        /CREATE TABLE IF NOT EXISTS "public"\."tournament_results" \(([\s\S]*?)\n\);/
    )[1];
    const columns = [...table.matchAll(/^\s+"([^"]+)" /gm)].map((match) => match[1]);
    const { api, calls } = setup(() => json([]));
    await api.loadBuilderResults();
    const url = new URL(calls[0].url);
    const selection = url.searchParams.get('select');
    const fields = selection
        .replace(/[a-z_]+(?::[a-z_]+)?\([^)]*\),?/g, '')
        .split(',')
        .filter(Boolean)
        .filter((field) => !field.includes(':') && !field.includes('(') && !field.includes(')'));
    for (const field of fields)
        assert.ok(columns.includes(field), `Unknown result column: ${field}`);
    assert.ok(selection.includes('decklists(id)'));
    assert.equal(url.searchParams.get('limit'), '500');
});

test('color dots follow the supplied primary/secondary order rather than the system palette', () => {
    const { api } = setup(() => json([]));
    assert.deepEqual(
        Array.from(api.orderedDeckColors('g,b'), (color) => color.label),
        ['Verde', 'Preto']
    );
    assert.deepEqual(
        Array.from(api.orderedDeckColors('b,g'), (color) => color.label),
        ['Preto', 'Verde']
    );
    assert.deepEqual(
        Array.from(api.orderedDeckColors(' u, y, u,unknown'), (color) => color.code),
        ['u', 'y']
    );
    assert.equal(api.orderedDeckColors('p').length, 1);
});
test('catalog pagination clamps the page after filtering and handles empty lists', () => {
    const { api } = setup(() => json([]));
    const items = Array.from({ length: 21 }, (_, index) => index);
    const page = api.paginate(items, 7, 20);
    assert.equal(page.page, 2);
    assert.deepEqual(Array.from(page.items), [20]);
    assert.equal(page.start, 21);
    assert.equal(api.paginate([], 3, 20).start, 0);
    assert.equal(api.normalizeSearch('  ÁLEX  '), 'alex');
});
test('catalog reads beyond the API row limit and passes through cancellation', async () => {
    const app = setup((_url, _options, call) =>
        json(call === 1 ? Array.from({ length: 500 }, (_, id) => ({ id })) : [{ id: 500 }])
    );
    const controller = new AbortController();
    const players = await app.api.loadPlayers(controller.signal);
    assert.equal(players.length, 501);
    assert.match(app.calls[1].url, /offset=500/);
    assert.equal(app.calls[0].options.signal, controller.signal);
});
test('player saves trim fields, retain missing aliases as null and use fresh authorization', async () => {
    const app = setup(() => new Response(null, { status: 204 }));
    await app.api.savePlayer({ id: 'a/b', name: ' Ana ', bandai_nick: '  Nick  ', bandai_id: '' });
    const call = app.calls[0];
    assert.equal(call.options.method, 'PATCH');
    assert.match(call.url, /id=eq.a%2Fb/);
    assert.deepEqual(JSON.parse(call.options.body), {
        name: 'Ana',
        bandai_nick: 'Nick',
        bandai_id: null,
        digilab_name: null
    });
    assert.equal(call.options.headers.Authorization, 'current-session');
    await assert.rejects(app.api.savePlayer({ name: 'A' }), /pelo menos dois/);
    assert.equal(app.calls.length, 1);
});
test('inactivation preserves historical records and permission failures stay visible', async () => {
    const app = setup(() => json({}, 403));
    await assert.rejects(app.api.setActivity('players', 12, false), /permissão/);
    assert.equal(app.calls[0].options.method, 'PATCH');
    assert.deepEqual(JSON.parse(app.calls[0].options.body), { is_active: false });
});
test('decklist filters accept the available legacy source and never mask total failure', async () => {
    const app = setup((url) => (url.includes('!inner') ? json({}, 404) : json([{ deck_id: 7 }])));
    assert.equal((await app.api.loadDecklistIds()).has('7'), true);
    const failed = setup(() => json({}, 500));
    await assert.rejects(failed.api.loadDecklistIds(), /Não foi possível consultar/);
});
test('deck catalog joins images by identity and derives formats from event results', async () => {
    const app = setup((url) =>
        json(
            url.includes('deck_images')
                ? [{ deck_id: 2, image_url: 'https://img.test/BT26-001.webp' }]
                : [{ id: 2, name: 'Deck A', colors: 'r' }]
        )
    );
    const rows = await app.api.loadDecks({
        data: {
            getSnapshot: () => ({
                data: { events: [{ format: 'BT26', results: [{ deck: 'Deck A' }] }] }
            })
        }
    });
    assert.equal(rows[0].code, 'BT26-001');
    assert.equal(rows[0].formats[0], 'BT26');
});
test('decks prioritize recent formats over names, with unused decks last', async () => {
    const app = setup((url) =>
        json(
            url.includes('deck_images')
                ? []
                : [
                      { id: 1, name: 'A antigo' },
                      { id: 2, name: 'Z atual' },
                      { id: 3, name: 'B atual' },
                      { id: 4, name: 'Sem uso' }
                  ]
        )
    );
    const rows = await app.api.loadDecks({
        data: {
            getSnapshot: () => ({
                data: {
                    formats: [
                        { code: 'EX13', is_default: true, created_at: '2026-10-01' },
                        { code: 'BT26', created_at: '2026-09-01' }
                    ],
                    events: [
                        {
                            format: 'BT26',
                            isoDate: '2026-09-30',
                            results: [{ deck: 'A antigo' }, { deck: 'Z atual' }]
                        },
                        {
                            format: 'EX13',
                            isoDate: '2026-10-05',
                            results: [{ deck: 'Z atual' }, { deck: 'B atual' }]
                        }
                    ]
                }
            })
        }
    });
    assert.equal(rows.map((row) => row.name).join(','), 'B atual,Z atual,A antigo,Sem uso');
    assert.equal(rows[1].formats.join(','), 'EX13,BT26');
});

test('deck saves validate duplicates and delegate to the existing image upload implementation', async () => {
    const app = setup(() => json([]));
    const saved = [];
    app.window.digistatsDeckMutations = { create: async (...args) => saved.push(args) };
    const scripts = [];
    await app.api.saveDeck(
        { loadScript: async (path) => scripts.push(path) },
        { name: ' Novo deck ', code: 'bt26-001', colors: 'r' },
        false
    );
    assert.equal(scripts[0], 'decks/create-deck/modal.js');
    assert.equal(saved[0][2], 'Novo deck');
    assert.equal(saved[0][3], 'BT26-001');
    const duplicate = setup(() => json([{ id: 1 }]));
    await assert.rejects(
        duplicate.api.saveDeck({}, { name: 'Deck A', code: 'BT26-001' }, false),
        /Já existe/
    );
});
test('tournament details retain legacy results only when the store/date identifies one event', async () => {
    const app = setup((url) =>
        json(
            url.includes('is.null')
                ? [
                      { id: 'older', placement: 2 },
                      { id: 'linked', placement: 1 }
                  ]
                : [{ id: 'linked', placement: 1 }]
        )
    );
    const event = { id: '9', storeId: '3', isoDate: '2026-10-02' };
    const rows = await app.api.loadTournamentResults(event, [event]);
    assert.deepEqual(
        Array.from(rows, (row) => row.id),
        ['linked', 'older']
    );
    const ambiguous = setup(() => json([{ id: 'linked', placement: 1 }]));
    await ambiguous.api.loadTournamentResults(event, [event, { ...event, id: '10' }]);
    assert.equal(ambiguous.calls.length, 1);
    assert.match(ambiguous.calls[0].url, /tournament_id=eq.9/);
});

test('team results keep both result IDs ordered by placement and member', async () => {
    const app = setup(() =>
        json([
            { id: 'second-b', placement: 2, team_member: 2 },
            { id: 'first-b', placement: 1, team_member: 2 },
            { id: 'second-a', placement: 2, team_member: 1 },
            { id: 'first-a', placement: 1, team_member: 1 }
        ])
    );
    const event = { id: '9', storeId: '3', isoDate: '2026-10-02', team: true };
    const rows = await app.api.loadTournamentResults(event, [event, { ...event, id: '10' }]);
    assert.deepEqual(
        Array.from(rows, (row) => row.id),
        ['first-a', 'first-b', 'second-a', 'second-b']
    );
    const query = new URL(app.calls[0].url).searchParams;
    assert.ok(query.get('select').split(',').includes('team_member'));
    assert.equal(query.get('order'), 'placement.asc,team_member.asc');
});
