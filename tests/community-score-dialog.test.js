const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

test('a received score offers confirmation or refusal and shows score inputs only after refusal', async () => {
    const { transformWithOxc } = await import('vite');
    const source = readFileSync('frontend/apps/workspace/CommunityTournaments.tsx', 'utf8');
    const { code } = await transformWithOxc(
        source.slice(source.indexOf('function ScoreDialog(')),
        'ScoreDialog.tsx'
    );
    const state = [];
    let cursor = 0,
        confirmed = 0;
    const Component = vm.runInNewContext(code + '\nScoreDialog', {
        require,
        Dialog: 'dialog',
        useState(initial) {
            const slot = cursor++;
            if (state[slot] === undefined) state[slot] = initial;
            return [
                state[slot],
                (next) => (state[slot] = typeof next === 'function' ? next(state[slot]) : next)
            ];
        }
    });
    const props = {
        error: '',
        match: {
            id: 'match',
            p1: 'one',
            p2: 'two',
            status: 'proposed',
            proposed_by: 'one',
            wins: 2,
            losses: 1,
            draws: 0
        },
        entries: [
            { id: 'one', name: 'First' },
            { id: 'two', name: 'Second' }
        ],
        mine: { id: 'two' },
        admin: false,
        busy: false,
        onClose: () => {},
        onConfirm: async () => confirmed++,
        onSave: async () => {}
    };
    const render = () => {
        cursor = 0;
        return Component(props);
    };
    const find = (node, predicate) =>
        !node
            ? []
            : Array.isArray(node)
              ? node.flatMap((child) => find(child, predicate))
              : typeof node === 'object'
                ? [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)]
                : [];
    let tree = render();
    let buttons = find(tree, (node) => node.type === 'button');
    assert.deepEqual(
        buttons.map((node) => node.props.children),
        ['Confirmar o resultado', 'Refutar resultado']
    );
    assert.equal(find(tree, (node) => node.type === 'input').length, 0);
    buttons[0].props.onClick();
    assert.equal(confirmed, 1);
    buttons[1].props.onClick();
    tree = render();
    assert.equal(find(tree, (node) => node.type === 'form').length, 1);
    assert.equal(
        find(tree, (node) => node.type === 'input' && node.props.type === 'radio').length,
        8
    );
});
