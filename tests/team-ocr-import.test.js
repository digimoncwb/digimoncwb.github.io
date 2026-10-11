const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const tournamentUtils = require('../config/tournament-utils');

const bandaiRows = [
    ['Lukas Fujisawa', 1, 9],
    ['Giovani', 2, 6],
    ['Thiago Almeida', 3, 6],
    ['Teixas', 4, 6],
    ['Castanha', 5, 6],
    ['matheusdonizete', 6, 3],
    ['Ivan', 7, 3],
    ['Lucas Patrick', 8, 3],
    ['Barbosa', 8, 3]
].map(([name, rank, points], index) => ({ name, rank, points, member_id: `member-${index}` }));

function functionSource(file, name) {
    const source = readFileSync(file, 'utf8');
    const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
    assert.ok(start >= 0, name);
    const rest = source.slice(start + 1);
    const next = rest.search(/^(?:async )?function \w+\(/m);
    return source.slice(start, next < 0 ? undefined : start + 1 + next);
}

function importer(mode, type, existing = [], rows = bandaiRows) {
    const edit = mode === 'edit';
    const file = edit ? 'torneios/edit-tournament/modal.js' : 'torneios/list-tournaments/script.js';
    const suffix = edit ? 'Modal' : '';
    const elements = new Map();
    const statuses = [];
    const errors = [];
    const context = vm.createContext({
        window: { tournamentUtils },
        console: { error: (...args) => errors.push(args) },
        document: {
            getElementById(id) {
                if (!elements.has(id))
                    elements.set(id, { value: id.endsWith('TournamentName') ? type : '' });
                return elements.get(id);
            }
        },
        [`${mode}Results`]: existing,
        [`${mode}Players`]: [{}],
        [`${mode}Stores`]: [{}],
        [`${mode}OcrSelectedFiles`]: [{ name: 'bandai.png' }],
        [`${mode}OcrProcessedFiles`]: [],
        [`${mode}OcrImportInProgress`]: false,
        [`requestOcrFromImage${suffix}`]: async () => ({ players: rows }),
        [`extractOcrStoreAndDate${suffix}`]: () => ({}),
        [`findPlayerMatchFromOcr${suffix}`]: (row) =>
            row.member_id === 'member-8' ? null : { id: `player-${row.member_id}` },
        [`resolveStoreFromOcrName${suffix}`]: () => null,
        [`normalizeMemberId${suffix}`]: (value) => String(value || '').trim(),
        [`isGuestMemberId${suffix}`]: () => false,
        normalizeOcrMatchPoints: tournamentUtils.normalizeMatchPoints,
        loadInactivePlayersMatchingOcr: async () => {},
        [`render${edit ? 'Edit' : 'Create'}ResultsRows`]: () => {},
        [`set${edit ? 'Edit' : 'Create'}OcrStatus`]: (message, tone) =>
            statuses.push({ message, tone }),
        [`set${edit ? 'Edit' : 'Create'}OcrSelectedInfo`]: () => {},
        setTournamentFormDirty: () => {},
        renderOcrFilePreview: () => {},
        applyScheduledStoreToCreate: () => {}
    });
    vm.runInContext(
        [
            `parseOcrRank${suffix}`,
            `extractOcrPlayers${suffix}`,
            `mergeOcrPlayersByMemberId${suffix}`,
            `process${edit ? 'Edit' : 'Create'}OcrFiles`
        ]
            .map((name) => functionSource(file, name))
            .join('\n'),
        context
    );
    return {
        context,
        statuses,
        errors,
        elements,
        run: () => context[`process${edit ? 'Edit' : 'Create'}OcrFiles`]()
    };
}

for (const mode of ['create', 'edit']) {
    test(`${mode}: Bandai representatives become separate teams, including tied ranks`, async () => {
        const harness = importer(mode, '2v2');
        await harness.run();
        const results = harness.context[`${mode}Results`];
        assert.equal(results.length, 18);
        bandaiRows.forEach((row, index) => {
            const first = results[index * 2],
                second = results[index * 2 + 1];
            assert.equal(first.player_name, row.name);
            assert.equal(second.player_name, '');
            assert.equal(second.player_id, '');
            assert.equal(first.deck_id, '');
            assert.equal(second.deck_id, '');
            assert.equal(first.match_points, row.points);
            assert.equal(second.match_points, row.points);
            assert.equal(tournamentUtils.resultPlacement(index * 2, '2v2'), index + 1);
        });
        assert.equal(harness.elements.get(`${mode}TotalPlayers`).value, '18');
        assert.equal(harness.context[`${mode}OcrProcessedFiles`].length, 1);
        assert.equal(harness.errors.length, 0);
        assert.match(harness.statuses.at(-1).message, /9 duplas/);
        assert.match(harness.statuses.at(-1).message, /1 jogador\(es\).*sem correspondência/);
        assert.match(harness.statuses.at(-1).message, /segundo jogador e os dois decks/);
        assert.ok(tournamentUtils.validateTeamResults(results, '2v2'));
    });

    test(`${mode}: solo Bandai imports keep one result per person`, async () => {
        const harness = importer(mode, 'Locals');
        await harness.run();
        assert.equal(harness.context[`${mode}Results`].length, 9);
        assert.equal(harness.elements.get(`${mode}TotalPlayers`).value, '9');
    });
}

test('editing 2v2 updates both teammates, preserving result IDs, players and decks', async () => {
    const existing = Array.from({ length: 18 }, (_, index) => ({
        id: `result-${index}`,
        player_id: index % 2 ? `partner-${index}` : `player-member-${index / 2}`,
        deck_id: `deck-${index}`,
        match_points: 0
    }));
    const identities = existing.map(({ id, player_id, deck_id }) => ({ id, player_id, deck_id }));
    const harness = importer('edit', '2v2', existing);
    await harness.run();
    assert.deepEqual(
        existing.map(({ id, player_id, deck_id }) => ({ id, player_id, deck_id })),
        identities
    );
    bandaiRows.forEach((row, index) => {
        assert.equal(existing[index * 2].match_points, row.points);
        assert.equal(existing[index * 2 + 1].match_points, row.points);
    });
    assert.match(harness.statuses.at(-1).message, /9 dupla\(s\) com pontos atualizados/);
});

for (const mode of ['create', 'edit']) {
    test(`${mode}: 2v2 keeps Bandai upload visible while hiding DigiLab controls`, () => {
        const edit = mode === 'edit';
        const title = { value: '2v2' };
        const digilab = { hidden: false },
            divider = { hidden: false },
            description = {};
        const section = { hidden: true, querySelector: () => description };
        const fields = {
            [`${mode}TournamentName`]: title,
            [`${mode}ResultsRows`]: {},
            [`${mode}TotalPlayers`]: {},
            [`${mode}TournamentOcrSection`]: section,
            [`${mode}TournamentForm`]: {
                dataset: {},
                querySelector: (selector) =>
                    selector === '.create-digilab-import' ? digilab : divider
            }
        };
        const context = vm.createContext({
            window: { tournamentUtils, updateTournamentPlayerCount: () => {} },
            document: { getElementById: (id) => fields[id] },
            [`${mode}Results`]: [],
            updateTournamentPlayerCount: () => {}
        });
        const name = `render${edit ? 'Edit' : 'Create'}ResultsRows`;
        vm.runInContext(
            functionSource(
                edit ? 'torneios/edit-tournament/modal.js' : 'torneios/list-tournaments/script.js',
                name
            ),
            context
        );
        context[name]();
        assert.equal(section.hidden, false);
        assert.equal(digilab.hidden, true);
        if (!edit) assert.equal(divider.hidden, true);
        title.value = 'Locals';
        context[name]();
        assert.equal(section.hidden, false);
        assert.equal(digilab.hidden, false);
        if (!edit) assert.equal(divider.hidden, false);
    });
}

test('oversized 2v2 OCR import leaves the previous results and archived prints intact', async () => {
    const previous = [{ player_id: 'old-a' }, { player_id: 'old-b' }];
    const rows = Array.from({ length: 19 }, (_, index) => ({
        name: `Player ${index}`,
        member_id: `member-${index}`,
        rank: index + 1,
        points: 3
    }));
    const harness = importer('create', '2v2', previous, rows);
    await harness.run();
    assert.equal(harness.context.createResults, previous);
    assert.equal(harness.context.createOcrProcessedFiles.length, 0);
    assert.equal(harness.statuses.at(-1).tone, 'error');
    assert.match(harness.statuses.at(-1).message, /18 duplas/);
});
