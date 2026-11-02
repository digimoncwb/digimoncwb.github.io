const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

test('account login waits for profile resolution without flashing an empty profile form', async () => {
    const { transformWithOxc } = await import('vite');
    const source = readFileSync('frontend/shell/AccountPanel.tsx', 'utf8');
    const { code } = await transformWithOxc(
        source
            .slice(source.indexOf('export function AccountPanel'))
            .replace('export function', 'function'),
        'AccountPanel.tsx'
    );
    let state = {
        user: { id: 'user', email: 'user@example.test' },
        profile: null,
        loading: true,
        available: true
    };
    const Panel = vm.runInNewContext(code + '\nAccountPanel', {
        require,
        Dialog: 'dialog',
        LegalChecks: 'legal-checks',
        uncheckedDeclarations: { termsAccepted: false, privacyRead: false, adultDeclared: false },
        useSiteAuth: () => state,
        useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
        useRef: (value) => ({ current: value }),
        useEffect: () => {}
    });
    const auth = { getRememberMe: () => true, getRememberedEmail: () => '' };
    const find = (node, type) =>
        !node
            ? []
            : Array.isArray(node)
              ? node.flatMap((child) => find(child, type))
              : typeof node === 'object'
                ? [...(node.type === type ? [node] : []), ...find(node.props?.children, type)]
                : [];
    let tree = Panel({ auth, view: 'login', onClose: () => {} });
    assert.equal(tree.props.title, 'Preparando sua conta');
    assert.equal(find(tree, 'form').length, 0);
    assert.equal(find(tree, 'input').length, 0);
    state = {
        ...state,
        loading: false,
        profile: { user_id: 'user', display_name: 'Player', username: 'player' }
    };
    tree = Panel({ auth, view: 'profile', onClose: () => {} });
    assert.equal(tree.props.title, 'Minha conta');
    assert.ok(find(tree, 'form').length > 0);
});
