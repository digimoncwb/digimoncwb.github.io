const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeAuthEmailLogs } = require('../scripts/diagnose-auth-email');

test('Email diagnostics classify SMTP failures and submission logs without exposing private payloads', () => {
    const report = summarizeAuthEmailLogs([
        {
            timestamp: '2026-10-25T22:56:00Z',
            event_message:
                'SMTP 535 Authentication failed: private@example.test password=secret token=private-token'
        },
        {
            timestamp: '2026-10-25T22:56:01Z',
            event_message: 'mail.send',
            log_attributes: { email: 'private@example.test', token: 'private-token' }
        },
        { timestamp: '2026-10-25T22:56:02Z', event_message: 'smtp recipient rejected 550' },
        { timestamp: '2026-10-25T22:56:03Z', event_message: 'recover: rate_limit exceeded' }
    ]);
    assert.ok(report.email_events[0].categories.includes('smtp_authentication_failed'));
    assert.ok(report.email_events[1].categories.includes('mail_send_logged'));
    assert.ok(report.email_events[2].categories.includes('delivery_rejected'));
    assert.ok(report.email_events[3].categories.includes('send_rate_limit'));
    for (const secret of ['private@example.test', 'private-token', 'password=secret'])
        assert.equal(JSON.stringify(report).includes(secret), false);
});
