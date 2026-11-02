const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

async function history() {
    const { transformWithOxc } = await import('vite');
    const source = readFileSync('frontend/apps/workspace/CommunityRoundHistory.tsx', 'utf8');
    const { code } = await transformWithOxc(
        source.slice(source.indexOf('export function')).replace('export function', 'function'),
        'CommunityRoundHistory.tsx'
    );
    let selected = '';
    const Component = vm.runInNewContext(code + '\nCommunityRoundHistory', {
        require,
        CommunityPairings: 'pairings',
        useState: () => [
            selected,
            (next) => {
                selected = next;
            }
        ]
    });
    return (snapshot, onRefresh = () => {}) =>
        Component({ snapshot, onRefresh, admin: false, busy: false });
}

function find(node, predicate) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
    return [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
}
const pairings = (tree) => find(tree, (node) => node.type === 'pairings')[0].props;
const page = (tree, number) =>
    find(tree, (node) => node.props?.['aria-label'] === `Rodada ${number}`)[0];

test('history shows the current round, retains a chosen past round and scopes records to that round', async () => {
    const render = await history();
    const snapshot = {
        rounds: [
            { id: 'r2', number: 2, status: 'running' },
            { id: 'r1', number: 1, status: 'closed' }
        ],
        matches: [
            { id: 'm2', round_id: 'r2', table_number: 1 },
            { id: 'm1', round_id: 'r1', table_number: 1 }
        ]
    };
    let refreshes = 0;
    let tree = render(snapshot, () => refreshes++);
    assert.equal(pairings(tree).matches[0].id, 'm2');
    assert.equal(page(tree, 2).props['aria-pressed'], true);
    page(tree, 1).props.onClick();
    assert.equal(refreshes, 1);
    snapshot.rounds.push({ id: 'r3', number: 3, status: 'running' });
    snapshot.matches.push({ id: 'm3', round_id: 'r3', table_number: 1 });
    tree = render(snapshot);
    assert.equal(pairings(tree).matches[0].id, 'm1');
    assert.equal(
        pairings(tree).snapshot.matches.length,
        1,
        'future results do not affect past records'
    );
    page(tree, 3).props.onClick();
    tree = render(snapshot);
    assert.equal(pairings(tree).matches[0].id, 'm3');
    snapshot.rounds.push({ id: 'r4', number: 4, status: 'running' });
    snapshot.matches.push({ id: 'm4', round_id: 'r4', table_number: 1 });
    assert.equal(
        pairings(render(snapshot)).matches[0].id,
        'm4',
        'current-round view follows new pairings'
    );
});

test('selecting the current round refreshes missing pairings and renders them when they arrive', async () => {
    const render = await history();
    const snapshot = { rounds: [{ id: 'r2', number: 2, status: 'running' }], matches: [] };
    const tree = render(snapshot, () => {
        snapshot.matches.push({ id: 'new-table', round_id: 'r2', table_number: 1 });
    });
    assert.equal(find(tree, (node) => node.props?.role === 'status').length, 1);
    page(tree, 2).props.onClick();
    const updated = render(snapshot);
    assert.equal(pairings(updated).matches[0].id, 'new-table');
    assert.equal(find(updated, (node) => node.props?.role === 'status').length, 0);
});
