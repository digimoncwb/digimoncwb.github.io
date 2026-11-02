const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const source = stripTypeScriptTypes(
    readFileSync('frontend/apps/workspace/community-form.ts', 'utf8')
)
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/export /g, '');
const model = vm.runInNewContext(
    source + '\n({communityFormDate,communityFormDateTime,communityFormFormat})'
);
test('community date follows the current Brasília day rather than the UTC day', () => {
    assert.equal(model.communityFormDate('2026-11-02T01:30:00Z'), '2026-11-01');
    assert.equal(model.communityFormDate('2026-11-02T03:00:00Z'), '2026-11-02');
});

test('community start datetime uses Brasília time, including UTC day changes and midnight', () => {
    assert.equal(model.communityFormDateTime('2026-11-02T01:30:00Z'), '2026-11-01T22:30');
    assert.equal(model.communityFormDateTime('2026-11-02T03:00:00Z'), '2026-11-02T00:00');
    assert.equal(model.communityFormDateTime('2026-11-01T18:45:00-03:00'), '2026-11-01T18:45');
});
test('community form preselects the configured current active format or newest available one', () => {
    const formats = [
        { id: 1, code: 'EX12', created_at: '2026-08-01' },
        { id: 2, code: 'EX13', created_at: '2026-10-01' },
        { id: 3, code: 'BT27', created_at: '2026-11-01', is_active: false }
    ];
    assert.equal(model.communityFormFormat(formats), '2');
    assert.equal(
        model.communityFormFormat([...formats, { id: 4, code: 'BT26', is_default: true }]),
        '4'
    );
    assert.equal(model.communityFormFormat([]), '');
    assert.equal(formats[0].id, 1);
});
