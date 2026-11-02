const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    normalize,
    readAll,
    weekStart,
    weekEnd,
    validImage
} = require('../shared/data/tournaments.js');

test('community results retain their organizer and do not require a fictitious store', () => {
    const events = normalize({
        stores: [],
        formats: [{ id: 1, code: 'EX13' }],
        tournaments: [
            {
                id: 1,
                store_id: null,
                organizer_name: 'Digimon CWB',
                format_id: 1,
                tournament_date: '2026-11-01',
                total_players: 4
            }
        ],
        results: [
            {
                id: 'r1',
                tournament_id: 1,
                store_id: null,
                placement: 1,
                player: 'Player',
                deck: 'Deck'
            }
        ]
    });
    assert.equal(events[0].storeId, '');
    assert.equal(events[0].store, 'Digimon CWB');
    assert.equal(events[0].winner.name, 'Player');
});

test('V2 joins results by tournament ID and never mixes same-day events', () => {
    const data = {
        stores: [{ id: 'store', name: 'Loja real', logo_url: 'https://example.com/logo.png' }],
        formats: [{ id: 'format', code: 'BT26' }],
        tournaments: [
            {
                id: 'a',
                store_id: 'store',
                tournament_date: '2026-10-02',
                format_id: 'format',
                total_players: 8
            },
            {
                id: 'b',
                store_id: 'store',
                tournament_date: '2026-10-02',
                format_id: 'format',
                total_players: 4
            },
            { id: 'c', store_id: 'store', tournament_date: '2026-10-01', format_id: 'format' }
        ],
        results: [
            { id: 1, tournament_id: 'a', placement: 1, player: 'A', deck: 'Deck A' },
            { id: 2, tournament_id: 'b', placement: 3, player: 'B', deck: 'Deck B' },
            {
                id: 3,
                tournament_id: null,
                store_id: 'store',
                tournament_date: '2026-10-02',
                placement: 1,
                player: 'Ambiguous',
                deck: 'Unknown'
            },
            {
                id: 4,
                tournament_id: null,
                store_id: 'store',
                tournament_date: '2026-10-01',
                placement: 1,
                player: 'Legacy',
                deck: 'Deck C'
            }
        ]
    };
    const events = normalize(data);
    assert.equal(events.find((event) => event.id === 'a').winner.name, 'A');
    const second = events.find((event) => event.id === 'b');
    assert.equal(second.winner, null);
    assert.equal(second.podium[1], null);
    assert.equal(second.podium[2].name, 'B');
    assert.equal(second.results.length, 1);
    assert.equal(events.find((event) => event.id === 'c').winner.name, 'Legacy');
    assert.equal(events[0].format, 'BT26');
    assert.equal(events[0].day, 'SEX');
});

test('V2 paginates all results beyond the REST page limit', async () => {
    const calls = [];
    const result = await readAll('v_podium_full', 'id', async (path) => {
        const query = new URL(path, 'https://example.com').searchParams;
        const offset = Number(query.get('offset'));
        calls.push(offset);
        return {
            ok: true,
            json: async () =>
                Array.from({ length: offset === 0 ? 500 : 2 }, (_, i) => ({ id: offset + i }))
        };
    });
    assert.deepEqual(calls, [0, 500]);
    assert.equal(result.length, 502);
    assert.equal(result[501].id, 501);
});

test('V2 surfaces API failure instead of substituting synthetic data', async () => {
    await assert.rejects(
        readAll('tournament', 'id', async () => ({ ok: false, status: 503 })),
        /HTTP 503/
    );
});

test('V2 weeks cross month/year boundaries and reject unsafe image schemes', () => {
    assert.equal(weekStart('2026-10-04'), '2026-09-28');
    assert.equal(weekEnd('2026-09-28'), '2026-10-04');
    assert.equal(weekStart('2027-01-01'), '2026-12-28');
    assert.equal(weekEnd('2026-12-28'), '2027-01-03');
    assert.equal(validImage('javascript:alert(1)'), '');
    assert.equal(validImage(null), '');
    assert.equal(validImage('https://example.com/card.webp'), 'https://example.com/card.webp');
});
