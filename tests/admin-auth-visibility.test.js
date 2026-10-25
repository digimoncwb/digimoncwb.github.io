const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('admin visibility follows verified login and resets when the session is cleared', () => {
    const events = [];
    const sandbox = {
        window: { dispatchEvent: (event) => events.push(event) },
        document: { getElementById: () => null },
        sessionStorage: { removeItem() {} },
        CustomEvent: class {
            constructor(type, options) {
                this.type = type;
                this.detail = options.detail;
            }
        }
    };
    vm.runInNewContext(
        fs.readFileSync('admin/script.js', 'utf8') +
            `
        this.show = setAdminAuthView;
        this.clear = clearAdminSession;
        this.credentials = (session, profile) => { adminAuthSession = session; adminAuthProfile = profile; };`,
        sandbox
    );
    sandbox.show(true);
    assert.equal(sandbox.window.digistatsAdminAuthenticated, false);
    sandbox.credentials(
        { access_token: 'test', user: { id: 'admin' } },
        { user_id: 'another-user' }
    );
    sandbox.show(true);
    assert.equal(sandbox.window.digistatsAdminAuthenticated, false);
    sandbox.credentials({ access_token: 'test', user: { id: 'admin' } }, { user_id: 'admin' });
    sandbox.show(true);
    assert.equal(sandbox.window.digistatsAdminAuthenticated, true);
    assert.equal(events.at(-1).type, 'digistats:admin-auth-changed');
    sandbox.clear();
    assert.equal(sandbox.window.digistatsAdminAuthenticated, false);
    assert.equal(events.at(-1).detail.authenticated, false);
});

test('Admin sections show only their tools and preserve the full standalone administration', () => {
    const buttons = [
        'digilab',
        'stores',
        'gameformats',
        'formats',
        'portraits',
        'banlist',
        'datarepair'
    ].map((tab) => ({ dataset: { adminTab: tab }, hidden: false }));
    const sandbox = {
        window: { DIGISTATS_MICRO_FRONTENDS: true, location: { search: '?section=tournaments' } },
        document: { getElementById: () => ({ querySelectorAll: () => buttons }) },
        URLSearchParams
    };
    vm.runInNewContext(
        fs.readFileSync('admin/script.js', 'utf8') +
            ';this.select=applyAdminSection;this.active=()=>adminActiveTab;',
        sandbox
    );
    const visible = () =>
        buttons.filter((button) => !button.hidden).map((button) => button.dataset.adminTab);
    sandbox.select();
    assert.deepEqual(visible(), ['digilab', 'stores']);
    assert.equal(sandbox.active(), 'digilab');
    sandbox.window.location.search = '?section=catalog';
    sandbox.select();
    assert.deepEqual(visible(), ['gameformats', 'formats', 'portraits', 'banlist', 'datarepair']);
    assert.equal(sandbox.active(), 'gameformats');
    sandbox.window.location.search = '?section=accounts';
    sandbox.select();
    assert.deepEqual(visible(), []);
    sandbox.window.location.search = '?section=unknown';
    sandbox.select();
    assert.deepEqual(visible(), ['digilab', 'stores']);
    sandbox.window.location.search = '?section=toString';
    sandbox.select();
    assert.deepEqual(visible(), ['digilab', 'stores']);
    sandbox.window.DIGISTATS_MICRO_FRONTENDS = false;
    assert.equal(sandbox.select(), null);
});
