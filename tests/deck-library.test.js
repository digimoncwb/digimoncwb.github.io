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
