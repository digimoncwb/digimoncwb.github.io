const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { normalize } = require('../shared/data/tournaments');
const {
    isTeamTournament,
    resultPlacement,
    validateTeamResults
} = require('../config/tournament-utils');

const members = [
    { name: 'Ana', deck: 'Leopardmon', image: '' },
    { name: 'Bia', deck: 'UlforceVeedramon', image: '' }
];
const team = {
    id: 'team',
    title: '2v2',
    team: true,
    store: 'Loja',
    logo: '',
    isoDate: '2026-10-10',
    day: 'SAB',
    format: 'EX13',
    players: 4,
    winner: { ...members[0], members },
    podium: [{ ...members[0], members }, null, null]
};

test('2v2 pairs placements and requires distinct players with decks', () => {
    assert.ok(isTeamTournament(' 2V2 '));
    assert.ok(!isTeamTournament('Semanal'));
    assert.deepEqual(
        [0, 1, 2, 3].map((index) => resultPlacement(index, '2v2')),
        [1, 1, 2, 2]
    );
    assert.equal(resultPlacement(1, 'Semanal'), 2);
    const rows = [
        { player_id: 'a', deck_id: 'x' },
        { player_id: 'b', deck_id: 'y' }
    ];
    assert.equal(validateTeamResults(rows, '2v2'), '');
    assert.ok(validateTeamResults(rows.slice(0, 1), '2v2'));
    assert.ok(validateTeamResults([rows[0], rows[0]], '2v2'));
    assert.ok(validateTeamResults([rows[0], { player_id: 'b' }], '2v2'));
});

test('2v2 winner and podium keep both members while solo events on the same day stay separate', () => {
    const data = {
        stores: [{ id: 's', name: 'Loja' }],
        formats: [{ id: 1, code: 'EX13' }],
        tournaments: [
            {
                id: 'team',
                tournament_name: '2v2',
                store_id: 's',
                tournament_date: '2026-10-10',
                format_id: 1,
                total_players: 4
            },
            {
                id: 'solo',
                tournament_name: 'Semanal',
                store_id: 's',
                tournament_date: '2026-10-10',
                format_id: 1,
                total_players: 1
            }
        ],
        results: [
            ...members.map((member, index) => ({
                id: index + 1,
                tournament_id: 'team',
                placement: 1,
                player: member.name,
                deck: member.deck
            })),
            { id: 3, tournament_id: 'team', placement: 2, player: 'Caio', deck: 'Deck C' },
            { id: 4, tournament_id: 'team', placement: 2, player: 'Dani', deck: 'Deck D' },
            { id: 5, tournament_id: 'solo', placement: 1, player: 'Solo', deck: 'Deck E' }
        ]
    };
    const events = normalize(data);
    const pair = events.find((event) => event.team);
    assert.equal(pair.winner.name, 'Ana & Bia');
    assert.equal(pair.winner.deck, 'Leopardmon / UlforceVeedramon');
    assert.equal(pair.podium[0].members.length, 2);
    assert.equal(pair.podium[1].name, 'Caio & Dani');
    assert.equal(pair.podium[2], null);
    assert.equal(pair.results.length, 4);
    assert.equal(events.find((event) => !event.team).winner.name, 'Solo');
});

test('daily and weekly 2v2 posts paint both names and both deck circles', async () => {
    const postMembers = [
        { ...members[0], name: 'Ana Souza', deck: 'DATA SQUAD ShineGreymon' },
        { ...members[1], name: '  Bia   Silva  ' }
    ];
    const postTeam = {
        ...team,
        winner: { ...postMembers[0], members: postMembers },
        podium: [{ ...postMembers[0], members: postMembers }, null, null]
    };
    const solo = {
        ...team,
        id: 'solo',
        team: false,
        title: 'Locals',
        winner: { name: 'Caio Silva', deck: 'Data Squad Ravemon', image: '' }
    };
    const renderer = vm.runInNewContext(
        readFileSync('shared/posts/renderer.js', 'utf8').replace(/export /g, '') +
            '\n({ renderPost })',
        { Path2D: class {} }
    );
    for (const template of ['podium', 'weekly']) {
        const texts = [],
            circles = [],
            panels = [],
            textColors = new Map();
        const ctx = new Proxy(
            {
                measureText: (value) => ({
                    width: String(value).length * 8,
                    actualBoundingBoxAscent: 20,
                    actualBoundingBoxDescent: 3
                }),
                fillText(value) {
                    texts.push(value);
                    textColors.set(value, this.fillStyle);
                },
                arc: (...args) => circles.push(args),
                roundRect: (...args) => panels.push(args)
            },
            { get: (target, key) => (key in target ? target[key] : () => {}) }
        );
        const result = await renderer.renderPost(
            { width: 1080, height: 1350, getContext: () => ctx },
            { template, tournament: 'team', week: '2026-10-05', page: 0, accent: '#abcdef' },
            template === 'weekly' ? [postTeam, solo] : [postTeam],
            '',
            () => true
        );
        assert.ok(result.ready);
        assert.equal(postMembers[0].name, 'Ana Souza', 'saved names remain complete');
        if (template === 'weekly') {
            assert.ok(texts.includes('Ana Souza'));
            assert.ok(texts.includes('  Bia   Silva  '));
            assert.ok(texts.includes('DATS Shine'));
            assert.ok(texts.includes('DATS Ravemon'));
            assert.ok(texts.includes('UlforceVeedramon'));
            assert.ok(texts.includes('2v2'));
            assert.ok(texts.includes('Caio Silva'), 'solo posts keep the full player name');
            const portraits = circles.filter((circle) => circle[2] === 49);
            assert.equal(portraits.length, 3, 'both team portraits match the solo portrait size');
            const teamPanel = panels.find((panel) => panel[3] > 126);
            const teamPortraits = portraits.filter(
                (circle) => circle[1] > teamPanel[1] && circle[1] < teamPanel[1] + teamPanel[3]
            );
            assert.equal(teamPortraits.length, 2);
            assert.equal(teamPortraits[0][0], teamPortraits[1][0]);
            assert.ok(teamPortraits[1][1] - teamPortraits[0][1] > 98);
        } else {
            assert.ok(texts.includes('Ana Souza &'));
            assert.ok(texts.includes('Bia   Silva'));
            assert.ok(texts.includes('DATS Shine &'));
            assert.ok(texts.includes('UlforceVeedramon'));
            const portraits = circles.filter((circle) => circle[2] === 125);
            assert.equal(portraits.length, 2);
            assert.equal(portraits[0][1], portraits[1][1]);
            assert.equal(portraits[1][0] - portraits[0][0], 254);
            assert.ok(texts.includes('WINNER'));
            assert.equal(textColors.get('DATS Shine &'), textColors.get('WINNER'));
            assert.equal(textColors.get('UlforceVeedramon'), textColors.get('WINNER'));
            assert.ok(texts.includes('2nd'));
            assert.ok(texts.includes('3rd'));
            assert.equal(panels.length, 0, 'team podium leaves the background visible');
        }
    }
});

test('paired team podium keeps four text lines and touching portraits in a triangle', async () => {
    const renderer = vm.runInNewContext(
        readFileSync('shared/posts/renderer.js', 'utf8').replace(/export /g, '') +
            '\n({ renderPost })',
        { Path2D: class {} }
    );
    const podium = [
        [
            { name: 'Lukas Fujisawa', deck: 'Beelstarmon (3M)' },
            { name: 'Patrick Cavalheiro', deck: 'TS Plutomon' }
        ],
        [
            { name: 'Giovani Barreto', deck: 'DATA SQUAD ShineGreymon' },
            { name: 'Victor Coelho', deck: 'Vulcanusmon' }
        ],
        [
            { name: 'Thiago Almeida', deck: 'DATA SQUAD Ravemon' },
            { name: 'Marcio Braga', deck: 'Millenniummon' }
        ]
    ].map((members) => ({ members }));
    const texts = [],
        circles = [];
    const ctx = new Proxy(
        {
            measureText: (text) => ({
                width: String(text).length * 8,
                actualBoundingBoxAscent: 20,
                actualBoundingBoxDescent: 3
            }),
            fillText(text, x, y, width) {
                texts.push({ text, x, y, width, font: this.font, color: this.fillStyle });
            },
            arc: (...args) => circles.push(args)
        },
        { get: (target, key) => (key in target ? target[key] : () => {}) }
    );
    const result = await renderer.renderPost(
        { width: 1080, height: 1350, getContext: () => ctx },
        {
            template: 'podium',
            tournament: 'team',
            week: '2026-10-05',
            accent: '#ef646b'
        },
        [{ ...team, podium, winner: podium[0] }],
        '',
        () => true
    );
    assert.ok(result.ready);
    const portraits = circles.filter((circle) => circle[2] === 125 || circle[2] === 95);
    assert.equal(portraits.length, 6);
    const centers = [];
    for (let index = 0; index < 6; index += 2) {
        const [left, right] = portraits.slice(index, index + 2);
        assert.equal(left[1], right[1]);
        assert.equal(right[0] - left[0], left[2] + right[2] + 4, 'portrait borders touch');
        centers.push([(left[0] + right[0]) / 2, left[1]]);
    }
    assert.ok(centers[0][1] < centers[1][1]);
    assert.equal(centers[1][1], centers[2][1]);
    assert.ok(centers[1][0] < centers[0][0] && centers[2][0] > centers[0][0]);
    assert.ok(centers[0][1] < 665, 'winning team sits higher than the solo winner');
    const winningNames = texts.find((row) => row.text === 'Patrick Cavalheiro');
    const runnerUpLabel = texts.find((row) => row.text === '2nd');
    assert.match(texts.find((row) => row.text === 'WINNER').font, /^900 75px /);
    assert.match(runnerUpLabel.font, /^900 64px /);
    assert.match(texts.find((row) => row.text === '3rd').font, /^900 64px /);
    assert.ok(runnerUpLabel.y - winningNames.y > 40, 'team names have space above side labels');
    for (const [index, result] of podium.entries()) {
        const lines = result.members.map((member) =>
            member.deck.replace('DATA SQUAD', 'DATS').replace('ShineGreymon', 'Shine')
        );
        lines[0] += ' &';
        lines.push(result.members[0].name + ' &', result.members[1].name);
        const rendered = lines.map((line) => texts.find((row) => row.text === line));
        assert.ok(rendered.every(Boolean));
        assert.ok(rendered.every((row) => row.x === centers[index][0]));
        assert.ok(rendered.every((row, line) => line === 0 || row.y > rendered[line - 1].y));
        assert.equal(rendered[0].font, rendered[1].font);
        assert.equal(rendered[2].font, rendered[3].font);
        assert.match(rendered[2].font, /^700 /);
        assert.match(rendered[3].font, /^700 /);
        const portrait = portraits[index * 2];
        const label = texts.find((row) => row.text === ['WINNER', '2nd', '3rd'][index]);
        assert.ok(portrait[1] - portrait[2] - 2 - label.y >= 24, 'title clears portrait border');
        assert.ok(
            rendered[0].y - 20 - portrait[1] - portrait[2] - 2 >= 24,
            'deck clears portrait border'
        );
        assert.ok(rendered[3].y < 1200, 'four lines fit above the footer');
    }
    const decks = texts.find((row) => row.text === 'DATS Shine &');
    assert.ok(decks);
    assert.equal(decks.color, runnerUpLabel.color);
    assert.ok(texts.every((row) => row.y < 1350));
});

test('posts abbreviate DATA SQUAD consistently without changing the rest of the deck name', () => {
    const { postDeckName } = vm.runInNewContext(
        readFileSync('shared/posts/renderer.js', 'utf8').replace(/export /g, '') +
            '\n({ postDeckName })'
    );
    assert.equal(postDeckName('DATA SQUAD ShineGreymon'), 'DATS Shine');
    assert.equal(
        postDeckName('Data Squad Ravemon & DATA  SQUAD ShineGreymon'),
        'DATS Ravemon & DATS Shine'
    );
    assert.equal(postDeckName('DATS Ravemon'), 'DATS Ravemon');
    assert.equal(postDeckName('Beelstarmon (3M)'), 'Beelstarmon (3M)');
    assert.equal(postDeckName('METADATA SQUAD'), 'METADATA SQUAD');
    assert.equal(postDeckName('ShineGreymon Burst Mode'), 'Shine Burst Mode');
    assert.equal(postDeckName('shinegreymon'), 'Shine');
});

test('weekly pages keep tall team blocks together, preserve chronology and include every event', () => {
    const { weeklyPostPages } = vm.runInNewContext(
        readFileSync('shared/posts/renderer.js', 'utf8').replace(/export /g, '') +
            '\n({ weeklyPostPages })'
    );
    const events = Array.from({ length: 7 }, (_, index) => ({
        id: String(index),
        isoDate: '2026-10-10',
        team: index % 2 === 0
    }));
    const pages = weeklyPostPages([...events].reverse(), '2026-10-05');
    assert.equal(pages.length, 3);
    assert.deepEqual(
        Array.from(pages.flat(), (event) => event.id),
        events.map((event) => event.id)
    );
    for (const page of pages) {
        assert.ok(page.reduce((total, event) => total + (event.team ? 2 : 1), 0) <= 5);
    }
    assert.equal(weeklyPostPages(events, '2026-10-12').length, 0);
    assert.equal(weeklyPostPages(events, '').length, 0);
    assert.equal(
        weeklyPostPages(
            events.map((event) => ({ ...event, team: false })),
            '2026-10-05'
        ).length,
        2
    );
});
