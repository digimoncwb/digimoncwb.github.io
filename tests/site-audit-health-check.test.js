const test = require('node:test');
const assert = require('node:assert/strict');
const { main } = require('../scripts/check-audit-health');
test('External checker fails on provider outage or warning and omits raw responses', async () => {
    const saved = {
        fetch: globalThis.fetch,
        log: console.log,
        token: process.env.SUPABASE_ACCESS_TOKEN,
        project: process.env.SUPABASE_PROJECT_ID
    };
    try {
        process.env.SUPABASE_ACCESS_TOKEN = 'test-private-token';
        process.env.SUPABASE_PROJECT_ID = 'vllqakohumoinpdwnsqa';
        const logs = [];
        console.log = (message) => logs.push(message);
        globalThis.fetch = async () => new Response('private-response', { status: 503 });
        await assert.rejects(main(), /HTTP 503/);
        globalThis.fetch = async () =>
            Response.json([{ health: { severity: 'warning', missing_triggers: 1 } }]);
        await assert.rejects(main(), /requer/);
        globalThis.fetch = async () =>
            Response.json([
                {
                    health: {
                        severity: 'ok',
                        missing_triggers: 0,
                        failed_integrations_24h: 2,
                        unresolved_failed_integrations_24h: 0,
                        recovered_failed_integrations_24h: 2
                    }
                }
            ]);
        await main();
        const recovered = JSON.parse(logs.at(-1));
        assert.equal(recovered.failed_integrations_24h, 2);
        assert.equal(recovered.recovered_failed_integrations_24h, 2);
        assert.equal(recovered.unresolved_failed_integrations_24h, 0);
        assert.equal(
            logs.some(
                (line) => line.includes('test-private-token') || line.includes('private-response')
            ),
            false
        );
    } finally {
        globalThis.fetch = saved.fetch;
        console.log = saved.log;
        if (saved.token === undefined) delete process.env.SUPABASE_ACCESS_TOKEN;
        else process.env.SUPABASE_ACCESS_TOKEN = saved.token;
        if (saved.project === undefined) delete process.env.SUPABASE_PROJECT_ID;
        else process.env.SUPABASE_PROJECT_ID = saved.project;
    }
});
