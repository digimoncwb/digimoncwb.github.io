const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
function model() {
    const sandbox = vm.createContext({});
    vm.runInContext(
        stripTypeScriptTypes(readFileSync('frontend/apps/builder/editor-model.ts', 'utf8')).replace(
            /export /g,
            ''
        ),
        sandbox
    );
    return sandbox;
}
test('Collection accepts partial free text regardless of case or surrounding whitespace', () => {
    const api = model();
    const cards = api.mergeCatalog(
        ['BT17-001', 'BT1-010', 'EX13-070'].map((card_code) => ({ card_code, name: card_code }))
    );
    const filters = {
        query: '',
        color: '',
        color2: '',
        type: '',
        level: '',
        cost: '',
        set: ' bt ',
        permitted: false
    };
    assert.equal(api.filterCatalog(cards, filters, api.effectiveRules({})).length, 2);
    assert.equal(
        api.filterCatalog(cards, { ...filters, set: 'eX13' }, api.effectiveRules({}))[0].code,
        'EX13-070'
    );
});
test('Level ordering keeps egg, Digimon, Tamer and Option groups together in image export', () => {
    const api = model();
    const rows = [
        { card_code: 'BT1-001', name: 'Egg', type: 'Digi-Egg', level: 2 },
        { card_code: 'BT1-010', name: 'Digimon', type: 'Digimon', level: 3 },
        { card_code: 'BT1-100', name: 'Option', type: 'Option' },
        { card_code: 'BT11-091', name: 'Tamer', type: 'Tamer' }
    ];
    const cards = new Map(api.mergeCatalog(rows).map((card) => [card.code, card]));
    const result = api.sortEntries(
        rows.map((row) => ({ code: row.card_code, qty: 1 })),
        cards,
        'level'
    );
    assert.deepEqual(
        Array.from(result, (card) => card.code),
        ['BT1-001', 'BT1-010', 'BT11-091', 'BT1-100']
    );
});
test('Editor never merges other-game cards into the catalog or treats stubs as complete', () => {
    const api = model();
    const rows = api.mergeCatalog([
        { card_code: 'DD-010', name: 'Davis', type: 'Tamer', color: 'Blue' },
        {
            card_code: 'EX13-070',
            name: 'Davis Motomiya & Ken Ichijoji',
            type: 'Tamer',
            color: 'Blue',
            color2: 'Green'
        },
        { card_code: 'BT21-003', name: 'Yokomon' }
    ]);
    assert.equal(
        rows.some((card) => card.code === 'DD-010'),
        false
    );
    assert.equal(rows.find((card) => card.code === 'EX13-070').known, true);
    assert.equal(rows.find((card) => card.code === 'BT21-003').known, false);
});
test('Editor searches the complete catalog by name and code without the old 240-card cap', () => {
    const api = model();
    const rows = Array.from({ length: 700 }, (_, i) => ({
        card_code: `BT17-${String(i + 1).padStart(3, '0')}`,
        name: `Agumon ${i + 1}`,
        card_type: 'Digimon',
        card_level: 3,
        color: 'Red'
    }));
    const cards = api.mergeCatalog(rows);
    const filters = {
        query: 'agumon',
        color: '',
        color2: '',
        type: '',
        level: '',
        cost: '',
        set: '',
        permitted: false
    };
    const rules = api.effectiveRules({}, {});
    assert.equal(api.filterCatalog(cards, filters, rules).length, 700);
    assert.equal(
        api.filterCatalog(cards, { ...filters, query: 'BT17-699' }, rules)[0].code,
        'BT17-699'
    );
    assert.equal(api.filterCatalog(cards, { ...filters, color: 'blue' }, rules).length, 0);
});
test('Editor separates eggs, deduplicates warnings and permits drafts without silently clamping counts', () => {
    const api = model();
    const cards = new Map(
        api
            .mergeCatalog([
                { card_code: 'BT1-001', name: 'Egg', card_type: 'Digi-Egg', card_level: 2 },
                {
                    card_code: 'BT1-010',
                    name: 'Agumon',
                    card_type: 'Digimon',
                    card_level: 3,
                    color: 'Red'
                },
                { card_code: 'BT1-011', name: 'Other', card_type: 'Digimon', card_level: 3 }
            ])
            .map((card) => [card.code, card])
    );
    const rules = api.effectiveRules({
        main_count: 50,
        egg_max: 5,
        copies: 4,
        banned_codes: ['BT1-010'],
        choice_groups: [
            ['BT1-010', 'BT1-011'],
            ['BT1-011', 'BT1-010']
        ]
    });
    const result = api.validateDeck(
        [
            { code: 'BT1-001', qty: 4 },
            { code: 'BT1-010', qty: 55 },
            { code: 'BT1-011', qty: 1 }
        ],
        cards,
        rules,
        true
    );
    assert.equal(result.main, 56);
    assert.equal(result.eggs, 4);
    assert.equal(result.issues.filter((i) => i.id.startsWith('copies-BT1-010')).length, 0);
    assert.equal(result.issues.filter((i) => i.id.startsWith('choice-')).length, 1);
    assert.equal(result.valid, false);
    const imported = api.parseImport('55 BT1-010\n4 BT1-001\nthis line is not a card');
    assert.equal(imported.entries[0].qty, 55);
    assert.equal(imported.errors.length, 1);
    assert.equal(
        api.validateDeck(
            [{ code: 'BT1-011', qty: 50 }],
            cards,
            api.effectiveRules({ copies: 50 }),
            false
        ).valid,
        false
    );
});
test('Only centrally published complete rules enable validation; format changes retain cards', () => {
    const api = model();
    assert.equal(
        api.pendingFormatRules({ rules_status: 'draft', validation_rules: null }).length,
        4
    );
    assert.equal(
        api.pendingFormatRules({
            rules_status: 'published',
            validation_rules: { main_count: 50, egg_max: 5, copies: 4 }
        }).length,
        0
    );
    const card = api.normalizeCard({
        card_code: 'BT1-010',
        name: 'Agumon',
        type: 'Digimon',
        color: 'Red'
    });
    const entries = [{ code: card.code, qty: 4 }];
    const cards = new Map([[card.code, card]]);
    const next = api.validateDeck(
        entries,
        cards,
        api.effectiveRules({ main_count: 40, allowed_colors: ['blue'] }),
        true
    );
    assert.equal(entries[0].qty, 4);
    assert.equal(next.issues.filter((i) => i.title.includes('Cor')).length, 1);
});
