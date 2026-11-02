const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

test('round clock registers hooks during rendering only, formats time and alerts once at overtime', async () => {
    const { transformWithOxc } = await import('vite');
    const source = readFileSync('frontend/apps/workspace/CommunityTournaments.tsx', 'utf8');
    const clock = source.slice(
        source.indexOf('function RoundClock('),
        source.indexOf('function AddParticipant(')
    );
    const { code } = await transformWithOxc(clock, 'RoundClock.tsx');
    const start = Date.parse('2026-11-01T21:00:00Z');
    for (const [elapsed, expected, regularMinutes, overtimeMinutes] of [
        [0, '45:00', 45, 5],
        [45 * 60000 + 15000, '00:15', 45, 5],
        [50 * 60000, '05:00', 45, 5],
        [52 * 60000, '05:00', 45, 5],
        [30 * 60000 + 15000, '00:15', 30, 3],
        [33 * 60000, '03:00', 30, 3],
        [30 * 60000, '00:00', 30, 0]
    ]) {
        let now = start + elapsed;
        let rendering = false;
        let tick;
        let cleared = false;
        const effects = [],
            notifications = [],
            updates = [];
        const storage = new Map();
        class ClockDate extends Date {
            static now() {
                return now;
            }
        }
        const assertRendering = () =>
            assert.ok(rendering, 'React hooks must not run inside effects or callbacks');
        const RoundClock = vm.runInNewContext(code + '\nRoundClock', {
            require,
            Date: ClockDate,
            useState(initial) {
                assertRendering();
                return [
                    typeof initial === 'function' ? initial() : initial,
                    (next) => updates.push(next)
                ];
            },
            useRef(value) {
                assertRendering();
                return { current: value };
            },
            useEffect(effect) {
                assertRendering();
                effects.push(effect);
            },
            setInterval(callback) {
                tick = callback;
                return 1;
            },
            clearInterval() {
                cleared = true;
            },
            localStorage: {
                getItem: (key) => storage.get(key),
                setItem: (key, value) => storage.set(key, value)
            },
            window: { Notification: {}, location: { href: 'https://site.test/#tournament' } },
            Notification: { permission: 'granted' },
            navigator: {
                serviceWorker: {
                    getRegistration: async () => ({
                        showNotification: async (...args) => notifications.push(args)
                    })
                }
            }
        });
        rendering = true;
        const tree = RoundClock({
            eventId: 'event',
            eventName: 'CWB',
            roundId: 'round',
            roundNumber: 1,
            viewerId: 'viewer',
            endsAt: new Date(start + regularMinutes * 60000).toISOString(),
            overtimeAt: new Date(start + (regularMinutes + overtimeMinutes) * 60000).toISOString(),
            serverNow: new Date(now).toISOString(),
            receivedAt: now
        });
        rendering = false;
        const cleanups = effects.map((effect) => effect());
        const timer = tree.props.children[1];
        assert.equal(timer.props.children.map((span) => span.props.children).join(''), expected);
        assert.equal(
            Boolean(tree.props.children[0]),
            overtimeMinutes > 0 && elapsed >= regularMinutes * 60000
        );
        if (tree.props.children[0])
            assert.equal(
                tree.props.children[0].props.children,
                elapsed >= (regularMinutes + overtimeMinutes) * 60000
                    ? 'FIM DO OVERTIME'
                    : 'OVERTIME'
            );
        await new Promise(setImmediate);
        const shouldNotify = overtimeMinutes > 0 && elapsed >= regularMinutes * 60000;
        const expired = elapsed >= (regularMinutes + overtimeMinutes) * 60000;
        assert.equal(tree.props.className.includes('is-expired'), expired);
        assert.equal(notifications.length, shouldNotify ? 1 : 0);
        if (shouldNotify) {
            assert.equal(
                notifications[0][0],
                expired
                    ? 'fim do overtime, passem os resultados'
                    : `Inicio do overtime: ${overtimeMinutes} minutos ou 3 turnos`
            );
            assert.ok(notifications[0][1].tag.endsWith(expired ? ':overtime_end' : ':overtime'));
        }
        effects[effects.length - 1]();
        await new Promise(setImmediate);
        assert.equal(
            notifications.length,
            shouldNotify ? 1 : 0,
            'rerenders must not repeat the overtime alert'
        );
        now += 123000;
        tick();
        assert.equal(
            updates[updates.length - 1],
            now,
            'resuming uses absolute time rather than counting interval ticks'
        );
        cleanups.forEach((cleanup) => {
            if (typeof cleanup === 'function') cleanup();
        });
        assert.equal(cleared, true);
    }
});
