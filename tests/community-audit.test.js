const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const source = stripTypeScriptTypes(
    readFileSync('frontend/apps/workspace/community-audit.ts', 'utf8')
).replace(/export /g, '');
const describe = vm.runInNewContext(source + '\ncommunityAuditDescription');

test('audit describes authors and affected players without showing internal payloads', () => {
    const action = (name, details = {}) =>
        describe({ action: name, actor: 'admin', details: { actor_name: 'Eduardo', ...details } });
    assert.equal(action('create'), 'Eduardo criou o evento.');
    assert.equal(
        action('add_players', { target_names: ['Ciclano', 'Beltrano'] }),
        'Eduardo adicionou Ciclano e Beltrano ao torneio.'
    );
    assert.equal(
        action('drop', { entry_id: 'entry', target_names: ['Ciclano'] }),
        'Eduardo marcou a desistência de Ciclano.'
    );
    assert.equal(
        action('drop', { entry_removed: true, target_names: ['Ciclano'] }),
        'Eduardo removeu Ciclano do torneio.'
    );
    assert.equal(action('drop', { target_names: ['Eduardo'] }), 'Eduardo desistiu do torneio.');
    assert.equal(action('match_before_resolution'), null);
    assert.equal(action('invalidated_round_snapshot'), null);
    assert.equal(
        action('drop', { entry_id: 'deleted-entry' }),
        'Eduardo marcou a desistência de um jogador.'
    );
});
