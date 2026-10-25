const test = require('node:test');
const assert = require('node:assert/strict');
const { main, googlePatch } = require('../scripts/configure-google-oauth');

test('Google provider patch requires email and nonce verification and changes only provider settings', () => {
    const patch = googlePatch(
        '123456-testclient.apps.googleusercontent.com',
        'example-secret-at-least-twenty-characters'
    );
    assert.equal(patch.external_google_enabled, true);
    assert.equal(patch.external_google_email_optional, false);
    assert.equal(patch.external_google_skip_nonce_check, false);
    assert.ok(Object.keys(patch).every((key) => key.startsWith('external_google_')));
    assert.throws(() => googlePatch('invalid', 'short'), /inválidas/);
});

test('Google configuration verifies saved flags without printing secrets or changing email login', async () => {
    const names = [
        'SUPABASE_ACCESS_TOKEN',
        'SUPABASE_PROJECT_ID',
        'GOOGLE_OAUTH_ACTION',
        'GOOGLE_OAUTH_CLIENT_ID',
        'GOOGLE_OAUTH_CLIENT_SECRET'
    ];
    const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    const originalFetch = globalThis.fetch,
        originalLog = console.log;
    try {
        Object.assign(process.env, {
            SUPABASE_ACCESS_TOKEN: 'private-management-token',
            SUPABASE_PROJECT_ID: 'vllqakohumoinpdwnsqa',
            GOOGLE_OAUTH_ACTION: 'configure',
            GOOGLE_OAUTH_CLIENT_ID: '123456-testclient.apps.googleusercontent.com',
            GOOGLE_OAUTH_CLIENT_SECRET: 'private-client-secret-at-least-twenty-characters'
        });
        const logs = [],
            writes = [];
        console.log = (line) => logs.push(line);
        let current = {
            site_url: 'https://digimoncwb.github.io/',
            external_email_enabled: true,
            mailer_autoconfirm: false,
            smtp_host: 'smtp.gmail.com',
            password_min_length: 12,
            uri_allow_list: 'https://digimoncwb.github.io/index.html#overview'
        };
        globalThis.fetch = async (_url, options) => {
            if (options.method === 'PATCH') {
                const body = JSON.parse(options.body);
                writes.push(body);
                current = { ...current, ...body };
            }
            return Response.json(current);
        };
        await main();
        assert.equal(writes.length, 1);
        const summary = JSON.parse(logs[0]);
        assert.equal(summary.google_enabled, true);
        assert.equal(summary.existing_auth_settings_preserved, true);
        assert.equal(summary.real_user_login_tested, false);
        assert.equal(logs.join('').includes(process.env.GOOGLE_OAUTH_CLIENT_SECRET), false);
        assert.equal(logs.join('').includes(process.env.SUPABASE_ACCESS_TOKEN), false);
    } finally {
        globalThis.fetch = originalFetch;
        console.log = originalLog;
        for (const name of names)
            if (saved[name] === undefined) delete process.env[name];
            else process.env[name] = saved[name];
    }
});
