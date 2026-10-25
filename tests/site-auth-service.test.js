const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
function setup() {
    let session = null,
        callback;
    const calls = [],
        events = [],
        storage = [];
    const config = {
        enabled: true,
        privacy_url: 'https://example.test/privacy',
        privacy_version: 'v1',
        terms_url: 'https://example.test/terms',
        terms_version: 'v1',
        legal_ready: true
    };
    let account = {
        profile: { user_id: 'user-a', username: 'user_a', status: 'active' },
        is_admin: false,
        is_member: true
    };
    const client = {
        auth: {
            onAuthStateChange(fn) {
                callback = fn;
            },
            async getSession() {
                return { data: { session }, error: null };
            },
            async signInWithPassword(input) {
                calls.push(input);
                session = {
                    access_token: 'jwt-a',
                    user: { id: 'user-a', email: input.email, email_confirmed_at: '2026-01-01' }
                };
                return { data: { session }, error: null };
            },
            async signOut() {
                session = null;
                callback('SIGNED_OUT', null);
                return { error: null };
            },
            async signUp(input) {
                calls.push(input);
                return { error: null };
            },
            async resetPasswordForEmail(email, options) {
                calls.push({ email, options });
                return { error: null };
            },
            async updateUser(input) {
                calls.push(input);
                return { error: null };
            }
        },
        async rpc(name) {
            return { data: name === 'site_account_status' ? config : account, error: null };
        }
    };
    const context = {
        window: {
            APP_CONFIG: {
                SUPABASE_URL: 'https://project.example',
                SUPABASE_ANON_KEY: 'public-key'
            },
            dispatchEvent: (e) => events.push(e)
        },
        document: { querySelector: () => null },
        location: { href: 'https://site.example/index.html#decks' },
        sessionStorage: { removeItem: (key) => storage.push(key) },
        createClient: () => client,
        Headers,
        URL,
        AbortSignal,
        CustomEvent: class {
            constructor(type, init) {
                this.type = type;
                this.detail = init?.detail;
            }
        },
        Event,
        setTimeout,
        fetch: async (url, options) => {
            calls.push({ url, options });
            return Response.json(url.endsWith('/site_account_status') ? config : { ok: true });
        }
    };
    vm.createContext(context);
    const source = readFileSync('frontend/shell/auth-service.ts', 'utf8').replace(
        /^import .*;\r?\n/gm,
        ''
    );
    vm.runInContext(
        stripTypeScriptTypes(source, { mode: 'transform' }).replace(/export /g, '') +
            ';globalThis.api=createSiteAuth();',
        context
    );
    return {
        api: context.api,
        calls,
        events,
        storage,
        setAccount: (value) => {
            account = value;
        },
        config
    };
}
test('Global account login uses user JWT for requests and logout clears identity and private state', async () => {
    const { api, calls, events, storage } = setup();
    await api.initialize();
    assert.equal(api.getSnapshot().available, true);
    assert.equal(api.getSnapshot().isMember, false);
    await assert.rejects(api.requireMember(), /Entre/);
    assert.ok(events.some((e) => e.type === 'digistats:account-open' && e.detail.view === 'login'));
    await api.login(' user@example.test ', 'secret-password');
    assert.equal(api.getSnapshot().user.id, 'user-a');
    assert.equal(api.getSnapshot().isMember, true);
    await api.request('/rest/v1/players', { headers: { Authorization: 'Bearer stale-token' } });
    assert.equal(calls.at(-1).options.headers.get('Authorization'), 'Bearer jwt-a');
    await assert.rejects(api.requireAdmin(), /administrativa/);
    await api.logout();
    assert.equal(api.getAccessToken(), null);
    assert.equal(api.getSnapshot().profile, null);
    assert.ok(events.some((e) => e.type === 'digistats:private-data-cleared'));
    assert.ok(storage.includes('digistats.admin.session'));
});

test('Email admin identity is published during preparation while general account enforcement is disabled', async () => {
    const { api, config, events, setAccount } = setup();
    config.enabled = false;
    setAccount({
        profile: { user_id: 'user-a', status: 'active' },
        is_admin: true,
        is_member: true
    });
    await api.initialize();
    await api.login('admin@example.test', 'existing-password');
    assert.equal(api.getSnapshot().enabled, false);
    assert.equal(api.getSnapshot().isAdmin, true);
    assert.ok(
        events.some(
            (event) =>
                event.type === 'digistats:admin-auth-changed' && event.detail.authenticated === true
        )
    );
    await api.logout();
    assert.equal(
        events.filter((event) => event.type === 'digistats:admin-auth-changed').at(-1).detail
            .authenticated,
        false
    );
});
test('Signup sends no role metadata and recovery returns to the shared shell', async () => {
    const { api, calls, config } = setup();
    await api.initialize();
    await api.signup(' test@example.test ', 'long-secret-password', ' Display Name ', {
        termsAccepted: true,
        privacyRead: true,
        adultDeclared: true
    });
    const input = calls.at(-1);
    assert.equal(input.email, 'test@example.test');
    assert.equal(Object.keys(input.options.data).join(','), 'display_name');
    assert.equal(input.options.emailRedirectTo, 'https://site.example/index.html#overview');
    config.privacy_url = null;
    await api.refresh();
    await assert.rejects(
        api.signup('e@example.test', 'long-secret-password', 'Name', {
            termsAccepted: true,
            privacyRead: true,
            adultDeclared: true
        }),
        /aviso/
    );
    await assert.rejects(api.changePassword('short'), /12/);
});
test('An account with revoked membership loses admin and member access on refresh', async () => {
    const { api, setAccount } = setup();
    await api.initialize();
    await api.login('user@example.test', 'password');
    setAccount({
        profile: { user_id: 'user-a', status: 'blocked' },
        is_admin: false,
        is_member: false
    });
    await assert.rejects(api.requireMember(), /ativa/);
    assert.equal(api.getSnapshot().isMember, false);
    assert.equal(api.getSnapshot().isAdmin, false);
});
