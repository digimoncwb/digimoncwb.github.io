const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
function memoryStorage() {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key)
    };
}
function setup(persistent = memoryStorage(), temporary = memoryStorage(), browser = {}) {
    let session = null,
        callback;
    let accountError = null;
    let persistProfile = true;
    let authStorage;
    let clientOptions;
    const browserLocation = {
        href: browser.callbackUrl || 'https://site.example/index.html#decks'
    };
    let oauthError = null;
    let signupResult = {
        data: { user: { id: 'new-user', identities: [{ id: 'new-identity' }] } },
        error: null
    };
    const rpcCalls = [];
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
            async signInWithOAuth(input) {
                calls.push(input);
                return {
                    data: { url: 'https://accounts.google.com/o/oauth2/v2/auth' },
                    error: oauthError
                };
            },
            onAuthStateChange(fn) {
                callback = fn;
            },
            async getSession() {
                if (!session)
                    session = JSON.parse(authStorage.getItem('digistats.site-account') || 'null');
                return { data: { session }, error: null };
            },
            async signInWithPassword(input) {
                calls.push(input);
                session = {
                    access_token: 'jwt-a',
                    user: { id: 'user-a', email: input.email, email_confirmed_at: '2026-01-01' }
                };
                authStorage.setItem('digistats.site-account', JSON.stringify(session));
                return { data: { session }, error: null };
            },
            async signOut() {
                session = null;
                authStorage.removeItem('digistats.site-account');
                callback('SIGNED_OUT', null);
                return { error: null };
            },
            async signUp(input) {
                calls.push(input);
                return signupResult;
            },
            async resetPasswordForEmail(email, options) {
                calls.push({ email, options });
                return { error: null };
            },
            async resend(input) {
                calls.push(input);
                return { error: null };
            },
            async updateUser(input) {
                calls.push(input);
                return { error: null };
            }
        },
        async rpc(name, parameters) {
            rpcCalls.push({ name, parameters });
            if (name === 'save_my_site_profile_legal') {
                account = { ...account, legal_current: true };
                return { data: account.profile, error: null };
            }
            return {
                data: name === 'site_account_status' ? config : account,
                error: name === 'my_site_account' ? accountError : null
            };
        }
    };
    const context = {
        window: {
            ...browser,
            localStorage: persistent,
            sessionStorage: temporary,
            APP_CONFIG: {
                SUPABASE_URL: 'https://project.example',
                SUPABASE_ANON_KEY: 'public-key'
            },
            dispatchEvent: (e) => events.push(e),
            history: {
                state: null,
                replaceState: (_state, _title, href) => {
                    browserLocation.href = String(href);
                }
            }
        },
        document: { querySelector: () => null },
        location: browserLocation,
        sessionStorage: {
            removeItem: (key) => {
                storage.push(key);
                temporary.removeItem(key);
            }
        },
        createClient: (_url, _key, options) => {
            clientOptions = options;
            authStorage = options.auth.storage;
            return client;
        },
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
            if (
                url.endsWith('/save_my_site_profile_legal') ||
                url.endsWith('/update_my_site_profile')
            ) {
                const input = JSON.parse(options.body);
                if (persistProfile)
                    account = {
                        ...account,
                        ...(url.endsWith('/save_my_site_profile_legal')
                            ? { legal_current: true, is_member: true }
                            : {}),
                        profile: {
                            ...account.profile,
                            username: input.p_username,
                            display_name: input.p_display_name
                        }
                    };
                return Response.json(account.profile);
            }
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
        setAccountError: (value) => {
            accountError = value;
        },
        setPersistProfile: (value) => {
            persistProfile = value;
        },
        config,
        rpcCalls,
        setSignupResult: (value) => {
            signupResult = value;
        },
        getClientOptions: () => clientOptions,
        getLocation: () => browserLocation.href,
        setOAuthError: (value) => {
            oauthError = value;
        }
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

test('Remember me restores the account after reopening and logout removes persisted credentials', async () => {
    const persistent = memoryStorage();
    const temporary = memoryStorage();
    const first = setup(persistent, temporary).api;
    await first.initialize();
    assert.equal(first.getRememberMe(), true);
    await first.login('user@example.test', 'password', true);
    assert.ok(persistent.getItem('digistats.site-account'));
    assert.equal(temporary.getItem('digistats.site-account'), null);
    const reopened = setup(persistent, memoryStorage()).api;
    await reopened.initialize();
    assert.equal(reopened.getSnapshot().user.id, 'user-a');
    await reopened.logout();
    assert.equal(persistent.getItem('digistats.site-account'), null);
    const afterLogout = setup(persistent, memoryStorage()).api;
    await afterLogout.initialize();
    assert.equal(afterLogout.getSnapshot().user, null);
});

test('Restored Google profile exposes its avatar and switching accounts clears it', async () => {
    const persistent = memoryStorage();
    const avatarUrl = 'https://lh3.googleusercontent.com/example-avatar';
    persistent.setItem(
        'digistats.site-account',
        JSON.stringify({
            access_token: 'jwt-google',
            user: {
                id: 'user-a',
                email: 'google@example.test',
                email_confirmed_at: '2026-01-01',
                user_metadata: { avatar_url: 'https://example.test/old-avatar' },
                identities: [{ provider: 'google', identity_data: { picture: avatarUrl } }]
            }
        })
    );
    const { api } = setup(persistent);
    await api.initialize();
    assert.equal(api.getSnapshot().user.avatarUrl, avatarUrl);
    await api.logout();
    assert.equal(api.getSnapshot().user, null);
    await api.login('email@example.test', 'password');
    assert.equal(api.getSnapshot().user.avatarUrl, undefined);
});

test('Google photo in user metadata is available without linked identity data', async () => {
    const persistent = memoryStorage();
    const avatarUrl = 'https://lh3.googleusercontent.com/metadata-avatar';
    persistent.setItem(
        'digistats.site-account',
        JSON.stringify({
            access_token: 'jwt-google',
            user: {
                id: 'user-a',
                email_confirmed_at: '2026-01-01',
                user_metadata: { avatar_url: 'invalid-url', picture: avatarUrl }
            }
        })
    );
    const { api } = setup(persistent);
    await api.initialize();
    assert.equal(api.getSnapshot().user.avatarUrl, avatarUrl);
});

test('First confirmed login requires the Bandai link and completing it refreshes membership', async () => {
    const instance = setup();
    instance.setAccount({
        profile: {
            user_id: 'user-a',
            username: 'user_a',
            display_name: 'User A',
            status: 'active',
            player_id: null
        },
        legal_current: true,
        is_member: false,
        is_admin: false,
        player_link_required: true
    });
    await instance.api.initialize();
    await instance.api.login('user@example.test', 'password');
    assert.equal(instance.api.getSnapshot().playerLinkRequired, true);
    await assert.rejects(instance.api.requireMember(), /Bandai/);
    instance.setAccount({
        profile: {
            user_id: 'user-a',
            username: 'user_a',
            display_name: 'User A',
            status: 'active',
            player_id: 'player-a'
        },
        legal_current: true,
        is_member: true,
        is_admin: false,
        player_link_required: false
    });
    await instance.api.refresh();
    assert.equal(instance.api.getSnapshot().playerLinkRequired, false);
    await instance.api.requireMember();
    await instance.api.logout();
    assert.equal(instance.api.getSnapshot().playerLinkRequired, false);
});

test('Unchecked remember me survives page reload only within the current tab', async () => {
    const persistent = memoryStorage();
    const temporary = memoryStorage();
    const first = setup(persistent, temporary).api;
    await first.initialize();
    await first.login('user@example.test', 'password', false);
    assert.equal(persistent.getItem('digistats.site-account'), null);
    assert.ok(temporary.getItem('digistats.site-account'));
    const reloaded = setup(persistent, temporary).api;
    await reloaded.initialize();
    assert.equal(reloaded.getSnapshot().user.id, 'user-a');
    assert.equal(reloaded.getRememberMe(), false);
    const reopened = setup(persistent, memoryStorage()).api;
    await reopened.initialize();
    assert.equal(reopened.getSnapshot().user, null);
    await reloaded.logout();
    assert.equal(temporary.getItem('digistats.site-account'), null);
});

test('Remembered email survives logout while password storage is delegated to the browser', async () => {
    const persistent = memoryStorage();
    let savedCredential = null;
    const browser = {
        PasswordCredential: class {
            constructor({ id, password }) {
                this.id = id;
                this.password = password;
                this.type = 'password';
            }
        },
        navigator: {
            credentials: {
                store: async (value) => {
                    savedCredential = value;
                },
                get: async () => savedCredential
            }
        }
    };
    const api = setup(persistent, memoryStorage(), browser).api;
    await api.initialize();
    await api.login(' user@example.test ', 'private-password', true);
    await api.logout();
    assert.equal(api.getSnapshot().user, null);
    assert.equal(api.getRememberedEmail(), 'user@example.test');
    assert.equal(persistent.getItem('digistats.remembered-email'), 'user@example.test');
    assert.equal(persistent.getItem('digistats.site-account'), null);
    const recalled = await api.recallLogin();
    assert.equal(recalled.email, 'user@example.test');
    assert.equal(recalled.password, 'private-password');
    await api.login('user@example.test', 'private-password', false);
    await api.logout();
    assert.equal(api.getRememberedEmail(), '');
    assert.equal(persistent.getItem('digistats.remembered-email'), null);
    assert.equal(await api.recallLogin(), null);
});

test('Basic profile changes work before legal documents are configured without recording acceptance', async () => {
    const { api, config, calls } = setup();
    config.legal_ready = false;
    config.privacy_url = null;
    config.terms_url = null;
    await api.initialize();
    await api.login('user@example.test', 'password');
    await api.saveProfile('renamed', 'Novo nome', {
        termsAccepted: false,
        privacyRead: false,
        adultDeclared: false
    });
    assert.equal(api.getSnapshot().profile.username, 'renamed');
    const write = calls.find((call) => call.url?.endsWith('/update_my_site_profile'));
    assert.ok(write);
    assert.equal(
        Object.keys(JSON.parse(write.options.body)).sort().join(','),
        'p_display_name,p_username'
    );
    assert.equal(
        calls.some((call) => call.url?.endsWith('/save_my_site_profile_legal')),
        false
    );
});

test('Profile changes persist across account reload and confirmation resend uses the shared callback', async () => {
    const { api, calls } = setup();
    await api.initialize();
    await api.login('user@example.test', 'password');
    await api.saveProfile(' New_Name ', ' Updated Name ', {
        termsAccepted: true,
        privacyRead: true,
        adultDeclared: true
    });
    assert.equal(api.getSnapshot().profile.username, 'new_name');
    await api.refresh();
    assert.equal(api.getSnapshot().profile.username, 'new_name');
    assert.equal(api.getSnapshot().profile.display_name, 'Updated Name');
    await api.resendConfirmation(' user@example.test ');
    const resend = calls.at(-1);
    assert.equal(resend.type, 'signup');
    assert.equal(resend.email, 'user@example.test');
    assert.equal(resend.options.emailRedirectTo, 'https://site.example/index.html');
});

test('Profile save rejects an unchanged result and errors reading the saved account', async () => {
    const { api, setPersistProfile, setAccountError } = setup();
    await api.initialize();
    await api.login('user@example.test', 'password');
    const declarations = { termsAccepted: true, privacyRead: true, adultDeclared: true };
    setPersistProfile(false);
    await assert.rejects(api.saveProfile('changed', 'Changed', declarations), /confirmar/);
    setPersistProfile(true);
    setAccountError({ message: 'Falha ao consultar perfil' });
    await assert.rejects(api.saveProfile('changed', 'Changed', declarations), /Falha ao consultar/);
});

test('Community delete buttons match ownership permissions during and after account rollout', () => {
    const source = readFileSync('frontend/shared/site-auth.ts', 'utf8').replace(
        /^import .*;\r?\n/gm,
        ''
    );
    const allowed = vm.runInNewContext(
        stripTypeScriptTypes(source, { mode: 'transform' }).replace(/export /g, '') +
            ';canDeleteCommunityDeck'
    );
    for (const enabled of [false, true]) {
        const member = { enabled, user: { id: 'a' }, isMember: true, isAdmin: false };
        assert.equal(allowed(member, 'a'), true);
        assert.equal(allowed(member, 'b'), false);
        assert.equal(allowed(member, null), false);
        assert.equal(allowed({ ...member, isAdmin: true }, 'b'), false);
        assert.equal(allowed({ ...member, isAdmin: true }, null), true);
        assert.equal(allowed({ ...member, isAdmin: true, user: null }, null), false);
        assert.equal(allowed({ ...member, isMember: false }, 'a'), false);
    }
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
    assert.equal(input.options.emailRedirectTo, 'https://site.example/index.html');
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

test('Signup warns about duplicate email for explicit and obfuscated Auth responses', async () => {
    const { api, setSignupResult } = setup();
    await api.initialize();
    const declarations = { termsAccepted: true, privacyRead: true, adultDeclared: true };
    for (const result of [
        { data: { user: { id: 'obfuscated', identities: [] } }, error: null },
        { data: null, error: { code: 'user_already_exists' } },
        { data: null, error: { code: 'email_exists' } }
    ]) {
        setSignupResult(result);
        await assert.rejects(
            api.signup('existing@example.test', 'a-long-password', 'Name', declarations),
            /Já existe uma conta.*Login/
        );
    }
});

test('Signup declarations are recorded only after verified login and only for the versions read', async () => {
    const persistent = memoryStorage();
    const testAccount = setup(persistent);
    await testAccount.api.initialize();
    testAccount.setSignupResult({
        data: { user: { id: 'user-a', identities: [{ id: 'identity' }] } },
        error: null
    });
    const declarations = { termsAccepted: true, privacyRead: true, adultDeclared: true };
    await testAccount.api.signup('user@example.test', 'a-long-password', 'Name', declarations);
    assert.equal(
        testAccount.rpcCalls.some((call) => call.name === 'save_my_site_profile_legal'),
        false
    );
    await testAccount.api.login('user@example.test', 'a-long-password');
    const acceptance = testAccount.rpcCalls.find(
        (call) => call.name === 'save_my_site_profile_legal'
    );
    assert.equal(acceptance.parameters.p_terms_version, 'v1');
    assert.equal(acceptance.parameters.p_ack_privacy, true);
    assert.equal(persistent.getItem('digistats.pending-signup-declarations.user-a'), null);
    assert.equal(testAccount.api.getSnapshot().legalCurrent, true);
    await testAccount.api.logout();
    testAccount.setAccount({
        profile: { user_id: 'user-a', username: 'user_a', display_name: 'User', status: 'active' },
        legal_current: false
    });
    await testAccount.api.signup('user@example.test', 'a-long-password', 'Name', declarations);
    testAccount.config.terms_version = 'v2';
    await testAccount.api.refresh();
    const before = testAccount.rpcCalls.filter(
        (call) => call.name === 'save_my_site_profile_legal'
    ).length;
    await testAccount.api.login('user@example.test', 'a-long-password');
    assert.equal(
        testAccount.rpcCalls.filter((call) => call.name === 'save_my_site_profile_legal').length,
        before
    );
    assert.equal(testAccount.api.getSnapshot().legalCurrent, false);
});

test('Provider email callbacks use their matching flow while normal access keeps PKCE', async () => {
    for (const type of ['invite', 'recovery']) {
        const persistent = memoryStorage();
        persistent.setItem(
            'digistats.site-account',
            JSON.stringify({
                access_token: 'verified-token',
                user: { id: 'user-a', email_confirmed_at: '2026-10-25' }
            })
        );
        const instance = setup(persistent, memoryStorage(), {
            callbackUrl: `https://site.example/index.html#access_token=test-token&refresh_token=test-refresh&type=${type}`
        });
        assert.equal(instance.getClientOptions().auth.flowType, 'implicit');
        await instance.api.initialize();
        assert.equal(instance.api.getSnapshot().recoveryRequired, true);
    }
    const normal = setup();
    assert.equal(normal.getClientOptions().auth.flowType, 'pkce');
    const incomplete = setup(memoryStorage(), memoryStorage(), {
        callbackUrl: 'https://site.example/index.html#access_token=incomplete&type=recovery'
    });
    assert.equal(incomplete.getClientOptions().auth.flowType, 'pkce');
    await incomplete.api.initialize();
    assert.equal(incomplete.api.getSnapshot().recoveryRequired, false);
});

test('Google login keeps the selected session lifetime and requires the verified accounts own legal acceptance', async () => {
    const persistent = memoryStorage(),
        temporary = memoryStorage();
    const start = setup(persistent, temporary);
    await start.api.initialize();
    await start.api.loginWithGoogle(false);
    const request = start.calls.at(-1);
    assert.equal(request.provider, 'google');
    assert.equal(request.options.redirectTo, 'https://site.example/index.html');
    assert.equal(request.options.scopes, 'openid email profile');
    assert.equal(request.options.queryParams.prompt, 'select_account');
    assert.equal(start.api.getRememberMe(), false);
    assert.ok(Number(temporary.getItem('digistats.google-sign-in-started')) > 0);
    temporary.setItem(
        'digistats.site-account',
        JSON.stringify({
            access_token: 'google-session',
            user: { id: 'user-a', email: 'user@example.test', email_confirmed_at: '2026-10-25' }
        })
    );
    const returned = setup(persistent, temporary);
    await returned.api.initialize();
    assert.equal(returned.api.getSnapshot().profile.user_id, 'user-a');
    assert.equal(returned.api.getSnapshot().profileRequired, true);
    assert.equal(returned.api.getSnapshot().isMember, false);
    await returned.api.saveProfile('user_a', 'User A', {
        termsAccepted: true,
        privacyRead: true,
        adultDeclared: true
    });
    assert.equal(returned.api.getSnapshot().profileRequired, false);
    assert.equal(returned.api.getSnapshot().legalCurrent, true);
    assert.equal(returned.api.getSnapshot().isMember, true);
});

test('Remembered Google session survives reopening the site and explicit logout clears it', async () => {
    const persistent = memoryStorage(),
        temporary = memoryStorage();
    const start = setup(persistent, temporary);
    await start.api.initialize();
    await start.api.loginWithGoogle(true);
    assert.equal(start.api.getRememberMe(), true);
    // Simulate the SDK storing the completed OAuth callback in persistent storage.
    persistent.setItem(
        'digistats.site-account',
        JSON.stringify({
            access_token: 'google-session',
            user: {
                id: 'user-a',
                email: 'google@example.test',
                email_confirmed_at: '2026-10-25',
                user_metadata: { avatar_url: 'https://lh3.googleusercontent.com/profile' }
            }
        })
    );
    const reopened = setup(persistent, memoryStorage());
    await reopened.api.initialize();
    assert.equal(reopened.api.getSnapshot().user.email, 'google@example.test');
    assert.equal(
        reopened.api.getSnapshot().user.avatarUrl,
        'https://lh3.googleusercontent.com/profile'
    );
    assert.equal(reopened.api.getRememberMe(), true);
    await reopened.api.logout();
    assert.equal(persistent.getItem('digistats.site-account'), null);
    const afterLogout = setup(persistent, memoryStorage());
    await afterLogout.api.initialize();
    assert.equal(afterLogout.api.getSnapshot().user, null);
});

test('Google login failures restore storage preference and do not leave a stale return marker', async () => {
    const temporary = memoryStorage();
    const instance = setup(memoryStorage(), temporary);
    await instance.api.initialize();
    instance.setOAuthError({ code: 'provider_disabled' });
    await assert.rejects(instance.api.loginWithGoogle(false), /Google ainda não está disponível/);
    assert.equal(instance.api.getRememberMe(), true);
    assert.equal(temporary.getItem('digistats.google-sign-in-started'), null);
});

test('Legacy route-prefixed email callbacks are repaired before SDK initialization without changing ordinary routes', async () => {
    for (const type of ['signup', 'recovery', 'invite', 'email_change']) {
        const instance = setup(memoryStorage(), memoryStorage(), {
            callbackUrl: `https://site.example/index.html#overview#access_token=test-token&refresh_token=test-refresh&type=${type}`
        });
        assert.equal(instance.getClientOptions().auth.flowType, 'implicit');
        assert.equal(
            new URL(instance.getLocation()).hash,
            `#access_token=test-token&refresh_token=test-refresh&type=${type}`
        );
    }
    for (const hash of [
        '#decks',
        '#overview#section',
        '#overview#access_token=incomplete&type=recovery'
    ]) {
        const instance = setup(memoryStorage(), memoryStorage(), {
            callbackUrl: `https://site.example/index.html${hash}`
        });
        assert.equal(instance.getClientOptions().auth.flowType, 'pkce');
        assert.equal(new URL(instance.getLocation()).hash, hash);
    }
    const instance = setup();
    await instance.api.initialize();
    await instance.api.recover('user@example.test');
    assert.equal(instance.calls.at(-1).options.redirectTo, 'https://site.example/index.html');
});

test('Enforced accounts without current declarations open the profile and regain access after authenticated acceptance', async () => {
    const instance = setup();
    instance.setAccount({
        profile: {
            user_id: 'user-a',
            username: 'user_a',
            display_name: 'User A',
            status: 'active'
        },
        is_admin: false,
        is_member: false,
        legal_current: false
    });
    await instance.api.initialize();
    await instance.api.login('user@example.test', 'a-long-password');
    assert.equal(instance.api.getSnapshot().profileRequired, true);
    assert.equal(instance.api.getSnapshot().isMember, false);
    await assert.rejects(instance.api.requireMember(), /aceites em Minha conta/);
    await instance.api.saveProfile('user_a', 'User A', {
        termsAccepted: true,
        privacyRead: true,
        adultDeclared: true
    });
    assert.equal(instance.api.getSnapshot().profileRequired, false);
    assert.equal(instance.api.getSnapshot().isMember, true);
    assert.equal(instance.api.getSnapshot().legalCurrent, true);
});
