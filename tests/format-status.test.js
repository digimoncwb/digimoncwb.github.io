/* global Response, structuredClone */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const { returnFormatToDraft, setFormatPublication, loadAdminGameFormats } = vm.runInNewContext(
    stripTypeScriptTypes(
        readFileSync('frontend/apps/workspace/format-status-service.ts', 'utf8')
    ).replace(/export /g, '') +
        '\n({returnFormatToDraft,setFormatPublication,loadAdminGameFormats})'
);
function session({ restore = true, status = 'published', patchStatus = 200, patchRows } = {}) {
    const format = {
        id: 3,
        rules_revision: 8,
        rules_status: status,
        name: 'DigiCrest',
        validation_rules: {
            main_count: 50,
            copies: 4,
            egg_max: 5,
            card_points: { 'BT1-001': { name: 'Agumon', points: 30 } }
        }
    };
    const calls = [];
    return {
        format,
        calls,
        api: {
            restore: async () => restore,
            refresh: async () => {},
            verify: async () => {},
            request: async (path, options) => {
                calls.push({ path, options });
                if (options.method === 'GET') return Response.json([format]);
                if (patchStatus !== 200)
                    return Response.json({ message: 'Erro de escrita' }, { status: patchStatus });
                if (patchRows) return Response.json(patchRows);
                Object.assign(format, JSON.parse(options.body));
                format.rules_revision++;
                return Response.json([format]);
            }
        }
    };
}
test('Returning to draft patches publication only and preserves rules, points and identity', async () => {
    const state = session();
    const before = structuredClone(state.format);
    await returnFormatToDraft(3, state.api);
    assert.equal(state.format.rules_status, 'draft');
    assert.deepEqual(state.format.validation_rules, before.validation_rules);
    assert.equal(state.format.name, before.name);
    assert.equal(state.format.id, before.id);
    const write = state.calls.find((call) => call.options.method === 'PATCH');
    assert.match(write.path, /rules_revision=eq.8$/);
    assert.deepEqual(Object.keys(JSON.parse(write.options.body)).sort(), [
        'change_note',
        'rules_status'
    ]);
});
test('Draft transition handles failed access, concurrent changes and already-draft retries', async () => {
    let state = session({ restore: false });
    await assert.rejects(() => returnFormatToDraft(3, state.api), /Entre no Admin/);
    assert.equal(state.calls.length, 0);
    state = session({ status: 'draft' });
    await returnFormatToDraft(3, state.api);
    assert.equal(state.calls.length, 1);
    for (const [options, message] of [
        [{ patchStatus: 403 }, /administradores/],
        [{ patchStatus: 500 }, /Erro de escrita/],
        [{ patchRows: [] }, /mudou durante/]
    ]) {
        state = session(options);
        await assert.rejects(() => returnFormatToDraft(3, state.api), message);
        assert.equal(state.format.rules_status, 'published');
    }
});

test('Publishing a draft preserves all rules and scores and uses the latest revision', async () => {
    const state = session({ status: 'draft' });
    const rules = structuredClone(state.format.validation_rules);
    await setFormatPublication(3, 'published', state.api);
    assert.equal(state.format.rules_status, 'published');
    assert.deepEqual(state.format.validation_rules, rules);
    const write = state.calls.find((call) => call.options.method === 'PATCH');
    assert.match(write.path, /rules_revision=eq.8$/);
    assert.deepEqual(Object.keys(JSON.parse(write.options.body)).sort(), [
        'change_note',
        'rules_status'
    ]);
});

test('Publishing requires complete rules and resolved point codes before writing', async () => {
    for (const invalid of [
        null,
        { main_count: 50 },
        { main_count: 50, egg_max: 5, copies: 4, points_pending: [{ code: 'EX6', points: 2 }] }
    ]) {
        const state = session({ status: 'draft' });
        state.format.validation_rules = invalid;
        await assert.rejects(
            () => setFormatPublication(3, 'published', state.api),
            /antes de publicar/
        );
        assert.equal(state.format.rules_status, 'draft');
        assert.ok(state.calls.every((call) => call.options.method === 'GET'));
    }
});

test('Admin catalog reads all formats with the verified session, including inactive drafts', async () => {
    const state = session({ status: 'draft' });
    state.format.is_active = false;
    assert.equal((await loadAdminGameFormats(undefined, state.api))[0].id, 3);
    assert.match(state.calls[0].path, /deck_formats\?select=\*/);
    assert.ok(!/rules_status=|is_active=/.test(state.calls[0].path));
});
