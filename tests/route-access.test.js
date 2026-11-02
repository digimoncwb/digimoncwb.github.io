const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');

const policy = stripTypeScriptTypes(readFileSync('frontend/shared/route-access.ts', 'utf8'))
    .replace(/^import.*$/gm, '')
    .replace(/export /g, '');
const canAccessRoute = vm.runInNewContext(policy + '\ncanAccessRoute');
const guest = { user: null, isAdmin: false };
const member = { user: { id: 'member' }, isAdmin: false };
const admin = { user: { id: 'admin' }, isAdmin: true };

test('navigation permissions keep public results accessible and require the right active account', () => {
    for (const route of ['overview', 'tournaments', 'meta']) {
        assert.equal(canAccessRoute(route, guest), true);
    }
    for (const route of ['decks', 'builder']) {
        assert.equal(canAccessRoute(route, guest), false);
        assert.equal(canAccessRoute(route, member), true);
    }
    for (const route of ['admin', 'players', 'posts', 'manage']) {
        assert.equal(canAccessRoute(route, guest), false);
        assert.equal(canAccessRoute(route, member), false);
        assert.equal(canAccessRoute(route, admin), true);
        assert.equal(canAccessRoute(route, { user: null, isAdmin: true }), false);
    }
});

test('public tournament details expose decklists to members and management only to admins', async () => {
    const { transformWithOxc } = await import('vite');
    const source = readFileSync('frontend/apps/workspace/TournamentsPage.tsx', 'utf8');
    const { code } = await transformWithOxc(
        source.slice(source.indexOf('function TournamentDetails(')),
        'TournamentDetails.tsx'
    );
    const event = {
        id: 'event',
        title: 'Semanal',
        date: '02/11/2026',
        store: 'Loja',
        players: 4,
        results: [{ id: 'result', placement: 1, name: 'Ana', deck: 'Deck A' }]
    };
    let account = guest;
    let stateIndex;
    const Component = vm.runInNewContext(code + '\nTournamentDetails', {
        require,
        canAccessRoute,
        useSiteAuth: () => account,
        useEffect: () => {},
        useState: (initial) => [
            stateIndex++ === 0
                ? [
                      {
                          id: 'result',
                          placement: 1,
                          player: { name: 'Ana' },
                          deck: { name: 'Deck A' }
                      }
                  ]
                : initial,
            () => {}
        ],
        Dialog: 'dialog',
        StoreLogo: 'img',
        Portrait: 'img',
        EmptyState: 'p'
    });
    const text = (node) =>
        Array.isArray(node)
            ? node.map(text).join('')
            : node && typeof node === 'object'
              ? text(node.props?.children)
              : String(node || '');
    const buttons = (node) =>
        Array.isArray(node)
            ? node.flatMap(buttons)
            : node && typeof node === 'object'
              ? [...(node.type === 'button' ? [node] : []), ...buttons(node.props?.children)]
              : [];
    for (const [session, expected] of [
        [guest, []],
        [member, ['Decklist']],
        [admin, ['Editar evento', 'Criar post', 'Exportar para DigiLab', 'Decklist']]
    ]) {
        account = session;
        stateIndex = 0;
        const navigations = [];
        const tree = Component({
            event,
            onClose() {},
            onEdit() {},
            context: {
                navigate: (...args) => navigations.push(args)
            }
        });
        assert.ok(text(tree).includes('Ana'), 'public standings remain visible');
        const actions = buttons(tree);
        assert.equal(actions.length, expected.length);
        for (const label of expected)
            assert.ok(
                actions.some((button) => text(button).startsWith(label)),
                label
            );
        const decklist = actions.find((button) => text(button).startsWith('Decklist'));
        if (decklist) {
            decklist.props.onClick();
            assert.equal(navigations[0][0], 'builder');
            assert.equal(navigations[0][1].resultId, 'result');
        }
    }
});
