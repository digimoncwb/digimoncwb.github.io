const test = require('node:test');
const assert = require('node:assert/strict');

test('Live account tests cannot create users or send requests without explicit disposable-account authorization', async () => {
    const previous = process.env.ACCOUNT_JOURNEY_AUTHORIZED;
    const originalFetch = globalThis.fetch;
    let requests = 0;
    try {
        process.env.ACCOUNT_JOURNEY_AUTHORIZED = 'false';
        globalThis.fetch = async () => {
            requests++;
            throw Error('Unexpected network call');
        };
        const { runLiveAccountJourney } = await import('../scripts/verify-account-journey.mjs');
        await assert.rejects(runLiveAccountJourney(), /Explicit authorization required/);
        assert.equal(requests, 0);
    } finally {
        globalThis.fetch = originalFetch;
        if (previous === undefined) delete process.env.ACCOUNT_JOURNEY_AUTHORIZED;
        else process.env.ACCOUNT_JOURNEY_AUTHORIZED = previous;
    }
});
