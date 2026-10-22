const { test } = require('node:test');
const assert = require('node:assert/strict');
const { metadata, complete, GAME_CODE } = require('../scripts/sync-builder-card-metadata');

test('Builder catalog excludes other Digimon games and incomplete metadata', () => {
    for (const code of ['DD-010', 'DM-001', 'DV-004', 'MD-016'])
        assert.equal(GAME_CODE.test(code), false);
    for (const code of ['BT27-100', 'EX13-070', 'ST23-09', 'P-117', 'LM-001'])
        assert.equal(GAME_CODE.test(code), true);
    assert.equal(
        complete({
            card_code: 'BT21-003',
            name: 'Yokomon',
            card_payload: { id: 'BT21-003', name: 'Yokomon' }
        }),
        false
    );
});

test('Metadata repairs preserve real levels, both colors and Dual types', () => {
    const row = metadata({
        card_code: 'P-117',
        card_level: 0,
        card_payload: {
            id: 'P-117',
            name: 'Veemon',
            type: 'Digimon',
            level: 3,
            color: 'Blue',
            color2: 'Green'
        }
    });
    assert.equal(row.card_level, 3);
    assert.equal(row.color, 'Blue/Green');
    assert.equal(complete(row), true);
    assert.equal(
        metadata({ id: 'ST23-09', name: 'Atratusmon', type: 'Dual', level: 5 }).card_type,
        'Dual'
    );
});

test('An intentionally unprinted level stays null and does not imply missing metadata', () => {
    const row = metadata({
        id: 'EX2-045',
        name: 'Calumon',
        type: 'Digimon',
        color: 'White',
        level: null,
        play_cost: 3
    });
    assert.equal(row.card_level, null);
    assert.equal(complete(row), true);
    assert.deepEqual(metadata(row), row);
});
