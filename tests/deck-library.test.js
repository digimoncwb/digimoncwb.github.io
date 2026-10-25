const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');

function model() {
    const context = vm.createContext({});
    for (const file of ['catalog-service.ts', 'deck-library.ts']) {
        const source = stripTypeScriptTypes(readFileSync(`frontend/apps/workspace/${file}`, 'utf8'))
            .replace(/^import .*?;\s*/gms, '')
            .replace(/\bexport /g, '');
        vm.runInContext(source, context);
    }
    return context;
}
const event = (id, date, format = 'EX13') => ({
    id,
    storeId: '1',
    store: 'Loja',
    isoDate: date,
    date,
    title: 'Semanal',
    format
});
const row = (id, tournament, name, deck, list = false) => ({
    id,
    tournament_id: tournament,
    player: { name },
    deck: { name: deck },
    decklists: list ? [{ id }] : []
});
const empty = {
    query: '',
    store: '',
    format: '',
    date: '',
    tournament: '',
    tournamentId: '',
    status: '',
    sort: ''
};

test('Community and personal libraries preserve their search/format filters and never expose another owners decks', () => {
    const api = model();
    const decks = [
        { id: 1, name: 'Alpha', deck_format_id: 1, owner_user_id: 'a' },
        { id: 2, name: 'Alpha Beta', deck_format_id: 2, owner_user_id: 'b' },
        { id: 3, name: 'Gamma', deck_format_id: 1, owner_user_id: null }
    ];
    const filter = (filters) =>
        Array.from(
            api.filterCommunityDecks(decks, { query: '', format: '', mine: false, ...filters }),
            (row) => row.id
        );
    assert.deepEqual(filter({}), [1, 2, 3]);
    assert.deepEqual(filter({ mine: true, userId: 'a' }), [1]);
    assert.deepEqual(filter({ mine: true, userId: 'b', format: '1' }), []);
    assert.deepEqual(filter({ mine: true }), []);
    assert.deepEqual(filter({ query: 'alpha', format: '2' }), [2]);
    assert.deepEqual(filter({ mine: true, userId: 'a', query: 'gamma' }), []);
});

test('Deck claim loading requests only the current users deck ownership requests', async () => {
    const api = model();
    const calls = [];
    api.readRows = async (path, signal) => {
        calls.push({ path, signal });
        return [{ id: 'request', decklist_id: 42, status: 'pending' }];
    };
    assert.equal((await api.loadMyDeckClaims('')).length, 0);
    assert.equal(calls.length, 0);
    const claims = await api.loadMyDeckClaims('account-a');
    assert.equal(claims[0].status, 'pending');
    assert.ok(calls[0].path.includes('user_id=eq.account-a'));
    assert.ok(calls[0].path.includes('request_type=eq.deck_claim'));
    assert.ok(calls[0].path.includes('decklist_id,status'));
});

test('Quick author edits patch only authorship and revision while protecting community decks from stale updates', async () => {
    const api = model();
    const deck = { id: 42, updated_at: '2026-10-25T12:00:00.123456+00:00' };
    for (const creatorId of ['player-id', '']) {
        const calls = [];
        api.request = async (path, options = {}) => {
            calls.push({ path, options });
            return options.method === 'PATCH'
                ? [
                      {
                          id: 42,
                          creator_player_id: creatorId || null,
                          creator: creatorId ? { name: 'Lukas' } : null,
                          updated_at: '2026-10-25T13:00:00Z'
                      }
                  ]
                : [{ draft_revision: 7, updated_at: deck.updated_at }];
        };
        const updated = await api.updateLibraryDeckAuthor(deck, creatorId);
        assert.equal(updated.creator_player_id, creatorId || null);
        assert.equal(calls.length, 2);
        assert.ok(
            calls.every((call) => call.path.includes('id=eq.42&tournament_result_id=is.null'))
        );
        assert.ok(calls[1].path.includes('draft_revision=eq.7'));
        assert.ok(calls[1].path.includes(`updated_at=eq.${encodeURIComponent(deck.updated_at)}`));
        assert.equal(calls[1].options.headers.Prefer, 'return=representation');
        const payload = JSON.parse(calls[1].options.body);
        assert.equal(payload.creator_player_id, creatorId || null);
        assert.equal(payload.draft_revision, 8);
        assert.deepEqual(Object.keys(payload).sort(), [
            'creator_player_id',
            'draft_revision',
            'updated_at'
        ]);
    }
});

test('Quick author editing reports missing decks and concurrent changes instead of overwriting them', async () => {
    const api = model();
    const deck = { id: 42, updated_at: '2026-10-25T12:00:00Z' };
    let calls = 0;
    api.request = async () => {
        calls++;
        return [];
    };
    await assert.rejects(api.updateLibraryDeckAuthor(deck, 'player'), /não encontrado/);
    assert.equal(calls, 1);
    api.request = async () => [{ draft_revision: 8, updated_at: '2026-10-25T13:00:00Z' }];
    await assert.rejects(api.updateLibraryDeckAuthor(deck, 'player'), /alterado/);
    api.request = async (_path, options = {}) =>
        options.method === 'PATCH' ? [] : [{ draft_revision: 8, updated_at: deck.updated_at }];
    await assert.rejects(api.updateLibraryDeckAuthor(deck, 'player'), /alterado/);
    api.request = async () => {
        throw new Error('Sem permissão');
    };
    await assert.rejects(api.updateLibraryDeckAuthor(deck, 'player'), /Sem permissão/);
});
test('List point totals count every copy and Digi-Egg, use zero for unlisted cards, and stay absent for unscored formats', () => {
    const api = model();
    const cards = [
        { card_code: 'EX8-012', qty: 3, position: 1 },
        { card_code: 'BT15-003', qty: 1, position: 2 },
        { card_code: 'EX13-001', qty: 4, position: 3 }
    ];
    assert.equal(
        api.listPoints(cards, {
            points_limit: 100,
            card_points: {
                'EX8-012': { name: 'Growlmon', points: 30 },
                'BT15-003': { name: 'Nyaromon', points: 90 }
            }
        }),
        180
    );
    assert.equal(
        api.listPoints(cards, {
            points_limit: 100,
            card_points: { 'EX8-012': { name: 'Growlmon', points: 30 } }
        }),
        90
    );
    assert.equal(api.listPoints([], { points_limit: 100 }), 0);
    assert.equal(api.listPoints(cards, {}), null);
});
test('Library point summaries load in a batch and prefer draft quantities, including an intentionally empty draft', async () => {
    const api = model();
    const requests = [];
    api.readRows = async (path) => {
        requests.push(path);
        return [
            {
                id: 1,
                draft_cards: [{ code: 'EX8-012', qty: 3 }],
                cards: [{ card_code: 'EX8-012', qty: 1, position: 1 }]
            },
            { id: 2, draft_cards: [], cards: [{ card_code: 'EX8-012', qty: 1, position: 1 }] },
            { id: 3, draft_cards: null, cards: [{ card_code: 'EX8-012', qty: 2, position: 1 }] }
        ];
    };
    const result = await api.loadLibraryCardLists([1, 2, 3]);
    assert.equal(requests.length, 1);
    assert.match(requests[0], /id=in\.\(1,2,3\)/);
    assert.equal(result['1'][0].qty, 3);
    assert.equal(result['2'].length, 0);
    assert.equal(result['3'][0].qty, 2);
});

test('Recent tournaments keep each event together and order its players by placement', () => {
    const api = model();
    const ranked = (id, tournament, placement) => ({ ...row(id, tournament, id, ''), placement });
    const indexed = api.participationRows(
        [
            ranked('alpha', '20', 3),
            ranked('zulu', '20', 1),
            ranked('middle', '20', 2),
            ranked('same-day', '10', 1),
            ranked('older', '99', 1),
            ranked('unranked', '20', null)
        ],
        [event('20', '2026-10-21'), event('10', '2026-10-21'), event('99', '2026-10-20')]
    );
    const ids = (sort) =>
        Array.from(
            api.filterParticipations(indexed, { ...empty, sort }).items,
            (item) => item.row.id
        );
    assert.deepEqual(ids(''), ['zulu', 'middle', 'alpha', 'unranked', 'same-day', 'older']);
    assert.deepEqual(ids('recent'), ids(''));
    assert.deepEqual(ids('oldest'), ['older', 'same-day', 'zulu', 'middle', 'alpha', 'unranked']);
    assert.deepEqual(ids('player'), ['alpha', 'middle', 'older', 'same-day', 'unranked', 'zulu']);
});

test('Library counts precede availability and pagination, combining accent-insensitive searches and formats', () => {
    const api = model();
    const indexed = api.participationRows(
        [
            row('1', 'a', 'João', 'Dragão', true),
            row('2', 'a', 'Maria', 'Dragão'),
            row('3', 'b', 'Ana', 'Dragão', true)
        ],
        [event('a', '2026-10-20'), event('b', '2026-10-19', 'BT26')]
    );
    const filtered = api.filterParticipations(indexed, {
        ...empty,
        query: 'dragao',
        format: 'EX13',
        status: 'missing'
    });
    assert.equal(filtered.total, 2);
    assert.equal(filtered.withList, 1);
    assert.equal(filtered.withoutList, 1);
    assert.equal(filtered.items.length, 1);
    assert.equal(filtered.items[0].row.id, '2');
    assert.equal(
        api.filterParticipations(indexed, {
            ...empty,
            query: 'joao',
            tournament: 'semanal',
            date: '2026-10-20',
            store: 'Loja',
            tournamentId: 'a'
        }).items.length,
        1
    );
    assert.equal(api.paginate(filtered.items, 8, 20).page, 1);
});

test('Library excludes ambiguous legacy results and sorts deterministically without changing the source', () => {
    const api = model();
    const legacy = {
        ...row('legacy', null, 'Legacy', 'Deck'),
        tournament_date: '2026-10-20',
        store_id: 1,
        decklist: '4 BT1-001'
    };
    assert.equal(
        api.participationRows([legacy], [event('a', '2026-10-20'), event('b', '2026-10-20')])
            .length,
        0
    );
    assert.equal(api.participationRows([legacy], [event('a', '2026-10-20')])[0].hasList, true);
    const items = api.participationRows(
        [row('z', 'a', 'Zé', ''), row('b', 'b', 'Bia', ''), row('a', 'b', 'Ana', '')],
        [event('a', '2026-10-20'), event('b', '2026-10-19')]
    );
    const ids = (sort) =>
        Array.from(
            api.filterParticipations(items, { ...empty, sort }).items,
            (item) => item.row.id
        );
    assert.deepEqual(ids(''), ['z', 'a', 'b']);
    assert.deepEqual(ids('oldest'), ['a', 'b', 'z']);
    assert.deepEqual(ids('player'), ['a', 'b', 'z']);
    assert.equal(items[0].row.id, 'z');
    assert.equal(api.legacyCards('4 BT1-001\n2x EX13-010\nhttps://example.test')[1].qty, 2);
});
