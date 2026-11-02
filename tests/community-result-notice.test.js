const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const source = stripTypeScriptTypes(
    readFileSync('frontend/shared/community-result-notice.ts', 'utf8')
)
    .replace(/^import.*$/gm, '')
    .replace(/export /g, '');
const notice = vm.runInNewContext(source + '\ncommunityResultNotice');
test('result confirmations use the receiving player perspective for wins, losses and draws', () => {
    const match = { p1: 'a', p2: 'b', wins: 2, losses: 1, draws: 0 };
    assert.equal(notice(match, 'a', 1), 'Confirmar R1: WIN 2-1');
    assert.equal(notice(match, 'b', 1), 'Confirmar R1: LOSS 1-2');
    assert.equal(notice({ ...match, wins: 0, losses: 2 }, 'b', 2), 'Confirmar R2: WIN 2-0');
    for (const player of ['a', 'b'])
        assert.equal(
            notice({ ...match, wins: 1, losses: 1, draws: 1 }, player, 3),
            'Confirmar R3: DRAW 1-1-1'
        );
    assert.equal(
        notice({ ...match, wins: 0, losses: 0, draws: 1 }, 'a', 4),
        'Confirmar R4: DRAW 0-0-1'
    );
});
