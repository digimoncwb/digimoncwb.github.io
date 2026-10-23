const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const { paginateTournamentWeeks } = vm.runInNewContext(
    stripTypeScriptTypes(
        readFileSync('frontend/apps/workspace/tournament-weeks.ts', 'utf8')
    ).replace(/export /g, '') + '\n({paginateTournamentWeeks})'
);
test('Tournament weeks run Monday–Sunday across year boundaries without changing input order', () => {
    const events = ['2026-01-04', '2025-12-29', '2026-01-05', '2025-12-28'].map((isoDate, id) => ({
        isoDate,
        id
    }));
    const original = JSON.stringify(events);
    const result = paginateTournamentWeeks(events, 1, 20);
    assert.deepEqual(
        Array.from(result.weeks, (week) => week.start),
        ['2026-01-05', '2025-12-29', '2025-12-22']
    );
    assert.equal(result.weeks[1].end, '2026-01-04');
    assert.deepEqual(
        Array.from(result.weeks[1].events, (event) => event.id),
        [0, 1]
    );
    assert.equal(JSON.stringify(events), original);
});
test('Pagination never splits a week, including a week larger than the page target', () => {
    const events = [
        '2026-10-20',
        '2026-10-19',
        '2026-10-15',
        '2026-10-14',
        '2026-10-13',
        '2026-10-12',
        '2026-10-06'
    ].map((isoDate, id) => ({ isoDate, id }));
    const pages = [1, 2, 3].map((page) => paginateTournamentWeeks(events, page, 3));
    assert.deepEqual(
        pages.map((page) => [page.start, page.end]),
        [
            [1, 2],
            [3, 6],
            [7, 7]
        ]
    );
    assert.ok(pages.every((page) => page.totalPages === 3));
    assert.deepEqual(
        pages.flatMap((page) =>
            Array.from(page.weeks).flatMap((week) => Array.from(week.events, (event) => event.id))
        ),
        events.map((event) => event.id)
    );
});
test('Filtered and empty tournament collections clamp pagination and report the actual range', () => {
    const empty = paginateTournamentWeeks([], 99, 20);
    assert.equal(empty.page, 1);
    assert.equal(empty.totalPages, 1);
    assert.equal(empty.start, 0);
    assert.equal(empty.end, 0);
    const filtered = paginateTournamentWeeks([{ isoDate: '2026-10-20' }], 99, 20);
    assert.equal(filtered.page, 1);
    assert.equal(filtered.start, 1);
    assert.equal(filtered.end, 1);
});
