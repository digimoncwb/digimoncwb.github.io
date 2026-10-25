const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { makePatch, summarize } = require('../scripts/configure-auth-emails');
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
