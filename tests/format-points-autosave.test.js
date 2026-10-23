/* global Response, structuredClone */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
function setup(initial, patchResponse) {
    const { savePointAdditions, savePointChanges } = vm.runInNewContext(
        stripTypeScriptTypes(
            readFileSync('frontend/apps/workspace/format-points-service.ts', 'utf8')
        ).replace(/export /g, '') + '\n({savePointAdditions,savePointChanges})'
    );
    let current = structuredClone(initial);
    const requests = [];
    const session = {
        restore: async () => true,
        refresh: async () => {},
        verify: async () => {},
        request: async (path, options) => {
            requests.push({ path, options });
            if (options.method === 'GET') return new Response(JSON.stringify([current]));
            if (patchResponse) return patchResponse(path, options);
            const payload = JSON.parse(options.body);
            current = { ...current, ...payload, rules_revision: current.rules_revision + 1 };
            return new Response(JSON.stringify([current]));
        }
    };
    return {
        savePointAdditions,
        savePointChanges,
        session,
        requests,
        getCurrent: () => current,
        setCurrent: (value) => {
            current = value;
        }
    };
}
const initial = {
    rules_revision: 8,
    validation_rules: {
        main_count: 50,
        egg_max: 5,
        security_count: 5,
        copies: 4,
        use_official_banlist: false,
        points_limit: 100,
        allowed_rarities: ['C', 'U'],
        card_points: { 'BT1-001': { name: 'Existing', points: 5 } },
        points_pending: [
            { code: 'BT2-001', name: 'Pending', points: 2 },
            { code: 'EX6', name: 'Unresolved', points: 2 }
        ]
    }
};
test('Point additions save immediately, merging latest points and preserving all other format rules', async () => {
    const api = setup(initial);
    await api.savePointAdditions(
        12,
        [
            { code: 'BT2-001', name: 'Added', points: 30 },
            { code: 'BT1-001', name: 'Updated', points: 10 }
        ],
        api.session
    );
    assert.equal(api.requests.length, 2);
    assert.match(api.requests[1].path, /rules_revision=eq.8/);
    const expected = structuredClone(initial.validation_rules);
    expected.card_points['BT1-001'] = { name: 'Updated', points: 10 };
    expected.card_points['BT2-001'] = { name: 'Added', points: 30 };
    expected.points_pending = expected.points_pending.filter((row) => row.code === 'EX6');
    assert.deepEqual(api.getCurrent().validation_rules, expected);
    assert.deepEqual(Object.keys(JSON.parse(api.requests[1].options.body)).sort(), [
        'change_note',
        'validation_rules'
    ]);
});
test('Autosave reports permission and write failures and detects concurrent revisions', async () => {
    for (const [status, body, message] of [
        [403, { message: 'Forbidden' }, /administradores/],
        [500, { message: 'Database unavailable' }, /Database unavailable/],
        [200, [], /alterado durante/]
    ]) {
        const api = setup(initial, () => new Response(JSON.stringify(body), { status }));
        await assert.rejects(
            api.savePointAdditions(
                12,
                [{ code: 'BT2-001', name: 'Added', points: 0 }],
                api.session
            ),
            message
        );
        assert.equal(api.getCurrent().rules_revision, 8);
    }
});
test('Retry reads the latest registry instead of replacing concurrent point additions', async () => {
    let attempts = 0;
    const api = setup(initial, (_path, options) => {
        if (!attempts++) {
            api.setCurrent({
                rules_revision: 9,
                validation_rules: {
                    ...initial.validation_rules,
                    card_points: {
                        ...initial.validation_rules.card_points,
                        'BT3-001': { name: 'Other admin', points: 8 }
                    }
                }
            });
            return new Response('[]');
        }
        return new Response(JSON.stringify([{ ...api.getCurrent(), ...JSON.parse(options.body) }]));
    });
    const addition = [{ code: 'BT2-001', name: 'Added', points: 30 }];
    await assert.rejects(api.savePointAdditions(12, addition, api.session), /alterado durante/);
    await api.savePointAdditions(12, addition, api.session);
    const last = api.requests.at(-1);
    assert.match(last.path, /rules_revision=eq.9/);
    assert.equal(JSON.parse(last.options.body).validation_rules.card_points['BT3-001'].points, 8);
});
test('Invalid scores and formats without an active points budget do not write', async () => {
    const api = setup(initial);
    await assert.rejects(
        api.savePointAdditions(12, [{ code: 'BT2-001', name: 'Added', points: -1 }], api.session),
        /Confira/
    );
    assert.equal(api.requests.length, 0);
    api.setCurrent({ rules_revision: 8, validation_rules: { points_limit: null } });
    await assert.rejects(
        api.savePointAdditions(12, [{ code: 'BT2-001', name: 'Added', points: 30 }], api.session),
        /Ative e salve/
    );
    assert.equal(api.requests.length, 1);
});

test('Removing registry entries preserves unrelated scores, pending entries and construction rules', async () => {
    const api = setup(initial);
    await api.savePointChanges(12, [], ['BT1-001', 'EX6'], api.session);
    const expected = structuredClone(initial.validation_rules);
    delete expected.card_points['BT1-001'];
    expected.points_pending = expected.points_pending.filter((row) => row.code !== 'EX6');
    assert.deepEqual(api.getCurrent().validation_rules, expected);
    assert.match(api.requests[1].path, /rules_revision=eq.8/);
    assert.match(JSON.parse(api.requests[1].options.body).change_note, /removida/);
});

test('Failed removal retains the registry and concurrent changes are checked before retry', async () => {
    const api = setup(initial, () => new Response('[]'));
    await assert.rejects(
        api.savePointChanges(12, [], ['BT1-001'], api.session),
        /alterado durante/
    );
    assert.equal(api.getCurrent().validation_rules.card_points['BT1-001'].points, 5);
});
