const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const { webcrypto } = require('node:crypto');
const vm = require('node:vm');
const source = readFileSync(
    'supabase/functions/sync-new-digilab-tournaments/index.ts',
    'utf8'
).replace(/^import[\s\S]*?;\s*/gm, '');

async function runWorker(options = {}) {
    let handler;
    let claims = 0;
    const calls = [];
    const finishes = [];
    const updates = [];
    const context = vm.createContext({
        withSiteAudit: (handler) => handler,
        siteServiceHeaders: () => ({}),
        siteActorAllowed: async () => true,
        Deno: {
            env: { get: () => 'test-value' },
            serve: (callback) => {
                handler = callback;
            }
        },
        TextEncoder: globalThis.TextEncoder,
        Response: globalThis.Response,
        AbortSignal: globalThis.AbortSignal,
        crypto: webcrypto,
        setTimeout: (callback) => callback(),
        fetch: async (url, request) => {
            const body = request.body ? JSON.parse(request.body) : null;
            calls.push({ url, body });
            let payload = [];
            let status = 200;
            if (url.includes('/auth/v1/user')) payload = { id: 'admin' };
            else if (url.includes('/rest/v1/admin_users')) payload = [{ user_id: 'admin' }];
            else if (url.endsWith('/rpc/start_digilab_sync_run'))
                payload = { run_id: 'run-1', next_page: 4, busy: options.busy || false };
            else if (url.endsWith('/rpc/claim_digilab_sync_item'))
                payload =
                    claims++ === 0
                        ? [
                              {
                                  digilab_tournament_id: 123,
                                  attempt_count: 1,
                                  event_date: new Date().toISOString().slice(0, 10)
                              }
                          ]
                        : [];
            else if (url.endsWith('/rpc/finish_digilab_sync_item')) finishes.push(body);
            else if (url.endsWith('/functions/v1/preview-digilab-import')) {
                if (!body.digilab_tournament_id)
                    payload = { data: [], pagination: { last_page: 5 } };
                else
                    payload = {
                        already_linked: options.linked ? { tournament_id: 42 } : null,
                        can_auto_import: !options.blocked,
                        tournament: { date: new Date().toISOString().slice(0, 10) },
                        import_resolution: {
                            store: { store_id: 'store' },
                            format: { status: 'auto_create' },
                            unresolved_players: [
                                {
                                    status: 'unmatched',
                                    digilab_player_name: 'Ana',
                                    digilab_player_slug: 'ana'
                                }
                            ],
                            unresolved_decks: [
                                {
                                    status: 'unmatched',
                                    digilab_deck_name: 'Rosemon',
                                    digilab_deck_slug: 'rosemon'
                                }
                            ]
                        }
                    };
            } else if (url.endsWith('/functions/v1/import-digilab-tournament')) {
                payload = options.error
                    ? { error: 'Failure' }
                    : {
                          tournament_id: 42,
                          players_created: 1,
                          decks_created: 1,
                          reused: options.linked || false,
                          results_updated: options.linked ? 2 : 0
                      };
                status = options.error || 200;
            } else if (request.method === 'PATCH') updates.push(body);
            return new globalThis.Response(JSON.stringify(payload), {
                status,
                headers: options.error === 429 ? { 'Retry-After': '7200' } : {}
            });
        }
    });
    vm.runInContext(stripTypeScriptTypes(source), context);
    const response = await handler(
        new globalThis.Request('https://example.com', {
            method: 'POST',
            headers: options.admin
                ? { Authorization: 'Bearer admin' }
                : { 'x-digilab-background-token': 'test-value' },
            body: JSON.stringify(options.input || {})
        })
    );
    return { result: await response.json(), status: response.status, calls, finishes, updates };
}

test('routine imports new registrations and resumes the historical cursor while checking page one', async () => {
    const { result, calls, finishes, updates } = await runWorker();
    assert.equal(result.imported, 1);
    assert.equal(result.players_created, 1);
    assert.equal(result.decks_created, 1);
    assert.deepEqual(
        calls.filter((row) => row.body?.page).map((row) => row.body.page),
        [1, 4]
    );
    assert.ok(updates.some((row) => row.next_page === 2)); // short last response resets traversal
    assert.equal(finishes[0].p_outcome, 'imported');
    assert.ok(!calls.some((row) => row.url.includes('/rest/v1/players')));
});

test('already linked tournaments are synchronized instead of skipped', async () => {
    const { result, finishes } = await runWorker({ linked: true });
    assert.equal(result.updated, 1);
    assert.equal(finishes[0].p_outcome, 'updated');
    assert.ok(Date.parse(finishes[0].p_next_attempt) < Date.now() + 7 * 3600000);
});

test('busy routine never claims or imports an item', async () => {
    const { result, calls } = await runWorker({ busy: true });
    assert.equal(result.busy, true);
    assert.equal(calls.length, 1);
});

test('422 is recorded for review and rate limiting preserves Retry-After', async () => {
    const review = await runWorker({ error: 422 });
    assert.equal(review.finishes[0].p_outcome, 'needs_review');
    const limited = await runWorker({ error: 429 });
    assert.equal(limited.finishes[0].p_outcome, 'retry');
    assert.ok(Date.parse(limited.finishes[0].p_next_attempt) > Date.now() + 7100000);
});

test('history is read-only and targeted admin retry bypasses inventory discovery', async () => {
    const history = await runWorker({ admin: true, input: { action: 'history' } });
    assert.equal(history.status, 200);
    assert.ok(!history.calls.some((row) => row.url.includes('/rpc/')));
    const retry = await runWorker({
        admin: true,
        input: { action: 'retry', digilab_tournament_id: 123 }
    });
    assert.ok(!retry.calls.some((row) => row.body?.page));
    assert.equal(
        retry.calls.find((row) => row.url.endsWith('/rpc/claim_digilab_sync_item')).body
            .p_external_id,
        123
    );
});

test('background token cannot request admin history or retry actions', async () => {
    const { status, calls } = await runWorker({ input: { action: 'history' } });
    assert.equal(status, 403);
    assert.equal(calls.length, 0);
});
