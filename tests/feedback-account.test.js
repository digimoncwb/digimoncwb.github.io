const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');

function endpoint(user) {
    let handle;
    let stored;
    let verifiedToken;
    const query = {
        select() {
            return this;
        },
        eq() {
            return this;
        },
        gte() {
            return this;
        },
        upsert(row) {
            stored = row;
            return this;
        },
        maybeSingle: async () => ({ data: null }),
        single: async () => ({ data: { id: 1, email_sent_at: 'sent' } }),
        then(resolve, reject) {
            return Promise.resolve({ count: 0 }).then(resolve, reject);
        }
    };
    const source = stripTypeScriptTypes(
        readFileSync('supabase/functions/send-feedback/index.ts', 'utf8')
    ).replace(/^import.*$/gm, '');
    vm.runInNewContext(source, {
        Request,
        Response,
        TextEncoder,
        crypto: require('node:crypto').webcrypto,
        Deno: {
            serve: (callback) => {
                handle = callback;
            },
            env: { get: () => 'configured' }
        },
        createClient: () => ({
            auth: {
                getUser: async (token) => {
                    verifiedToken = token;
                    return { data: { user }, error: user ? null : { message: 'expired' } };
                }
            },
            from: () => query
        }),
        fetch: () => {
            throw Error('No email should be sent in this test');
        }
    });
    return { send: handle, stored: () => stored, token: () => verifiedToken };
}

test('feedback endpoint requires a verified account and ignores forged contact emails', async () => {
    const body = {
        request_id: '11111111-1111-4111-8111-111111111111',
        feedback_type: 'bug',
        message: 'A valid bug report for this test',
        contact_email: 'forged@example.com',
        opened_at: Date.now() - 5000
    };
    const request = (token) =>
        new Request('https://api.test/feedback', {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: JSON.stringify(body)
        });
    const anonymous = endpoint(null);
    assert.equal((await anonymous.send(request())).status, 401);
    assert.equal((await anonymous.send(request('expired'))).status, 401);
    assert.equal(anonymous.stored(), undefined);
    const signedIn = endpoint({ id: 'account', email: 'real@example.com' });
    assert.equal((await signedIn.send(request('valid-session'))).status, 200);
    assert.equal(signedIn.token(), 'valid-session');
    assert.equal(signedIn.stored().contact_email, 'real@example.com');
});

test('support actions and form are hidden for visitors and show the account email after login', async () => {
    const { transformWithOxc } = await import('vite');
    const source = readFileSync('frontend/shell/SiteFooter.tsx', 'utf8');
    const { code } = await transformWithOxc(
        source
            .slice(source.indexOf('export function SiteFooter'))
            .replace('export function', 'function'),
        'SiteFooter.tsx'
    );
    let user = null;
    let hook;
    const Footer = vm.runInNewContext(code + '\nSiteFooter', {
        require,
        window: { APP_VERSION: 'test' },
        ThemePicker: 'theme-picker',
        useSiteAuth: () => ({ user }),
        useEffect() {},
        useRef: (value) => ({ current: value }),
        createPortal: (children) => children,
        useState: (initial) => [hook++ === 0 ? {} : hook === 2 ? 'suggestion' : initial, () => {}]
    });
    const find = (node, predicate) =>
        Array.isArray(node)
            ? node.flatMap((child) => find(child, predicate))
            : node && typeof node === 'object'
              ? [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)]
              : [];
    for (const loggedIn of [false, true, false]) {
        user = loggedIn ? { id: 'account', email: 'real@example.com' } : null;
        hook = 0;
        const tree = Footer();
        assert.equal(
            find(tree, (node) =>
                ['Enviar sugestão', 'Reportar bug'].includes(node.props?.['aria-label'])
            ).length,
            loggedIn ? 2 : 0
        );
        const email = find(tree, (node) => node.props?.id === 'site-feedback-email');
        assert.equal(email.length, loggedIn ? 1 : 0);
        if (loggedIn) {
            assert.equal(email[0].props.value, user.email);
            assert.equal(email[0].props.readOnly, true);
        }
    }
});
