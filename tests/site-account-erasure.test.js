const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
    vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const jobId = 'a0000000-0000-0000-0000-000000000001';
function setup({
    admin = true,
    allowed = true,
    stage = 'prepared',
    missing = false,
    deleteFails = false
} = {}) {
    const calls = [];
    let handler;
    const client = {
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: admin ? { user_id: 'admin' } : null })
                })
            })
        }),
        auth: {
            getUser: async () => ({ data: { user: { id: 'admin' } }, error: null }),
            admin: {
                deleteUser: async (id) => {
                    calls.push({ delete: id });
                    return {
                        error: deleteFails
                            ? { code: 'storage_owned', message: 'private detail' }
                            : null
                    };
                },
                getUserById: async () =>
                    deleteFails
                        ? { data: { user: { id: 'target' } }, error: null }
                        : { data: { user: null }, error: { status: 404, code: 'user_not_found' } }
            }
        },
        rpc: async (name, args) => {
            calls.push({ name, args });
            return name === 'site_account_erasure_target'
                ? {
                      data: missing ? null : { user_id: 'target', stage },
                      error: missing ? {} : null
                  }
                : { error: null };
        }
    };
    const context = {
        Request,
        Response,
        Headers,
        createClient: () => client,
        withSiteAudit: (fn) => fn,
        siteActorAllowed: async () => allowed,
        siteServiceHeaders: () => ({}),
        Deno: {
            env: {
                get: (name) =>
                    name === 'SUPABASE_URL' ? 'https://project.example' : 'server-secret'
            },
            serve: (fn) => {
                handler = fn;
            }
        }
    };
    vm.createContext(context);
    const source = fs
        .readFileSync('supabase/functions/erase-site-account/index.ts', 'utf8')
        .replace(/^import[\s\S]*?;\r?\n/gm, '');
    vm.runInContext(stripTypeScriptTypes(source, { mode: 'transform' }), context);
    return {
        calls,
        invoke: () =>
            handler(
                new Request('https://project.example/functions/v1/erase-site-account', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer user-token' },
                    body: JSON.stringify({ job_id: jobId, confirm_delete_credentials: true })
                })
            )
    };
}
test('Credential removal requires admin authorization and a prepared server-side job', async () => {
    for (const options of [{ admin: false }, { allowed: false }, { missing: true }]) {
        const { calls, invoke } = setup(options);
        const response = await invoke();
        assert.ok(response.status >= 400);
        assert.equal(
            calls.some((c) => 'delete' in c),
            false
        );
    }
});
test('Confirmed provider deletion leaves external review pending and failures preserve a retryable job', async () => {
    for (const deleteFails of [false, true]) {
        const { calls, invoke } = setup({ deleteFails });
        const response = await invoke();
        const body = await response.json();
        assert.equal(response.status, deleteFails ? 409 : 200);
        const finished = calls.find((c) => c.name === 'finish_site_account_auth_erasure');
        assert.equal(finished.args.p_success, !deleteFails);
        assert.equal(JSON.stringify(body).includes('private detail'), false);
        if (!deleteFails) assert.equal(body.external_review_required, true);
    }
    const { calls, invoke } = setup({ stage: 'auth_deleted' });
    assert.equal((await invoke()).status, 200);
    assert.equal(
        calls.some((c) => 'delete' in c),
        false
    );
});
