const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
function setup(fetch = async () => ({ ok: true, json: async () => [] })) {
    return vm.runInNewContext(
        stripTypeScriptTypes(fs.readFileSync('frontend/apps/studio/caption.ts', 'utf8'))
            .replace(/^import .*$/gm, '')
            .replace(/export /g, '') +
            '\n({ buildPodiumCaption, buildTeamStandingsCaption, buildWeeklyCaption, loadStandingsUrl, xLength })',
        {
            fetch,
            postDeckName: vm.runInNewContext(
                fs.readFileSync('shared/posts/renderer.js', 'utf8').replace(/export /g, '') +
                    '\npostDeckName'
            ),
            teamStandings: vm.runInNewContext(
                fs.readFileSync('shared/posts/renderer.js', 'utf8').replace(/export /g, '') +
                    '\nteamStandings'
            ),
            eventStandings: vm.runInNewContext(
                fs.readFileSync('shared/posts/renderer.js', 'utf8').replace(/export /g, '') +
                    '\neventStandings'
            ),
            URLSearchParams,
            window: {
                APP_CONFIG: { SUPABASE_URL: 'https://storage.test' },
                createSupabaseHeaders: () => ({ apikey: 'public' })
            }
        }
    );
}
const event = {
    isoDate: '2026-10-05',
    store: 'Taverna Game House',
    format: 'EX13',
    players: 7,
    podium: [
        { deck: 'Jupitermon', name: 'Ana' },
        { deck: 'Data Squad Ravemon', name: 'Bia' },
        { deck: 'Vulcanusmon', name: 'Caio' }
    ]
};

test('team standings captions cover all places with only decks and post abbreviations', () => {
    const results = Array.from({ length: 18 }, (_, index) => ({
        placement: Math.floor(index / 2) + 1,
        name: `Jogador Nome Completo ${index + 1}`,
        deck: index === 17 ? 'DATA SQUAD ShineGreymon' : `Deck ${index + 1}`
    }));
    const caption = setup().buildTeamStandingsCaption({
        ...event,
        team: true,
        players: 18,
        results
    });
    assert.ok(caption.includes('🥇 Deck 1 & Deck 2'));
    assert.ok(!caption.includes('Jogador Nome Completo'));
    assert.ok(setup().xLength(caption) <= 280);
    const listed = caption.split('\n').filter((line) => /^(\d+º|🥇|🥈|🥉) /.test(line)).length;
    assert.ok(listed >= 3 && listed < 9);
    assert.ok(caption.includes(`+${9 - listed} more`));
    assert.ok(caption.endsWith('#DigimonTCG #EX13 #DigimonCWB'));
    const short = setup().buildTeamStandingsCaption({
        ...event,
        team: true,
        players: 6,
        results: results.slice(0, 6)
    });
    assert.ok(short.includes('3º Deck 5 & Deck 6'.replace('3º', '🥉')));
    assert.doesNotMatch(short, /more/);
    assert.ok(!caption.includes('digilab'));
    const solo = setup().buildTeamStandingsCaption({
        ...event,
        results: [
            { placement: 2, deck: 'Data Squad Ravemon', name: 'Bia' },
            { placement: 1, deck: 'Jupitermon', name: 'Ana' }
        ]
    });
    assert.ok(solo.includes('🥇 Jupitermon\n🥈 DATS Ravemon\n'));
    assert.doesNotMatch(solo, /Ana|Bia/);
});
test('podium caption reproduces the approved message using tournament data', () => {
    assert.equal(
        setup().buildPodiumCaption(event, 'https://digimon.digilab.cards/tournament/10374'),
        '🇧🇷 5 Oct 2026 — Taverna Game House\nEX13 · 7 players\n\n🥇 Jupitermon\n🥈 DATS Ravemon\n🥉 Vulcanusmon\n\nFull standings:\nhttps://digimon.digilab.cards/tournament/10374\n\n#DigimonTCG #EX13 #DigimonCWB'
    );
});

test('2v2 daily captions include paired decks, player count, short rules and the next standings image', () => {
    const caption = setup().buildPodiumCaption(
        {
            ...event,
            team: true,
            players: 2,
            podium: [
                {
                    members: [
                        { name: 'Ana', deck: 'DATA SQUAD ShineGreymon' },
                        { name: 'Bia', deck: 'UlforceVeedramon' }
                    ]
                }
            ]
        },
        'https://digimon.digilab.cards/tournament/123'
    );
    assert.match(caption, /🥇 DATS Shine & UlforceVeedramon/);
    assert.match(caption, /EX13 · 2 players\n/);
    assert.doesNotMatch(caption, /\d+ teams?/);
    assert.ok(caption.includes('2v2 rules: First team to 3 wins takes the round.'));
    assert.ok(
        caption.includes('Full standings in the next image.\n\n#DigimonTCG #EX13 #DigimonCWB')
    );
    assert.doesNotMatch(caption, /digilab|Ana|Bia/);
});

test('weekly captions summarize the whole week without exceeding the short post budget', () => {
    const team = {
        ...event,
        id: '2',
        title: '2v2',
        isoDate: '2026-10-10',
        team: true,
        players: 4,
        winner: {
            members: [
                { name: 'Ana', deck: 'DATA SQUAD ShineGreymon' },
                { name: 'Bia', deck: 'UlforceVeedramon' }
            ]
        }
    };
    const solo = { ...event, id: '1', title: 'Semanal', winner: event.podium[0] };
    const release = {
        ...event,
        id: '3',
        title: 'release_event',
        isoDate: '2026-10-11',
        deckless: true,
        winner: { name: 'Caio', deck: 'Hidden' }
    };
    const caption = setup().buildWeeklyCaption(
        [{ ...solo, id: 'outside', isoDate: '2026-10-12', store: 'Excluded' }, team, release, solo],
        '2026-10-05'
    );
    assert.match(caption, /Weekly recap — 5 Oct 2026 to 11 Oct 2026/);
    assert.match(caption, /3 tournaments · 18 entries/);
    assert.ok(caption.includes("This week's winners and decks in the images."));
    assert.ok(caption.includes('#DigimonTCG #EX13 #DigimonCWB'));
    assert.ok(caption.length <= 280);
    assert.doesNotMatch(caption, /Excluded|Hidden|digilab|Ana|Bia/);
    const many = Array.from({ length: 40 }, (_, index) => ({ ...solo, format: `EX${index}` }));
    const manyCaption = setup().buildWeeklyCaption(many, '2026-10-05');
    assert.ok(manyCaption.length <= 280);
    assert.ok(manyCaption.includes('40 tournaments · 280 entries'));
    assert.ok(manyCaption.endsWith('#DigimonCWB'));
    assert.equal(setup().buildWeeklyCaption([], '2026-10-05'), '');
    assert.equal(setup().buildWeeklyCaption([solo], ''), '');
});
test('captions handle missing places, singular counts and tournaments without decks or links', () => {
    const caption = setup().buildPodiumCaption({
        ...event,
        isoDate: '2027-01-01',
        format: 'BT24',
        players: 1,
        deckless: true,
        podium: [event.podium[0], null, null]
    });
    assert.match(caption, /1 Jan 2027/);
    assert.match(caption, /BT24 · 1 player\n/);
    assert.match(caption, /🥇 Ana/);
    assert.doesNotMatch(caption, /🥈|🥉|Full standings|Jupitermon|#EX13/);
    assert.match(caption, /#BT24/);
});
test('standings links use the external ID rather than the local tournament ID', async () => {
    const signal = new AbortController().signal;
    const api = setup(async (url, options) => {
        const params = new URL(url).searchParams;
        assert.equal(params.get('tournament_id'), 'eq.213');
        assert.equal(options.signal, signal);
        return { ok: true, json: async () => [{ digilab_tournament_id: 10374 }] };
    });
    assert.equal(
        await api.loadStandingsUrl('213', signal),
        'https://digimon.digilab.cards/tournament/10374'
    );
    assert.equal(await setup().loadStandingsUrl('213', signal), '');
    await assert.rejects(setup(async () => ({ ok: false })).loadStandingsUrl('213', signal));
});

test('large tournament captions stay within 280 characters with the DigiLab link', () => {
    const results = Array.from({ length: 24 }, (_, index) => ({
        placement: index + 1,
        name: `Player ${index + 1}`,
        deck: ['UlforceVeedramon', 'Data Squad Ravemon', 'Omnimon Zwart Defeat'][index % 3]
    }));
    const url = 'https://digimon.digilab.cards/tournament/10374';
    const caption = setup().buildPodiumCaption({ ...event, players: 24, results }, url);
    assert.ok(setup().xLength(caption) <= 280, `${setup().xLength(caption)} characters`);
    assert.ok(caption.includes('🥇 UlforceVeedramon\n🥈 DATS Ravemon\n🥉 Omnimon Zwart Defeat'));
    assert.match(
        caption,
        /\+\d+ more\n\nFull standings:\nhttps:\/\/digimon\.digilab\.cards\/tournament\/10374/
    );
    assert.doesNotMatch(caption, /Player/);
});

test('caption length follows X weighting for links, emoji and text', () => {
    const { xLength } = setup();
    assert.equal(xLength('abc'), 3);
    assert.equal(xLength('🥇'), 2);
    assert.equal(xLength('🇧🇷'), 2);
    assert.equal(xLength('— · º'), 5);
    assert.equal(xLength('https://digimon.digilab.cards/tournament/10374'), 23);
});

test('captions always fit 280 X characters and keep the top 3 in extreme tournaments', () => {
    const api = setup();
    const long = 'Data Squad ShineGreymon Ruin Mode Burst Mode Extra Long Deck Name';
    const url = 'https://digimon.digilab.cards/tournament/10374';
    const cases = [];
    for (const team of [false, true])
        for (const players of [1, 3, 8, 40])
            for (const deck of ['Gammamon', long])
                for (const store of [
                    'Taverna',
                    'Loja Com Um Nome Extremamente Comprido De Verdade Mesmo'
                ])
                    cases.push({
                        ...event,
                        team,
                        store,
                        players,
                        format: 'EX13',
                        podium: [1, 2, 3].map((placement) =>
                            team
                                ? {
                                      members: [
                                          { name: 'A', deck },
                                          { name: 'B', deck }
                                      ]
                                  }
                                : { name: 'A', deck, placement }
                        ),
                        results: Array.from({ length: players }, (_, index) => ({
                            placement: team ? Math.floor(index / 2) + 1 : index + 1,
                            name: `P${index}`,
                            deck
                        }))
                    });
    cases.push({
        ...event,
        deckless: true,
        podium: [{ name: 'Ana' }, { name: 'Bia' }, { name: 'Caio' }]
    });
    for (const item of cases) {
        const caption = api.buildPodiumCaption(item, item.team ? '' : url);
        assert.ok(api.xLength(caption) <= 280, `${api.xLength(caption)}: ${caption}`);
        assert.match(caption, /🥇/);
        assert.ok(caption.startsWith('🇧🇷 5 Oct 2026'));
    }
});

test('captions show DigiLab ties as shared places', () => {
    const results = [
        { placement: 1, rank: 1, deck: 'Jesmon', name: 'Lukas' },
        { placement: 2, rank: 1, deck: 'Chronomon', name: 'Alex' },
        { placement: 3, rank: 3, deck: 'Imperialdramon', name: 'Matheus' },
        { placement: 4, rank: 3, deck: 'Medusamon', name: 'Nai' },
        { placement: 5, rank: 5, deck: 'Heavymetaldramon', name: 'Vinicius' }
    ];
    const caption = setup().buildPodiumCaption({
        ...event,
        players: 5,
        podium: results.slice(0, 3),
        results
    });
    assert.ok(
        caption.includes(
            '🥇 Jesmon\n🥇 Chronomon\n🥉 Imperialdramon\n🥉 Medusamon\n5º Heavymetaldramon'
        ),
        caption
    );
});
