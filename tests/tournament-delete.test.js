const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync('torneios/edit-tournament/modal.js', 'utf8');
const deletion = source.slice(
    source.indexOf('async function deleteEditingTournament()'),
    source.indexOf('async function editTournamentFormSubmit(')
);
function setup({ confirm = true, typed = 'excluir', failure = false, wait } = {}) {
    const events = [],
        buttons = Array.from({ length: 5 }, () => ({ disabled: false }));
    const label = { textContent: 'Excluir torneio' };
    buttons[0].querySelector = () => label;
    const attributes = new Map();
    const form = {
        setAttribute: (name, value) => attributes.set(name, value),
        removeAttribute: (name) => attributes.delete(name),
        querySelector: () => buttons[1]
    };
    const context = vm.createContext({
        editingTournamentId: 42,
        editOcrImportInProgress: false,
        editTournamentSaveInProgress: false,
        modalSupabaseUrl: 'https://example.test',
        modalHeaders: {},
        document: {
            getElementById(id) {
                return {
                    editTournamentName: { value: 'Evo Cup' },
                    editTournamentDate: { value: '2026-10-19' },
                    editTournamentForm: form,
                    btnDeleteTournament: buttons[0],
                    btnEditCancel: buttons[2],
                    btnEditModalCloseX: buttons[3],
                    btnSelectEditOcrPrints: buttons[4]
                }[id];
            }
        },
        window: {
            confirm: () => {
                events.push(['confirm']);
                return confirm;
            },
            prompt: () => {
                events.push(['prompt']);
                return typed;
            },
            tournamentOcrFiles: {
                deleteStoragePaths: async (options) => {
                    events.push(['storage', options.storagePaths]);
                    return [];
                }
            },
            showFriendlyErrorModal: (title, message) => events.push(['error', title, message])
        },
        alert: (message) => events.push(['alert', message]),
        console: { error() {} },
        closeEditModal: () => events.push(['close']),
        reloadTournamentsAfterDelete: async (id) => events.push(['reload', id]),
        fetch: async (url, options) => {
            events.push(['request', url, JSON.parse(options.body)]);
            assert.ok(buttons.every((button) => button.disabled));
            if (wait) await wait;
            return {
                ok: !failure,
                status: failure ? 503 : 200,
                text: async () => 'Temporary failure',
                json: async () => ({ storage_paths: ['42/ocr.jpg'] })
            };
        }
    });
    vm.runInContext(deletion + '\nthis.remove = deleteEditingTournament;', context);
    return { context, events, buttons, attributes, label };
}
test('Tournament deletion requires both confirmations and never sends a request on cancellation', async () => {
    for (const options of [{ confirm: false }, { typed: null }, { typed: 'wrong' }]) {
        const api = setup(options);
        await api.context.remove();
        assert.equal(api.events.filter((event) => event[0] === 'request').length, 0);
        assert.ok(api.buttons.every((button) => !button.disabled));
    }
});
test('Confirmed tournament deletion uses the transactional RPC, then cleans storage and refreshes the list', async () => {
    const api = setup();
    await api.context.remove();
    const request = api.events.find((event) => event[0] === 'request');
    assert.match(request[1], /rpc\/delete_tournament_transaction$/);
    assert.deepEqual(request[2], { p_tournament_id: 42 });
    assert.deepEqual(
        api.events.map((event) => event[0]),
        ['confirm', 'prompt', 'request', 'storage', 'close', 'reload']
    );
    assert.equal(api.events.at(-1)[1], 42);
    assert.ok(api.buttons.every((button) => !button.disabled));
    assert.equal(api.context.editTournamentSaveInProgress, false);
    assert.equal(api.attributes.has('aria-busy'), false);
    assert.equal(api.label.textContent, 'Excluir torneio');
});
test('Failed deletion retains the open tournament and restores controls for retry', async () => {
    const api = setup({ failure: true });
    await api.context.remove();
    assert.equal(
        api.events.some((event) => ['close', 'storage', 'reload'].includes(event[0])),
        false
    );
    assert.equal(api.events.find((event) => event[0] === 'error')[1], 'Falha ao excluir torneio');
    assert.ok(api.buttons.every((button) => !button.disabled));
    assert.equal(api.context.editTournamentSaveInProgress, false);
});
test('A second deletion request is blocked while the first transaction is pending', async () => {
    let release;
    const api = setup({
        wait: new Promise((resolve) => {
            release = resolve;
        })
    });
    const first = api.context.remove();
    await api.context.remove();
    assert.equal(api.events.filter((event) => event[0] === 'request').length, 1);
    release();
    await first;
});
