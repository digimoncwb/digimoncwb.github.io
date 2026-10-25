const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
function helper(fetch) {
    const source = stripTypeScriptTypes(
        readFileSync('supabase/functions/_shared/site-security.ts', 'utf8'),
        { mode: 'transform' }
    ).replace(/export /g, '');
    const context = {
        fetch,
        Request,
        Response,
        Headers,
        URL,
        AbortSignal,
        crypto: webcrypto,
        Deno: {
            env: {
                get: (name) =>
                    name === 'SUPABASE_URL' ? 'https://project.example' : 'server-secret'
            }
        },
        console: { error: () => {} }
    };
    vm.createContext(context);
    vm.runInContext(
        source + ';globalThis.api={withSiteAudit,siteServiceHeaders,siteActorAllowed};',
        context
    );
    return context.api;
}
test('Integration audit discards spoofed actor and correlation, records validated JWT and response outcome', async () => {
    const calls = [];
    const api = helper(async (url, options) => {
        calls.push({ url, options });
        return Response.json(url.endsWith('/auth/v1/user') ? { id: 'validated-user' } : null);
    });
    let received;
    const wrapped = api.withSiteAudit(async (req) => {
        received = api.siteServiceHeaders(req);
        assert.equal(await req.text(), 'payload');
        return new Response('denied', { status: 403 });
    });
    const response = await wrapped(
        new Request('https://project.example/functions/v1/import-test', {
            method: 'POST',
            body: 'payload',
            headers: {
                Authorization: 'Bearer user-token',
                'x-site-actor-id': 'spoofed-admin',
                'x-site-operation-id': 'forged'
            }
        })
    );
    assert.equal(response.status, 403);
    assert.equal(received['x-site-actor-id'], 'validated-user');
    assert.notEqual(received['x-site-operation-id'], 'forged');
    const recorded = calls.find((call) => call.url.endsWith('/record_site_integration_event'));
    const event = JSON.parse(recorded.options.body);
    assert.equal(event.p_actor_user_id, 'validated-user');
    assert.equal(event.p_status, 403);
    assert.equal(event.p_execution_id, response.headers.get('x-site-operation-id'));
    assert.equal(JSON.stringify(event).includes('user-token'), false);
    assert.equal(recorded.options.headers.Authorization, 'Bearer server-secret');
});
test('Integration permission fails closed on unavailable authorization and never trusts invalid identity', async () => {
    const events = [];
    const api = helper(async (url, options) => {
        if (url.endsWith('/auth/v1/user'))
            return Response.json({ error: 'invalid' }, { status: 401 });
        if (url.endsWith('/site_actor_authorized')) throw Error('unavailable');
        if (url.endsWith('/record_site_integration_event')) events.push(JSON.parse(options.body));
        return Response.json(null);
    });
    assert.equal(await api.siteActorAllowed(null, 'some-user'), false);
    const wrapped = api.withSiteAudit(async (req) => {
        assert.equal(api.siteServiceHeaders(req)['x-site-actor-id'], '');
        throw Error('private internal error');
    });
    const response = await wrapped(
        new Request('https://project.example/functions/v1/test', {
            headers: { Authorization: 'Bearer invalid', 'x-site-actor-id': 'admin' }
        })
    );
    assert.equal(response.status, 500);
    assert.equal((await response.text()).includes('private internal error'), false);
    assert.equal(events[0].p_actor_user_id, null);
    assert.equal(events[0].p_status, 500);
});
test('CORS preflight passes without recording a data operation', async () => {
    const api = helper(async () => {
        throw Error('unexpected fetch');
    });
    const response = await api.withSiteAudit(async () => new Response(null, { status: 204 }))(
        new Request('https://example.test/f', { method: 'OPTIONS' })
    );
    assert.equal(response.status, 204);
});

test('Server-to-server correlation preserves only trusted parent and actor headers', async () => {
    const calls = [];
    const api = helper(async (url, options) => {
        calls.push({ url, options });
        return Response.json(null);
    });
    const parent = '90000000-0000-0000-0000-000000000001';
    const actor = '90000000-0000-0000-0000-000000000002';
    const response = await api.withSiteAudit(async (req) => {
        assert.equal(req.headers.get('x-site-parent-operation-id'), parent);
        assert.equal(api.siteServiceHeaders(req)['x-site-actor-id'], actor);
        return Response.json({ ok: true });
    })(
        new Request('https://project.example/functions/v1/test', {
            headers: {
                Authorization: 'Bearer server-secret',
                'x-site-operation-id': parent,
                'x-site-actor-id': actor
            }
        })
    );
    const event = JSON.parse(
        calls.find((call) => call.url.endsWith('/record_site_integration_event')).options.body
    );
    assert.equal(event.p_parent_operation_id, parent);
    assert.equal(event.p_actor_user_id, actor);
    assert.notEqual(response.headers.get('x-site-operation-id'), parent);
    assert.equal(
        calls.some((call) => call.url.endsWith('/auth/v1/user')),
        false
    );
});
