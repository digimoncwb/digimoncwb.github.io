const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const { randomUUID } = require('node:crypto');
const vm = require('node:vm');
const source = stripTypeScriptTypes(
    readFileSync('supabase/functions/community-pairings/index.ts', 'utf8')
).replace(/^import .*;\r?\n/gm, '');
function handler({ user = true, admin = true, revision = 4, writeError = false } = {}) {
    let serve;
    const calls = [];
    const client = {
        auth: {
            getUser: async () => ({ data: { user: user ? { id: 'admin' } : null }, error: null })
        },
        rpc: async (name, body) => {
            calls.push({ name, body });
            if (name === 'community_list') return { error: admin ? null : { message: 'denied' } };
            if (name === 'community_snapshot')
                return {
                    data: {
                        event: { revision },
                        standings: [{ id: 'a' }, { id: 'b' }],
                        matches: []
                    }
                };
            return writeError
                ? { error: new Error('Revisão concorrente') }
                : { data: { event: { revision: revision + 1 } } };
        }
    };
    vm.runInNewContext(source, {
        Deno: {
            env: { get: () => 'https://example.invalid' },
            serve: (fn) => {
                serve = fn;
            }
        },
        Response,
        Error,
        crypto: { randomUUID },
        withSiteAudit: (fn) => fn,
        createClient: (_url, _key, options) => {
            assert.equal(options.global.headers.Authorization, 'Bearer example-user-token');
            return client;
        },
        buildPairings: () => [{ p1: 'a', p2: 'b' }]
    });
    return {
        run: (rev = 4) =>
            serve(
                new Request('https://example.invalid', {
                    method: 'POST',
                    headers: {
                        Authorization: 'Bearer example-user-token',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ event_id: 'event', revision: rev })
                })
            ),
        calls
    };
}
test('pairing endpoint authenticates and authorizes before computing or persisting tables', async () => {
    let app = handler({ user: false });
    assert.equal((await app.run()).status, 401);
    assert.equal(app.calls.length, 0);
    app = handler({ admin: false });
    assert.equal((await app.run()).status, 403);
    assert.equal(app.calls.length, 1);
    app = handler();
    assert.equal((await app.run(3)).status, 400);
    assert.ok(!app.calls.some((c) => c.name === 'community_command'));
    app = handler({ writeError: true });
    const failed = await app.run();
    assert.equal(failed.status, 400);
    assert.match((await failed.json()).error, /concorrente/);
    app = handler();
    const response = await app.run();
    assert.equal(response.status, 200);
    const command = app.calls.find((c) => c.name === 'community_command');
    assert.equal(command.body.p_revision, 4);
    assert.equal(command.body.p_action, 'pair');
    assert.match(command.body.p_data.seed, /^[0-9a-f-]{36}$/);
    assert.equal(command.body.p_data.pairs.length, 1);
});
