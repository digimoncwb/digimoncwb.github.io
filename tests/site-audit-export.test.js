const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
function load() {
    const source = fs
        .readFileSync('frontend/shell/audit-export.ts', 'utf8')
        .replace(/^import .*;\r?\n/gm, '');
    const context = { TextEncoder, Error, Date, JSON };
    vm.createContext(context);
    vm.runInContext(
        stripTypeScriptTypes(source, { mode: 'transform' }).replace(/export /g, '') +
            ';globalThis.prepare=prepareAuditExport;',
        context
    );
    return context.prepare;
}
test('Audit export collects every page and validates total before returning the artifact', async () => {
    const prepare = load(),
        calls = [],
        cursors = [];
    let page = 0;
    const auth = {
        rpc: async (name, params) => {
            calls.push({ name, params });
            return name === 'admin_begin_audit_export'
                ? { id: 'export-id', total: 3, until: '2026-10-25T12:00:00Z' }
                : null;
        },
        request: async (path, options) => {
            cursors.push(JSON.parse(options.body).p_cursor);
            page++;
            return Response.json(
                page === 1
                    ? { events: [{ event_id: 3 }, { event_id: 2 }], next_cursor: 2, done: false }
                    : { events: [{ event_id: 1 }], next_cursor: 1, done: true }
            );
        }
    };
    const result = await prepare(
        auth,
        { p_entity: 'decklists' },
        new AbortController().signal,
        () => {}
    );
    assert.equal(result.total, 3);
    assert.equal(result.events.length, 3);
    assert.deepEqual(cursors, [null, 2]);
    assert.equal(calls.at(-1).params.p_aborted, false);
    assert.equal(calls.at(-1).params.p_rows, 3);
});
test('Audit export records abort and never returns an incomplete file on count mismatch or cancellation', async () => {
    for (const cancel of [false, true]) {
        const calls = [],
            controller = new AbortController();
        const auth = {
            rpc: async (name, params) => {
                calls.push({ name, params });
                return name === 'admin_begin_audit_export' ? { id: 'export-id', total: 2 } : null;
            },
            request: async () => Response.json({ events: [{ event_id: 1 }], done: true })
        };
        if (cancel) controller.abort();
        await assert.rejects(load()(auth, {}, controller.signal, () => {}));
        assert.equal(calls.at(-1).params.p_aborted, true);
    }
});
