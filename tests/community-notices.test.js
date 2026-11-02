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
