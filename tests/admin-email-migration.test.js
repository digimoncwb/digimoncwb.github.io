const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePlan, authPatch } = require('../scripts/migrate-admin-account-emails');
const item = {
    user_id: '10000000-0000-0000-0000-000000000001',
    player_id: '20000000-0000-0000-0000-000000000001',
    email: 'Admin@example.test',
    display_name: 'Admin'
};
test('Admin migration accepts explicit identities and refuses invalid or duplicate plans', () => {
    assert.equal(validatePlan([item]).length, 1);
    assert.throws(() => validatePlan([item, item]), /duplicidade/);
    assert.throws(() => validatePlan([{ ...item, user_id: 'unknown' }]), /inválido/);
    assert.throws(
        () => validatePlan([{ ...item, email: 'old@admin.digistats.local' }]),
        /inválido/
    );
    assert.throws(() => validatePlan([]), /inválido/);
});
test('Admin Auth migration changes only the email and never resets passwords or fabricates confirmation', () => {
    assert.deepEqual(authPatch({ ...item, password: 'do-not-copy', email_confirm: true }), {
        email: 'admin@example.test'
    });
});
