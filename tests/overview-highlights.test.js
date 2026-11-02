const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const source = stripTypeScriptTypes(
    fs.readFileSync('frontend/apps/dashboard/overview-model.ts', 'utf8')
).replace(/export /g, '');
const model = vm.runInNewContext(
    source +
        '\n({featuredDecks,latestWeekTournaments,latestStoreTournaments,overviewWeekEvents,centeredTournamentOrder,tournamentCarouselSlides})'
);

test('imported community tournaments without a store remain visible in the overview', () => {
    const events = [
        {
            id: '2',
            storeId: '',
            organizer: 'Digimon CWB',
            store: 'Digimon CWB',
            isoDate: '2026-11-01'
        },
        {
            id: '1',
            storeId: '',
            organizer: 'Digimon CWB',
            store: 'Digimon CWB',
            isoDate: '2026-10-01'
        }
    ];
    assert.equal(
        model
            .latestStoreTournaments(events, [])
            .map((e) => e.id)
            .join(','),
        '2'
    );
});

test('carousel keeps the newest event per store across all weeks', () => {
    const events = [
        { id: '8', storeId: 'a', store: 'Same name', isoDate: '2026-10-05' },
        { id: '9', storeId: 'a', store: 'Same name', isoDate: '2026-10-05' },
        { id: '4', storeId: 'b', store: 'Same name', isoDate: '2026-09-26' },
        { id: '1', storeId: 'b', store: 'Same name', isoDate: '2026-09-01' },
        ...['c', 'd', 'e', 'f', 'g'].map((storeId, index) => ({
            id: String(10 + index),
            storeId,
            isoDate: '2026-09-20'
        }))
    ];
    const result = model.latestStoreTournaments(events);
    assert.equal(result.map((event) => event.id).join(','), '9,4,14,13,12,11,10');
    assert.equal(result.length, 7, 'stores from older weeks and beyond five slides are retained');
    assert.equal(result.filter((event) => event.id === result[0].id).length, 1);
    assert.equal(events[0].id, '8', 'source order remains unchanged');
    assert.equal(model.latestStoreTournaments([]).length, 0);
});

test('carousel follows the standard weekly store order regardless of tournament dates', () => {
    const stores = [
        { id: 1, name: 'Taverna Game House', is_active: true },
        { id: 2, name: 'Gladiators', is_active: true },
        { id: 3, name: 'Meruru', is_active: true },
        { id: 4, name: 'El-Kubo', is_active: true },
        { id: 5, name: 'Rei das Cartinhas (Celta)', is_active: true }
    ];
    const events = [
        ...[5, 4, 3, 2, 1].map((id) => ({
            id: String(id),
            storeId: String(id),
            store: 'Other label',
            isoDate: `2026-10-0${id}`
        })),
        { id: '6', storeId: '1', isoDate: '2026-09-01' }
    ];
    const result = model.latestStoreTournaments(events, stores);
    assert.equal(result.map((event) => event.storeId).join(','), '1,2,3,4,5');
    assert.equal(result[0].id, '1', 'Taverna keeps its newest tournament');
    assert.equal(
        model.overviewWeekEvents(events)[0].id,
        '5',
        'NOVO stays with the global newest, even when it is last in the carousel'
    );
});

test('overview takes the globally latest week across formats and retains every event for weekly highlights', () => {
    const events = [
        { id: '1', format: 'EX12', isoDate: '2026-09-03' },
        { id: '2', format: 'BT26', isoDate: '2026-10-01' },
        { id: '3', format: 'EX12', isoDate: '2026-09-29' },
        { id: '4', format: 'BT26', isoDate: '2026-10-02' },
        { id: '5', format: 'EX12', isoDate: '2026-10-02' }
    ];
    const week = model.overviewWeekEvents(events);
    assert.equal(week.map((event) => event.id).join(','), '5,4,2,3');
    assert.equal(week[0].id, '5');
    assert.equal(
        week.some((event) => event.id === '1'),
        false
    );
    assert.equal(new Set(week.map((event) => event.format)).size, 2);
    assert.equal(
        model.overviewWeekEvents(
            Array.from({ length: 7 }, (_, i) => ({ id: String(i), isoDate: '2026-10-01' }))
        ).length,
        7
    );
});

test('carousel excludes inactive stores while NOVO still refers to the global latest tournament', () => {
    const events = [
        { id: '4', storeId: 'inactive', isoDate: '2026-10-06' },
        { id: '3', storeId: '1', isoDate: '2026-10-05' },
        { id: '2', storeId: '1', isoDate: '2026-10-04' },
        { id: '1', storeId: 'missing', isoDate: '2026-10-03' }
    ];
    const stores = [
        { id: 'inactive', name: 'TCGBr', is_active: false },
        { id: 1, name: 'Taverna', is_active: true }
    ];
    const result = model.latestStoreTournaments(events, stores);
    assert.equal(result.map((event) => event.id).join(','), '3');
    const globalLatestId = model.overviewWeekEvents(events)[0].id;
    assert.equal(globalLatestId, '4');
    assert.equal(
        result.some((event) => event.id === globalLatestId),
        false
    );
    assert.equal(model.latestStoreTournaments(events, []).length, 0);
});

test('one tournament stays single, a pair repeats for smooth looping, and larger sets stay unique', () => {
    assert.equal(model.tournamentCarouselSlides([], 0).length, 0);
    assert.equal(model.tournamentCarouselSlides([{ id: 'a' }], 0).length, 1);
    const pair = model.tournamentCarouselSlides([{ id: 'latest' }, { id: 'older' }], 0);
    assert.equal(pair[0].id, 'latest');
    assert.equal(new Set(pair.map((event) => event.id)).size, 2);
    pair.forEach((event, index) => assert.equal(event.id, index % 2 ? 'older' : 'latest'));
    const trio = model.tournamentCarouselSlides([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 0);
    assert.equal(trio.length, 3);
    assert.equal(new Set(trio.map((event) => event.id)).size, 3);
});

test('circular order keeps the latest centered with the oldest on its left, without duplicates', () => {
    const events = [{ id: 'latest' }, { id: 'middle' }, { id: 'oldest' }];
    assert.equal(
        model
            .centeredTournamentOrder(events, 0)
            .map((event) => event.id)
            .join(','),
        'oldest,latest,middle'
    );
    for (const count of [3, 4, 5]) {
        const items = Array.from({ length: count }, (_, index) => ({ id: String(index) }));
        for (let selected = 0; selected < count; selected++) {
            const ordered = model.centeredTournamentOrder(items, selected);
            const middle = Math.floor(count / 2);
            assert.equal(ordered[middle].id, String(selected));
            assert.equal(ordered[middle - 1].id, String((selected - 1 + count) % count));
            assert.equal(ordered[middle + 1].id, String((selected + 1) % count));
            assert.equal(new Set(ordered.map((item) => item.id)).size, count);
        }
    }
});
test('highlights count participations, keep ties and exclude deckless tournaments', () => {
    const events = [
        {
            deckless: false,
            results: [
                { deck: 'A', name: 'Ana', image: 'a.webp' },
                { deck: 'A', name: 'Bia', image: '' }
            ]
        },
        {
            deckless: false,
            results: [
                { deck: 'A', name: 'Ana', image: '' },
                { deck: 'A', name: 'Bia', image: '' }
            ]
        },
        { deckless: true, results: [{ deck: 'A', name: 'Caio' }] }
    ];
    const rows = model.featuredDecks(events);
    assert.equal(rows[0].count, 4);
    assert.equal(rows[0].contributions, 2);
    assert.equal(rows[0].contributors.join(','), 'Ana,Bia');
});
test('the carousel shows at most five events in the latest recorded week and never fills it from older weeks', () => {
    const events = [
        { id: '1', isoDate: '2026-09-27' },
        ...Array.from({ length: 7 }, (_, i) => ({ id: String(i + 2), isoDate: '2026-09-28' }))
    ];
    const result = model.latestWeekTournaments(events);
    assert.equal(result.length, 5);
    assert.equal(result[0].id, '8');
    assert.ok(result.every((event) => event.isoDate === '2026-09-28'));
    assert.equal(
        model.latestWeekTournaments([
            { id: '1', isoDate: '2026-12-31' },
            { id: '2', isoDate: '2027-01-01' }
        ]).length,
        2
    );
    assert.equal(model.latestWeekTournaments([]).length, 0);
});
