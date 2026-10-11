const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function renderer() {
    return vm.runInNewContext(
        readFileSync('shared/posts/renderer.js', 'utf8').replace(/export /g, '') +
            '\n({ renderPost, teamStandingsPages })',
        { Path2D: class {} }
    );
}
const results = Array.from({ length: 36 }, (_, index) => ({
    id: String(index),
    placement: Math.floor(index / 2) + 1,
    name: `Jogador Nome Completo ${index + 1}`,
    deck: index === 0 ? 'DATA SQUAD ShineGreymon' : `Deck ${index + 1}`,
    image: ''
}));
const event = {
    id: 'teams',
    team: true,
    title: '2v2',
    results,
    isoDate: '2026-10-10',
    players: 36,
    format: 'EX13',
    store: 'Loja',
    winner: results[0]
};

test('standings paginate every team in placement order without splitting or duplicating teammates', () => {
    const { teamStandingsPages } = renderer();
    const pages = teamStandingsPages({ ...event, results: [...results].reverse() });
    assert.deepEqual(
        Array.from(pages, (page) => page.length),
        [9, 9]
    );
    assert.deepEqual(
        Array.from(pages.flat(), (team) => team.placement),
        Array.from({ length: 18 }, (_, index) => index + 1)
    );
    assert.ok(
        pages
            .flat()
            .every(
                (team) =>
                    team.members.length === 2 &&
                    team.members.every((member) => member.placement === team.placement)
            )
    );
    assert.equal(
        new Set(
            pages.flatMap((page) => page.flatMap((team) => team.members.map((member) => member.id)))
        ).size,
        36
    );
    assert.equal(teamStandingsPages({ ...event, team: false }).length, 0);
    assert.equal(teamStandingsPages({ ...event, results: [] }).length, 0);
    assert.equal(teamStandingsPages({ ...event, results: results.slice(0, 18) }).length, 1);
});

test('standings paint both full names, decks and placement on every page within the feed canvas', async () => {
    const { renderPost } = renderer();
    const allNames = [],
        allDecks = [];
    for (let page = 0; page < 2; page++) {
        const texts = [],
            circles = [],
            panels = [];
        const ctx = new Proxy(
            {
                measureText: (text) => ({
                    width: String(text).length * 10,
                    actualBoundingBoxAscent: 24,
                    actualBoundingBoxDescent: 3
                }),
                fillText(text, x, y, width) {
                    texts.push({ text, x, y, width, font: this.font, color: this.fillStyle });
                },
                arc: (...args) => circles.push(args),
                roundRect: (...args) => panels.push(args)
            },
            { get: (target, key) => (key in target ? target[key] : () => {}) }
        );
        const canvas = { width: 0, height: 0, getContext: () => ctx };
        assert.ok(
            (
                await renderPost(
                    canvas,
                    { template: 'teams', tournament: 'teams', page, accent: '#ef646b' },
                    [event],
                    '',
                    () => true
                )
            ).ready
        );
        assert.equal(canvas.width, 1080);
        assert.equal(canvas.height, 1350);
        const count = 9;
        assert.equal(panels.length, count);
        const portraits = circles.filter((circle) => circle[2] === 40);
        assert.equal(portraits.length, count * 2);
        for (let index = 0; index < portraits.length; index += 2) {
            assert.equal(portraits[index][1], portraits[index + 1][1], 'teammates share a row');
            assert.ok(portraits[index][0] < portraits[index + 1][0]);
        }
        const names = texts.filter((row) => row.text.startsWith('Jogador Nome Completo'));
        assert.equal(texts.filter((row) => row.text === 'DECKS / PLAYERS').length, 1);
        for (let index = 0; index < names.length; index += 2) {
            assert.equal(names[index].y, names[index + 1].y);
            assert.ok(names[index].x + names[index].width < names[index + 1].x);
        }
        assert.ok(texts.some((row) => row.text === `PAGE ${page + 1} / 2`));
        assert.ok(texts.some((row) => row.text === '10/Oct' && row.x === 1008 && row.y < 150));
        assert.ok(
            texts.some((row) => row.text === 'EX13 · 36 PLAYERS' && row.x === 1008 && row.y < 150)
        );
        assert.ok(texts.some((row) => row.text === 'DIGIMON CWB'));
        assert.ok(texts.every((row) => row.y < 1350));
        panels.forEach((panel) => assert.ok(panel[1] + panel[3] < 1240));
        texts
            .filter((row) => row.text.startsWith('Jogador Nome Completo'))
            .forEach((row) => {
                const memberIndex = Number(row.text.split(' ').at(-1)) - 1;
                assert.match(row.font, memberIndex < 6 ? /^700 / : /^600 /);
                allNames.push(row.text);
            });
        texts
            .filter((row) => row.text.startsWith('Deck '))
            .forEach((row) => {
                const memberIndex = Number(row.text.split(' ').at(-1)) - 1;
                if (memberIndex >= 6) {
                    assert.match(row.font, /^800 /);
                    assert.equal(row.color, '#b9bec5');
                }
            });
        allDecks.push(
            ...texts
                .filter((row) => row.text.startsWith('Deck ') || row.text === 'DATS Shine')
                .map((row) => row.text)
        );
    }
    assert.deepEqual(
        allNames,
        results.map((member) => member.name)
    );
    assert.equal(allDecks.length, 36);
    assert.ok(allDecks.includes('DATS Shine'));
});

test('standings cannot render a solo event or a page outside the tournament', async () => {
    const { renderPost } = renderer();
    for (const [selected, page] of [
        [{ ...event, team: false }, 0],
        [event, 2]
    ]) {
        assert.equal(
            (
                await renderPost(
                    {},
                    { template: 'teams', tournament: 'teams', page },
                    [selected],
                    '',
                    () => true
                )
            ).ready,
            false
        );
    }
});
