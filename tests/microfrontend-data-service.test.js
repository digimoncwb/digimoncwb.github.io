const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

test('bootstrap starts independent scripts together and script URLs remain stable', async () => {
    const elements = [],
        listeners = [];
    const sandbox = {
        createSiteAuth: () => ({ initialize: async () => {} }),
        __CWB_ASSET_VERSION__: 'release-one',
        URL,
        URLSearchParams,
        navigate() {},
        location: { href: 'https://example.test/', pathname: '/', search: '' },
        document: {
            querySelector: () => ({ content: './' }),
            createElement: () => ({}),
            head: {
                prepend() {},
                append(element) {
                    elements.push(element);
                }
            }
        },
        window: { addEventListener: (...args) => listeners.push(args) }
    };
    const source = stripTypeScriptTypes(fs.readFileSync('frontend/shell/services.ts', 'utf8'))
        .replace(/^import .*from.*;$/gm, '')
        .replace(/export /g, '');
    vm.runInNewContext(
        source + '\nthis.start=bootstrap;this.load=loadScript;dataService.refresh=()=>{};',
        sandbox
    );
    const startup = sandbox.start();
    assert.equal(elements.length, 6, 'all bootstrap scripts start before any completes');
    assert.ok(
        elements.every((element) => new URL(element.src).searchParams.get('v') === 'release-one')
    );
    elements.forEach((element) => element.onload());
    await startup;
    await sandbox.load('config/supabase.js');
    assert.equal(elements.length, 6, 'a script is only inserted once');
    assert.equal(listeners.length, 1);
});

test('micro-frontends share one concurrent refresh and retain the last valid data when the API fails', async () => {
    let calls = 0,
        complete,
        fail;
    const sandbox = {
        __CWB_ASSET_VERSION__: 'test-release',
        URL,
        AbortController,
        setTimeout,
        clearTimeout,
        fetch() {},
        location: { href: 'https://example.test/site/demo-v2/' },
        document: {
            querySelector() {
                return { content: '../' };
            }
        },
        window: {
            APP_CONFIG: { SUPABASE_URL: 'https://api.test' },
            createSupabaseHeaders: () => ({}),
            liveData: {
                load() {
                    calls++;
                    return new Promise((resolve, reject) => {
                        complete = resolve;
                        fail = reject;
                    });
                }
            }
        }
    };
    const source = stripTypeScriptTypes(fs.readFileSync('frontend/shell/services.ts', 'utf8'))
        .replace(/^import .*from.*;$/gm, '')
        .replace(/export /g, '');
    vm.runInNewContext(source + '\nthis.service=dataService;', sandbox);
    const service = sandbox.service;
    let notifications = 0;
    const dispose = service.subscribe(() => notifications++);
    const first = service.refresh();
    assert.equal(first, service.refresh());
    assert.equal(calls, 1);
    assert.equal(service.getSnapshot().loading, true);
    const data = { events: [{ id: '42', format: 'EX12' }], formats: [], stores: [], schedule: [] };
    complete(data);
    await first;
    assert.equal(service.getSnapshot().data, data);
    assert.equal(service.getSnapshot().loading, false);
    const second = service.refresh();
    fail(new Error('API indisponível'));
    await second;
    assert.equal(calls, 2);
    assert.equal(service.getSnapshot().data, data);
    assert.equal(service.getSnapshot().error, 'API indisponível');
    assert.equal(notifications, 4);
    dispose();
});
