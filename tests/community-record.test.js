const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const source = stripTypeScriptTypes(
    readFileSync('frontend/apps/workspace/community-record.ts', 'utf8')
).replace(/export /g, '');
const record = vm.runInNewContext(source + '\ncommunityRecord');

test('ranking and pairing records use confirmed match wins, losses, draws and byes', () => {
    const matches = [
        { p1: 'a', p2: 'b', wins: 2, losses: 1, draws: 0, status: 'confirmed' },
        { p1: 'c', p2: 'a', wins: 1, losses: 1, draws: 1, status: 'confirmed' },
        { p1: 'b', p2: null, wins: 2, losses: 0, draws: 0, status: 'confirmed' },
        { p1: 'b', p2: 'a', wins: 2, losses: 0, draws: 0, status: 'proposed' }
    ];
    assert.equal(record(matches, 'a'), '1 - 0 - 1');
    assert.equal(record(matches, 'b'), '1 - 1 - 0');
    assert.equal(record(matches, 'c'), '0 - 0 - 1');
    assert.equal(record(matches, 'new-player'), '0 - 0 - 0');
});
