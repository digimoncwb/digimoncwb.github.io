const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync('admin/script.js', 'utf8');
const helper = source.slice(
    source.indexOf('function beginAdminFormSave('),
    source.indexOf('async function saveFormat(')
);

for (const [save, next, formId, statusId] of [
    ['saveFormat', 'clearOtherDefaults', 'adminFormatForm', 'adminFormatStatus'],
    ['saveBanEntry', 'removeBanEntry', 'adminBanForm', 'adminBanStatus'],
    ['saveStore', 'deleteStore', 'adminStoreForm', 'adminStoreStatus']
]) {
    test(`${save} blocks overlapping requests and allows retry after failure`, async () => {
        const button = { disabled: false, textContent: 'Save' };
        const attributes = new Map();
        const form = {
            dataset: {},
            getAttribute: (key) => attributes.get(key) ?? null,
            setAttribute: (key, value) => attributes.set(key, value),
            removeAttribute: (key) => attributes.delete(key),
            querySelectorAll: () => [button]
        };
        const status = { textContent: '' };
        const field = (id) => {
            if (id === formId) return form;
            if (id === statusId) return status;
            if (id.endsWith('Modal'))
                return { querySelector: (selector) => field(selector.slice(1)) };
            if (id.endsWith('Id') || id.endsWith('OriginalCode')) return { value: '' };
            if (['adminFormatDescription', 'adminFormatRulesText', 'adminFormatRulesUrl'].includes(id)) return { value: '' };
            return { value: 'Test', checked: false, files: [] };
        };
        let requests = 0;
        let rejectRequest;
        const context = vm.createContext({
            document: { getElementById: field },
            window: {
                APP_CONFIG: { SUPABASE_URL: 'https://example.test' },
                createSupabaseHeaders: () => ({})
            },
            adminBanNameMap: {},
            refreshAdminSessionIfNeeded: async () => {},
            createAuthenticatedAdminHeaders: () => ({}),
            closeFormatModal: () => {},
            closeBanModal: () => {},
            closeStoreModal: () => {},
            loadAdminFormats: async () => {},
            loadAdminBanList: async () => {},
            loadAdminStores: async () => {},
            fetch: () => {
                requests++;
                if (requests === 1)
                    return new Promise((_resolve, reject) => {
                        rejectRequest = reject;
                    });
                return Promise.resolve({ ok: true });
            }
        });
        const handler = source.slice(
            source.indexOf(`async function ${save}(`),
            source.indexOf(`async function ${next}(`)
        );
        vm.runInContext(helper + handler, context);
        const event = { preventDefault() {} };
        const first = context[save](event);
        await Promise.resolve();
        await context[save](event);
        assert.equal(requests, 1);
        assert.equal(button.disabled, true);
        assert.equal(attributes.get('aria-busy'), 'true');
        rejectRequest(new Error('Network failure'));
        await first;
        assert.match(status.textContent, /Network failure/);
        assert.equal(button.disabled, false);
        assert.equal(button.textContent, 'Save');
        assert.equal(attributes.has('aria-busy'), false);
        await context[save](event);
        assert.equal(requests, 2);
        assert.equal(form.dataset.saving, undefined);
    });
}

test('DigiLab history displays elapsed time and handles missing or inverted timestamps', () => {
    const context = vm.createContext({
        escapeAdminHtml: (value) => String(value),
        document: { getElementById: () => null }
    });
    vm.runInContext(
        source.slice(
            source.indexOf('function renderDigilabSyncHistory('),
            source.indexOf('async function loadDigilabInventory(')
        ),
        context
    );
    const host = {};
    context.renderDigilabSyncHistory(host, {
        runs: [
            {
                status: 'completed',
                started_at: '2026-10-04T12:00:00Z',
                finished_at: '2026-10-04T12:01:05Z'
            },
            { status: 'failed', started_at: 'invalid' },
            {
                status: 'completed',
                started_at: '2026-10-04T12:01:00Z',
                finished_at: '2026-10-04T12:00:00Z'
            }
        ]
    });
    assert.match(host.innerHTML, /1min 5s/);
    assert.ok(!host.innerHTML.includes('NaNs'));
    assert.ok(!host.innerHTML.includes('-60s'));
    context.renderDigilabSyncHistory(host, {});
    assert.match(host.innerHTML, /colspan="7"/);
});
