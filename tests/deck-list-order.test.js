const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
test('All list previews share editor ordering without changing codes or quantities', async () => {
    const source = (file) =>
        stripTypeScriptTypes(fs.readFileSync(file, 'utf8'))
            .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\s*/gm, '')
            .replace(/export /g, '');
    const sandbox = vm.createContext({
        readRows: async () => [
            { card_code: 'BT1-001', name: 'Egg', type: 'Digi-Egg', level: 2 },
            { card_code: 'BT1-010', name: 'Digimon', type: 'Digimon', level: 3 },
            { card_code: 'BT1-100', name: 'Option', type: 'Option' },
            { card_code: 'BT11-091', name: 'Tamer', type: 'Tamer' }
        ]
    });
    vm.runInContext(source('frontend/apps/builder/editor-model.ts'), sandbox);
    vm.runInContext(source('frontend/apps/builder/editor-service.ts'), sandbox);
    const input = ['BT1-100', 'BT11-091', 'BT1-010', 'BT1-001'].map((card_code, i) => ({
        card_code,
        qty: 50 + i,
        position: i + 1
    }));
    const sorted = await sandbox.orderListCards(input);
    assert.deepEqual(
        Array.from(sorted, (card) => card.card_code),
        ['BT1-001', 'BT1-010', 'BT11-091', 'BT1-100']
    );
    assert.deepEqual(
        Array.from(sorted, (card) => card.qty),
        [53, 52, 51, 50]
    );
    assert.deepEqual(
        Array.from(sorted, (card) => card.position),
        [1, 2, 3, 4]
    );
    assert.equal(input[0].card_code, 'BT1-100');
});
