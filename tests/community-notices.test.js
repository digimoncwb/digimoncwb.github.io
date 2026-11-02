const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

async function component(file, name, globals) {
    const { transformWithOxc } = await import('vite');
    const source = readFileSync(file, 'utf8');
    const { code } = await transformWithOxc(
        source
            .slice(source.indexOf(`export function ${name}`))
            .replace('export function', 'function'),
        `${name}.tsx`
    );
    return vm.runInNewContext(code + `\n${name}`, { require, ...globals });
}

test('overview registration cards disappear once the tournament starts', async () => {
    let events = [];
    const Notice = await component('frontend/shared/CommunityNotices.tsx', 'CommunityNotices', {
        useSiteAuth: () => ({}),
        useCommunityList: () => ({ events }),
        useState: (initial) => [initial, () => {}],
        useEffect: () => {},
        communityEventDate: () => ''
    });
    const event = {
        id: 'event',
        name: 'Event',
        registered: 2,
        capacity: 32,
        registration_open: true,
        enrolled: true,
        active_participant: true
    };
    for (const status of ['running', 'finished', 'cancelled']) {
        events = [{ ...event, status }];
        assert.equal(Notice({ context: { active: true } }), null);
    }
    events = [{ ...event, status: 'published' }];
    assert.equal(Notice({ context: { active: true } }).type, 'section');
});

test('a previously delivered round alert remains visible after reload without another OS notification', async () => {
    const effects = [],
        updates = [],
        notifications = [];
    let index = 0;
    const Alert = await component('frontend/shared/CommunityAlerts.tsx', 'CommunityAlerts', {
        useSiteAuth: () => ({ user: { id: 'user' }, profile: { player_id: 'player' } }),
        useCommunityList: () => ({
            events: [
                {
                    id: 'event',
                    name: 'Event',
                    status: 'running',
                    enrolled: true,
                    active_participant: true
                }
            ]
        }),
        useState: (initial) => {
            const slot = index++;
            return [
                typeof initial === 'function' ? initial() : initial,
                (value) => updates.push([slot, value])
            ];
        },
        useEffect: (effect) => effects.push(effect),
        localStorage: {
            getItem: (key) => (key === 'community-alert:user:round:start' ? '1' : null),
            setItem: () => {}
        },
        window: {
            Notification: {},
            setInterval: () => 1,
            addEventListener: () => {},
            removeEventListener: () => {}
        },
        document: { hidden: false, addEventListener: () => {}, removeEventListener: () => {} },
        Notification: { permission: 'granted' },
        AbortController,
        clearInterval: () => {},
        navigator: {
            serviceWorker: {
                getRegistration: async () => ({
                    showNotification: async (...args) => notifications.push(args)
                })
            }
        },
        communityRpc: async () => ({
            event: { status: 'running' },
            entries: [
                { id: 'mine', player_id: 'player', name: 'Me' },
                { id: 'opponent', name: 'Other' }
            ],
            rounds: [
                { id: 'round', number: 2, status: 'running', started_at: new Date().toISOString() }
            ],
            matches: [
                {
                    id: 'match',
                    round_id: 'round',
                    p1: 'mine',
                    p2: 'opponent',
                    table_number: 1,
                    status: 'pending'
                }
            ]
        })
    });
    Alert({ active: true, onOpen: () => {}, eventHref: () => '#' });
    const cleanup = effects.map((effect) => effect());
    await new Promise(setImmediate);
    assert.ok(updates.some(([slot, value]) => slot === 0 && value.includes('R2: vs Other')));
    assert.ok(updates.some(([slot, value]) => slot === 1 && value === 'event'));
    assert.equal(notifications.length, 0);
    cleanup.forEach((fn) => typeof fn === 'function' && fn());
});

async function finishedAlert(minutesAgo, delivered = false) {
    let now = Date.parse('2026-11-02T15:00:00Z');
    const event = {
        id: 'event',
        name: 'Event',
        status: 'finished',
        enrolled: true,
        finished_at: new Date(now - minutesAgo * 60000).toISOString(),
        final_order: ['mine']
    };
    const events = [event],
        states = [],
        effects = [],
        pending = [],
        timers = new Map();
    const storage = new Map(delivered ? [['community-alert:user:event:finish', '1']] : []);
    const notifications = [];
    let stateIndex = 0,
        effectIndex = 0,
        timerId = 0,
        requests = 0;
    class Clock extends Date {
        static now() {
            return now;
        }
    }
    const Alert = await component('frontend/shared/CommunityAlerts.tsx', 'CommunityAlerts', {
        Date: Clock,
        useSiteAuth: () => ({ user: { id: 'user' }, profile: { player_id: 'player' } }),
        useCommunityList: () => ({ events }),
        useState: (initial) => {
            const slot = stateIndex++;
            if (!(slot in states))
                states[slot] = typeof initial === 'function' ? initial() : initial;
            return [
                states[slot],
                (value) => {
                    states[slot] = value;
                }
            ];
        },
        useEffect: (effect, deps) => {
            const slot = effectIndex++,
                previous = effects[slot];
            if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
                pending.push(() => {
                    previous?.cleanup?.();
                    effects[slot] = { deps, cleanup: effect() };
                });
            }
        },
        localStorage: {
            getItem: (key) => storage.get(key),
            setItem: (key, value) => storage.set(key, value)
        },
        window: {
            Notification: {},
            setInterval: () => 1,
            setTimeout: (callback, delay) => {
                const id = ++timerId;
                timers.set(id, { callback, at: now + delay });
                return id;
            },
            clearTimeout: (id) => timers.delete(id)
        },
        document: { hidden: false, addEventListener: () => {}, removeEventListener: () => {} },
        Notification: { permission: 'granted' },
        AbortController,
        clearInterval: () => {},
        navigator: {
            serviceWorker: {
                getRegistration: async () => ({
                    showNotification: async (...args) => notifications.push(args)
                })
            }
        },
        communityRpc: async () => {
            requests++;
            return {
                event,
                entries: [{ id: 'mine', player_id: 'player' }],
                rounds: [],
                matches: []
            };
        }
    });
    const props = { active: true, onOpen: () => {}, eventHref: () => '#' };
    const render = async () => {
        stateIndex = 0;
        effectIndex = 0;
        Alert(props);
        pending.splice(0).forEach((run) => run());
        await new Promise(setImmediate);
    };
    await render();
    await render();
    return {
        states,
        notifications,
        requests,
        advance: async (ms) => {
            now += ms;
            for (const [id, timer] of timers)
                if (timer.at <= now) {
                    timers.delete(id);
                    timer.callback();
                }
            await render();
        },
        cleanup: () => effects.forEach((effect) => effect?.cleanup?.())
    };
}

test('finish notice survives reload and expires ten minutes after completion, even offline', async () => {
    const alert = await finishedAlert(5, true);
    try {
        assert.match(alert.states[0], /Fim do torneio: 1º lugar/);
        assert.equal(alert.notifications.length, 0, 'previous OS delivery stays deduplicated');
        await alert.advance(5 * 60000 - 1);
        assert.match(alert.states[0], /Fim do torneio/);
        await alert.advance(1);
        assert.equal(alert.states[0], '');
        assert.equal(alert.states[1], '');
        assert.equal(alert.requests, 1, 'expiration does not require another server response');
    } finally {
        alert.cleanup();
    }
});

test('finished events at or past ten minutes never reappear or send a late OS notification', async () => {
    for (const minutes of [10, 60]) {
        const alert = await finishedAlert(minutes);
        try {
            assert.equal(alert.states[0], '');
            assert.equal(alert.notifications.length, 0);
            assert.equal(alert.requests, 0);
        } finally {
            alert.cleanup();
        }
    }
});
