const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const { addBanlistRule, banlistError } = vm.runInNewContext(
    stripTypeScriptTypes(
        fs.readFileSync('frontend/apps/workspace/format-banlist-model.ts', 'utf8')
    ).replace(/export /g, '') + '\n({addBanlistRule, banlistError})'
);

test('Custom banlist supports multiple bans, limits and independent pairs without changing other rules', () => {
    const original = {
        allowed_sets: ['EX14'],
        points_limit: 100,
        card_points: { 'EX14-012': { name: 'Example', points: 5 } },
        choice_groups: [['BT1-001', 'BT2-001', 'BT3-001']]
    };
    let rules = addBanlistRule(original, 'banned', ' ex14-012 ');
    rules = addBanlistRule(rules, 'banned', 'EX14-013');
    rules = addBanlistRule(rules, 'limited', 'BT1-010', '', 1);
    rules = addBanlistRule(rules, 'limited', 'BT1-011', '', 2);
    rules = addBanlistRule(rules, 'pair', 'BT2-010', 'BT3-010');
    rules = addBanlistRule(rules, 'pair', 'BT2-011', 'BT3-011');
    assert.deepEqual(JSON.parse(JSON.stringify(rules)), {
        ...original,
        banned_codes: ['EX14-012', 'EX14-013'],
        limited_cards: { 'BT1-010': 1, 'BT1-011': 2 },
        choice_groups: [...original.choice_groups, ['BT2-010', 'BT3-010'], ['BT2-011', 'BT3-011']]
    });
    assert.equal(original.banned_codes, undefined);
    assert.equal(original.choice_groups.length, 1);
    assert.equal(banlistError(rules), '');
});

test('Duplicate rules, reversed pairs and conflicting individual restrictions are rejected', () => {
    const rules = {
        banned_codes: ['BT1-001'],
        limited_cards: { 'BT1-002': 1 },
        choice_groups: [['BT2-001', 'BT3-001']]
    };
    for (const kind of ['banned', 'limited']) {
        for (const code of ['BT1-001', 'BT1-002']) {
            assert.throws(() => addBanlistRule(rules, kind, code), /já tem uma restrição/);
        }
    }
    assert.throws(() => addBanlistRule(rules, 'pair', 'BT3-001', 'BT2-001'), /já está cadastrado/);
    assert.throws(() => addBanlistRule({}, 'pair', 'BT1-001', 'bt1-001'), /duas cartas diferentes/);
});

test('Manual codes work without catalog metadata; invalid codes and copy limits are rejected', () => {
    assert.equal(addBanlistRule({}, 'limited', 'EX14-012', '', 3).limited_cards['EX14-012'], 3);
    for (const code of ['', 'Agumon', '../EX14-012']) {
        assert.throws(() => addBanlistRule({}, 'banned', code), /código válido/);
        assert.throws(() => addBanlistRule({}, 'pair', 'BT1-001', code), /código válido/);
    }
    for (const limit of [0, -1, 1.5, 1000, NaN]) {
        assert.throws(() => addBanlistRule({}, 'limited', 'BT1-001', '', limit), /limite inteiro/);
    }
});

test('Invalid advanced JSON shapes cannot reach the visual editor or be saved', () => {
    for (const rules of [
        { banned_codes: 'BT1-001' },
        { banned_codes: [12] },
        { limited_cards: null },
        { limited_cards: [] },
        { limited_cards: { 'BT1-001': -1 } },
        { limited_cards: { 'BT1-001': '1' } },
        { choice_groups: [null] },
        { choice_groups: [['BT1-001']] },
        { choice_groups: [['BT1-001', 'BT1-001']] }
    ])
        assert.ok(banlistError(rules));
    assert.equal(banlistError({}), '');
    assert.equal(banlistError({ limited_cards: { 'BT1-001': 0 } }), '');
});
