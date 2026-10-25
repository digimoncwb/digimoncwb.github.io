const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { makePatch, summarize, sendTestInvite } = require('../scripts/configure-auth-emails');
const templates = JSON.parse(
    fs.readFileSync('supabase/templates/email-templates.patch.json', 'utf8')
);
const smtp = JSON.parse(fs.readFileSync('supabase/templates/smtp-public-settings.json', 'utf8'));
test('Auth email patch preserves SMTP secret and existing redirects while requiring verification', () => {
    const current = {
        smtp_pass: 'private-not-to-copy',
        uri_allow_list: 'http://localhost:5199/index.html',
        password_min_length: 16
    };
    const patch = makePatch(current, templates, smtp);
    assert.equal('smtp_pass' in patch, false);
    assert.equal(patch.smtp_user, 'digimoncwb@gmail.com');
    assert.equal(patch.mailer_autoconfirm, false);
    assert.equal(patch.mailer_secure_email_change_enabled, true);
    assert.equal(patch.password_min_length, 16);
    assert.ok(patch.uri_allow_list.includes('http://localhost:5199/index.html'));
    assert.ok(patch.uri_allow_list.includes('https://digimoncwb.github.io/index.html#overview'));
    assert.equal(
        JSON.stringify(summarize({ ...patch, smtp_pass: current.smtp_pass }, templates)).includes(
            current.smtp_pass
        ),
        false
    );
    assert.throws(
        () => makePatch(current, { ...templates, smtp_pass: 'unsafe' }, smtp),
        /inválido/
    );
});

test('test invite requires explicit authorization and refuses an existing recipient', async () => {
    let calls = 0;
    const options = {
        config: makePatch({}, templates, smtp),
        templates,
        smtp,
        project: 'project',
        request: async () => {
            calls++;
            return [{ user_exists: true }];
        }
    };
    await assert.rejects(sendTestInvite(options), /autorização/);
    assert.equal(calls, 0);
    await assert.rejects(sendTestInvite({ ...options, authorized: true }), /já cadastrado/);
    assert.equal(calls, 1);
});

test('test invite sends once to fixed recipient without granting admin or exposing credentials', async () => {
    let sends = 0;
    const result = await sendTestInvite({
        config: makePatch({}, templates, smtp),
        templates,
        smtp,
        project: 'project',
        authorized: true,
        request: async (route) =>
            route === '/database/query'
                ? [{ user_exists: false }]
                : [{ name: 'service_role', api_key: 'private-test-key' }],
        fetcher: async (url, options) => {
            sends++;
            assert.ok(url.includes('/auth/v1/invite?redirect_to='));
            assert.equal(options.headers.apikey, 'private-test-key');
            assert.deepEqual(JSON.parse(options.body), {
                email: 'digimoncwb@gmail.com',
                data: { display_name: 'Teste de e-mail da comunidade' }
            });
            return { ok: true };
        }
    });
    assert.equal(sends, 1);
    assert.equal(result.invite_accepted, true);
    assert.equal(result.receipt_confirmed, false);
    assert.equal(JSON.stringify(result).includes('private-test-key'), false);
});

test('a rejected invitation is never retried', async () => {
    let sends = 0;
    await assert.rejects(
        sendTestInvite({
            config: makePatch({}, templates, smtp),
            templates,
            smtp,
            project: 'project',
            authorized: true,
            request: async (route) =>
                route === '/database/query'
                    ? [{ user_exists: false }]
                    : [{ name: 'service_role', api_key: 'private-test-key' }],
            fetcher: async () => {
                sends++;
                return { ok: false, status: 500 };
            }
        }),
        /HTTP 500/
    );
    assert.equal(sends, 1);
});
