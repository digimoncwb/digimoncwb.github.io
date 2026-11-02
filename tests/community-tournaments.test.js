const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { Buffer } = require('node:buffer');
const uid = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const pid = (n) => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('an admin playing as Player 2 refutes with their own score and confirms immediately', async () => {
    const { db, rpc, create, login } = await setup(true);
    try {
        const id = await create();
        let state = await rpc('community_snapshot', [id]);
        state = await rpc('community_add_players', [
            id,
            JSON.stringify([pid(1), pid(2), pid(3), pid(4)]),
            state.event.revision
        ]);
        const admin = state.entries.find((entry) => entry.player_id === pid(1));
        const player = state.entries.find((entry) => entry.player_id === pid(2));
        const command = async (action, data = {}) => {
            if (data.match_id)
                data.match_revision = state.matches.find(
                    (match) => match.id === data.match_id
                ).revision;
            state = await rpc('community_command', [
                id,
                action,
                JSON.stringify(data),
                state.event.revision
            ]);
        };
        await command('start');
        await command('pair', {
            seed: 'perspective',
            pairs: [
                { p1: player.id, p2: admin.id },
                {
                    p1: state.entries.find((entry) => entry.player_id === pid(3)).id,
                    p2: state.entries.find((entry) => entry.player_id === pid(4)).id
                }
            ]
        });
        await command('start_round');
        const match_id = state.matches[0].id;
        await login(2);
        await command('propose', { match_id, wins: 2, losses: 0, draws: 0 });
        await login(1);
        await command('contest', { match_id, wins: 2, losses: 1, draws: 0 });
        assert.equal(state.matches[0].wins, 1);
        assert.equal(state.matches[0].losses, 2);
        assert.equal(state.matches[0].proposed_by, admin.id);
        assert.equal(state.matches[0].status, 'confirmed');
        assert.equal(state.standings[0].id, admin.id);
    } finally {
        await db.close();
    }
});

test('admin scores confirm immediately in either seat, against players or admins, and close the round', async () => {
    const { db, rpc, create, login } = await setup(true);
    try {
        for (const opponentAdmin of [false, true]) {
            if (opponentAdmin)
                await db.exec(
                    `reset role; insert into public.admin_users values('${uid(2)}'); set role authenticated;`
                );
            for (const adminSecond of [false, true]) {
                for (const action of ['propose', 'resolve']) {
                    await login(1);
                    const id = await create();
                    let state = await rpc('community_snapshot', [id]);
                    state = await rpc('community_add_players', [
                        id,
                        JSON.stringify([pid(1), pid(2), pid(3), pid(4)]),
                        state.event.revision
                    ]);
                    const entry = (n) => state.entries.find((e) => e.player_id === pid(n)).id;
                    const command = async (action, data = {}) => {
                        if (data.match_id)
                            data.match_revision = state.matches.find(
                                (m) => m.id === data.match_id
                            ).revision;
                        state = await rpc('community_command', [
                            id,
                            action,
                            JSON.stringify(data),
                            state.event.revision
                        ]);
                    };
                    await command('start');
                    await command('pair', {
                        seed: 'admin-result',
                        pairs: [
                            { p1: entry(adminSecond ? 2 : 1), p2: entry(adminSecond ? 1 : 2) },
                            { p1: entry(3), p2: entry(4) }
                        ]
                    });
                    await command('start_round');
                    const match = state.matches.find((m) => m.p1 === entry(adminSecond ? 2 : 1));
                    const other = state.matches.find((m) => m.id !== match.id);
                    await login(3);
                    await command('propose', { match_id: other.id, wins: 2, losses: 0, draws: 0 });
                    assert.equal(state.matches.find((m) => m.id === other.id).status, 'proposed');
                    await login(4);
                    await command('confirm', { match_id: other.id });
                    assert.equal(state.rounds[0].status, 'running');
                    await login(1);
                    // Older clients propose relative to the submitter; resolve uses table order.
                    await command(action, { match_id: match.id, wins: 2, losses: 0, draws: 0 });
                    const result = state.matches.find((m) => m.id === match.id);
                    assert.equal(result.status, 'confirmed');
                    assert.equal(result.wins, action === 'propose' && adminSecond ? 0 : 2);
                    assert.equal(result.losses, action === 'propose' && adminSecond ? 2 : 0);
                    assert.ok(state.audit.some((a) => a.action === 'match_before_resolution'));
                    assert.equal(state.rounds[0].status, 'closed');
                }
            }
        }
    } finally {
        await db.close();
    }
});

test('an admin playing in the event can generate the next round through the authenticated pairing command', async () => {
    const { db, rpc, create, login } = await setup(true);
    const { buildPairings } = await import('../supabase/functions/_shared/community-engine.mjs');
    try {
        const id = await create();
        let state = await rpc('community_snapshot', [id]);
        state = await rpc('community_add_players', [
            id,
            JSON.stringify([pid(1), pid(2), pid(3), pid(4), pid(5), pid(6)]),
            state.event.revision
        ]);
        state = await rpc('community_start_event', [id, state.event.revision]);
        assert.ok(
            state.matches.some((match) =>
                [match.p1, match.p2].includes(
                    state.entries.find((entry) => entry.player_id === pid(1)).id
                )
            )
        );
        for (const match of state.matches)
            state = await rpc('community_command', [
                id,
                'resolve',
                JSON.stringify({
                    match_id: match.id,
                    match_revision: match.revision,
                    wins: 2,
                    losses: 1,
                    draws: 0
                }),
                state.event.revision
            ]);
        assert.equal(state.rounds[0].status, 'closed');
        const pairs = buildPairings(state.standings, state.matches, 'admin-playing');
        await login(2);
        await assert.rejects(
            () =>
                rpc('community_command', [
                    id,
                    'pair',
                    JSON.stringify({ pairs, seed: 'admin-playing' }),
                    state.event.revision
                ]),
            /administrativo/
        );
        await login(1);
        await assert.rejects(
            () =>
                rpc('community_start_next_round', [
                    id,
                    JSON.stringify({ pairs: [], seed: 'invalid' }),
                    state.event.revision
                ]),
            /mesas/
        );
        assert.equal((await rpc('community_snapshot', [id])).rounds.length, 1);
        state = await rpc('community_start_next_round', [
            id,
            JSON.stringify({ pairs, seed: 'admin-playing' }),
            state.event.revision
        ]);
        assert.equal(state.rounds[1].number, 2);
        assert.equal(
            state.matches.filter((match) => match.round_id === state.rounds[1].id).length,
            3
        );
        assert.equal(state.rounds[1].status, 'running');
        assert.equal(
            Date.parse(state.rounds[1].ends_at) - Date.parse(state.rounds[1].started_at),
            45 * 60000
        );
        await assert.rejects(
            () => rpc('community_delete_event', [id, state.event.revision, 'CWB Teste']),
            /deletar/
        );
        await assert.rejects(
            () => rpc('community_delete_event', [id, state.event.revision, '']),
            /deletar/
        );
        await login(2);
        await assert.rejects(
            () => rpc('community_delete_event', [id, state.event.revision, 'deletar']),
            /administrativo/
        );
        await login(1);
        assert.equal(
            await rpc('community_delete_event', [id, state.event.revision, 'deletar']),
            id
        );
    } finally {
        await db.close();
    }
});

test('resume restores the same tables, confirmed scores and proposals, freezing normal and overtime clocks during pauses', async () => {
    const { db, rpc, create, login } = await setup(true);
    try {
        const id = await create();
        let state = await rpc('community_snapshot', [id]);
        state = await rpc('community_add_players', [
            id,
            JSON.stringify([pid(1), pid(2), pid(3), pid(4)]),
            state.event.revision
        ]);
        state = await rpc('community_start_event', [id, state.event.revision]);
        const first = state.matches[0];
        state = await rpc('community_command', [
            id,
            'resolve',
            JSON.stringify({
                match_id: first.id,
                match_revision: first.revision,
                wins: 2,
                losses: 1,
                draws: 0
            }),
            state.event.revision
        ]);
        const proposed = state.matches[1];
        // Pairings are randomized; an admin submission would confirm immediately.
        const proposer = state.entries.find(
            (entry) => [proposed.p1, proposed.p2].includes(entry.id) && entry.player_id !== pid(1)
        );
        await login(Number(proposer.player_id.slice(-12)));
        state = await rpc('community_command', [
            id,
            'propose',
            JSON.stringify({
                match_id: proposed.id,
                match_revision: proposed.revision,
                wins: 2,
                losses: 0,
                draws: 0
            }),
            state.event.revision
        ]);
        assert.equal(state.matches.find((match) => match.id === proposed.id).status, 'proposed');
        assert.equal(state.rounds[0].status, 'running');
        await login(1);
        for (const overtime of [false, true]) {
            if (overtime) {
                await db.exec(
                    `reset role; update public.community_rounds set started_at=now()-interval '47 minutes', ends_at=now()-interval '2 minutes', overtime_ends_at=now()+interval '3 minutes' where event_id='${id}'; set role authenticated;`
                );
                state = await rpc('community_snapshot', [id]);
            }
            const before = state.rounds[0];
            const scores = state.matches;
            state = await rpc('community_pause_round', [id, state.event.revision]);
            assert.equal(state.matches.length, 0);
            await login(2);
            await assert.rejects(
                () => rpc('community_resume_round', [id, state.event.revision]),
                /administrativo/
            );
            await login(1);
            await assert.rejects(
                () => rpc('community_resume_round', [id, state.event.revision - 1]),
                /torneio mudou/
            );
            // Simulate a two-minute suspension without waiting for real time.
            await db.exec(
                `reset role; update public.community_audit set created_at=created_at-interval '2 minutes' where id=(select max(id) from public.community_audit where event_id='${id}' and action='paused_round_snapshot'); set role authenticated;`
            );
            state = await rpc('community_resume_round', [id, state.event.revision]);
            assert.equal(state.rounds[0].id, before.id);
            assert.equal(state.rounds[0].status, 'running');
            const shift = Date.parse(state.rounds[0].ends_at) - Date.parse(before.ends_at);
            assert.ok(shift >= 120000 && shift < 125000);
            assert.equal(
                Date.parse(state.rounds[0].overtime_ends_at) - Date.parse(before.overtime_ends_at),
                shift
            );
            assert.deepEqual(
                state.matches.map((m) => ({ ...m, revision: 0 })),
                scores.map((m) => ({ ...m, revision: 0 }))
            );
            for (const match of state.matches)
                assert.equal(match.revision, scores.find((m) => m.id === match.id).revision + 1);
            assert.equal(state.audit[0].action, 'resume_round');
            await assert.rejects(
                () => rpc('community_resume_round', [id, state.event.revision]),
                /pausada/
            );
        }
        state = await rpc('community_pause_round', [id, state.event.revision]);
        state = await rpc('community_command', [
            id,
            'drop',
            JSON.stringify({ entry_id: proposed.p1 }),
            state.event.revision
        ]);
        await assert.rejects(
            () => rpc('community_resume_round', [id, state.event.revision]),
            /DROP/
        );
        state = await rpc('community_snapshot', [id]);
        assert.equal(state.rounds[0].status, 'paused');
        assert.equal(state.matches.length, 0);
    } finally {
        await db.close();
    }
});

test('configured round durations preserve live deadlines and apply when restarting, including no overtime', async () => {
    const { db, rpc, create, login } = await setup(true);
    try {
        const id = await create();
        let state = await rpc('community_snapshot', [id]);
        assert.equal(state.event.round_minutes, 45);
        assert.equal(state.event.overtime_minutes, 5);
        state = await rpc('community_add_players', [
            id,
            JSON.stringify([pid(1), pid(2), pid(3), pid(4)]),
            state.event.revision
        ]);
        state = await rpc('community_start_event', [id, state.event.revision]);
        const before = state.rounds[0];
        assert.equal(Date.parse(before.ends_at) - Date.parse(before.started_at), 45 * 60000);
        assert.equal(Date.parse(before.overtime_ends_at) - Date.parse(before.ends_at), 5 * 60000);
        const config = { ...state.event, round_minutes: 20, overtime_minutes: 0 };
        await login(2);
        await assert.rejects(
            () =>
                rpc('community_configure_event', [
                    id,
                    JSON.stringify(config),
                    state.event.revision
                ]),
            /administrativo/
        );
        await login(1);
        await assert.rejects(
            () =>
                rpc('community_configure_event', [
                    id,
                    JSON.stringify({ ...config, overtime_minutes: -1 }),
                    state.event.revision
                ]),
            /tempos/
        );
        state = await rpc('community_configure_event', [
            id,
            JSON.stringify(config),
            state.event.revision
        ]);
        assert.equal(state.event.round_minutes, 20);
        assert.equal(state.event.overtime_minutes, 0);
        assert.deepEqual(state.rounds[0], before);
        const pairs = state.matches.map(({ p1, p2 }) => ({ p1, p2 }));
        state = await rpc('community_pause_round', [id, state.event.revision]);
        state = await rpc('community_restart_round', [
            id,
            JSON.stringify({ pairs, seed: 'durations' }),
            state.event.revision
        ]);
        assert.equal(
            Date.parse(state.rounds[0].ends_at) - Date.parse(state.rounds[0].started_at),
            20 * 60000
        );
        assert.equal(state.rounds[0].overtime_ends_at, state.rounds[0].ends_at);
        const custom = await rpc('community_create', [
            JSON.stringify({ ...config, name: 'Custom', round_minutes: 30, overtime_minutes: 3 })
        ]);
        const customState = await rpc('community_snapshot', [custom]);
        assert.equal(customState.event.round_minutes, 30);
        assert.equal(customState.event.overtime_minutes, 3);
    } finally {
        await db.close();
    }
});

test('tournaments reject two or three players and start with four players and three rounds', async () => {
    const { db, rpc, create } = await setup(true);
    try {
        const id = await create();
        let state = await rpc('community_snapshot', [id]);
        for (const count of [2, 3]) {
            const ids = count === 2 ? [pid(1), pid(2)] : [pid(3)];
            state = await rpc('community_add_players', [
                id,
                JSON.stringify(ids),
                state.event.revision
            ]);
            await assert.rejects(
                () => rpc('community_start_event', [id, state.event.revision]),
                /4 a 128/
            );
            await assert.rejects(
                () => rpc('community_command', [id, 'start', '{}', state.event.revision]),
                /4 a 128/
            );
            const after = await rpc('community_snapshot', [id]);
            assert.equal(after.rounds.length, 0);
            assert.equal(after.event.status, 'published');
            assert.equal(after.event.revision, state.event.revision);
        }
        state = await rpc('community_add_players', [
            id,
            JSON.stringify([pid(4)]),
            state.event.revision
        ]);
        state = await rpc('community_start_event', [id, state.event.revision]);
        assert.equal(state.event.initial_players, 4);
        assert.equal(state.event.rounds, 3);
        assert.equal(state.matches.length, 2);
        assert.equal(state.rounds[0].status, 'running');
    } finally {
        await db.close();
    }
});

test('pause and restart archives current scores, permits drops, preserves earlier rounds and rolls back invalid pairings', async () => {
    const { db, rpc, create, login } = await setup(true);
    const { buildPairings } = await import('../supabase/functions/_shared/community-engine.mjs');
    try {
        const id = await create();
        let state = await rpc('community_snapshot', [id]);
        state = await rpc('community_add_players', [
            id,
            JSON.stringify([pid(1), pid(2), pid(3), pid(4)]),
            state.event.revision
        ]);
        state = await rpc('community_start_event', [id, state.event.revision]);
        const command = async (action, data = {}) => {
            if (data.match_id)
                data.match_revision = state.matches.find(
                    (match) => match.id === data.match_id
                ).revision;
            state = await rpc('community_command', [
                id,
                action,
                JSON.stringify(data),
                state.event.revision
            ]);
        };
        for (const match of state.matches)
            await command('resolve', { match_id: match.id, wins: 2, losses: 0, draws: 0 });
        const firstRound = state.rounds[0];
        await command('pair', {
            pairs: buildPairings(state.standings, state.matches, 'round-two'),
            seed: 'round-two'
        });
        await command('start_round');
        const current = state.rounds[1];
        const tables = state.matches.filter((match) => match.round_id === current.id);
        await command('resolve', { match_id: tables[0].id, wins: 2, losses: 1, draws: 0 });
        const drop = tables[1].p1;
        await assert.rejects(() => command('drop', { entry_id: drop }), /Resolva a partida atual/);
        await login(2);
        await assert.rejects(
            () => rpc('community_pause_round', [id, state.event.revision]),
            /administrativo/
        );
        await login(1);
        await assert.rejects(
            () => rpc('community_pause_round', [id, state.event.revision - 1]),
            /torneio mudou/
        );
        state = await rpc('community_pause_round', [id, state.event.revision]);
        assert.equal(state.rounds[1].status, 'paused');
        assert.equal(state.matches.filter((match) => match.round_id === current.id).length, 0);
        assert.deepEqual(state.rounds[0], firstRound);
        const archived = state.audit.find((record) => record.action === 'paused_round_snapshot');
        assert.equal(archived.details.matches.length, 2);
        assert.ok(archived.details.matches.some((match) => match.status === 'confirmed'));
        const earlier = state.matches.find((match) => match.round_id === firstRound.id);
        state = await rpc('community_correct_result', [
            id,
            JSON.stringify({
                match_id: earlier.id,
                match_revision: earlier.revision,
                wins: 0,
                losses: 2,
                draws: 0
            }),
            state.event.revision
        ]);
        await command('drop', { entry_id: drop });
        const priorMatches = state.matches.filter((match) => match.round_id === firstRound.id);
        await assert.rejects(
            () =>
                rpc('community_restart_round', [
                    id,
                    '{"pairs":[],"seed":"invalid"}',
                    state.event.revision
                ]),
            /todas as mesas/
        );
        state = await rpc('community_snapshot', [id]);
        assert.equal(state.rounds[1].id, current.id, 'failed restart keeps the paused round');
        assert.equal(state.rounds[1].status, 'paused');
        const pairs = buildPairings(state.standings, state.matches, 'restarted');
        state = await rpc('community_restart_round', [
            id,
            JSON.stringify({ pairs, seed: 'restarted' }),
            state.event.revision
        ]);
        assert.equal(state.rounds.length, 2);
        assert.equal(state.rounds[1].number, 2);
        assert.notEqual(state.rounds[1].id, current.id);
        assert.equal(state.rounds[1].status, 'running');
        assert.deepEqual(state.rounds[0], firstRound);
        assert.deepEqual(
            state.matches.filter((match) => match.round_id === firstRound.id),
            priorMatches
        );
        const restarted = state.matches.filter((match) => match.round_id === state.rounds[1].id);
        assert.equal(
            new Set(restarted.flatMap((match) => [match.p1, match.p2]).filter(Boolean)).size,
            3
        );
        assert.ok(restarted.every((match) => match.p1 !== drop && match.p2 !== drop));
        assert.equal(restarted.filter((match) => match.p2 === null).length, 1);
        assert.equal(
            Date.parse(state.rounds[1].ends_at) - Date.parse(state.rounds[1].started_at),
            45 * 60000
        );
        assert.equal(
            Date.parse(state.rounds[1].overtime_ends_at) - Date.parse(state.rounds[1].ends_at),
            5 * 60000
        );
        assert.equal(state.audit[0].action, 'restart_round');
        await assert.rejects(
            () =>
                rpc('community_restart_round', [
                    id,
                    JSON.stringify({ pairs, seed: 'again' }),
                    state.event.revision
                ]),
            /Pare a rodada/
        );
    } finally {
        await db.close();
    }
});

test('admins edit running event settings without resetting the round, timer or results', async () => {
    const { db, rpc, create, login } = await setup(true);
    try {
        const id = await create();
        let state = await rpc('community_snapshot', [id]);
        state = await rpc('community_add_players', [
            id,
            JSON.stringify([pid(1), pid(2), pid(3), pid(4)]),
            state.event.revision
        ]);
        state = await rpc('community_start_event', [id, state.event.revision]);
        const rounds = state.rounds,
            matches = state.matches;
        const payload = {
            name: 'CWB Editado',
            starts_at: '2026-11-02T19:30:00-03:00',
            store_id: '',
            modality: 'online',
            location: 'Sala atualizada',
            event_type: 'Semanal',
            format_id: 1,
            capacity: 32
        };
        await login(2);
        await assert.rejects(
            () =>
                rpc('community_configure_event', [
                    id,
                    JSON.stringify(payload),
                    state.event.revision
                ]),
            /administrativo/
        );
        await login(1);
        await assert.rejects(
            () =>
                rpc('community_configure_event', [
                    id,
                    JSON.stringify(payload),
                    state.event.revision - 1
                ]),
            /torneio mudou/
        );
        await assert.rejects(
            () =>
                rpc('community_configure_event', [
                    id,
                    JSON.stringify({ ...payload, capacity: 3 }),
                    state.event.revision
                ]),
            /capacidade/
        );
        state = await rpc('community_configure_event', [
            id,
            JSON.stringify(payload),
            state.event.revision
        ]);
        assert.equal(state.event.name, payload.name);
        assert.equal(Date.parse(state.event.starts_at), Date.parse(payload.starts_at));
        assert.equal(state.event.status, 'running');
        assert.equal(state.event.initial_players, 4);
        assert.equal(state.event.rounds, 3);
        assert.deepEqual(state.rounds, rounds);
        assert.deepEqual(state.matches, matches);
        assert.equal(state.audit[0].action, 'configure');
        assert.equal(state.audit[0].details.actor_name, 'Player 1');
    } finally {
        await db.close();
    }
});

test('only admins adjust a running clock without a reason and both deadlines move together', async () => {
    const { db, rpc, create, login } = await setup(true);
    try {
        const id = await create();
        let state = await rpc('community_snapshot', [id]);
        state = await rpc('community_add_players', [
            id,
            JSON.stringify([pid(1), pid(2), pid(3), pid(4)]),
            state.event.revision
        ]);
        state = await rpc('community_start_event', [id, state.event.revision]);
        const before = state.rounds[0];
        await login(2);
        await assert.rejects(
            () =>
                rpc('community_command', [
                    id,
                    'adjust_clock',
                    '{"seconds":300}',
                    state.event.revision
                ]),
            /administrativo/
        );
        await login(1);
        await assert.rejects(
            () =>
                rpc('community_command', [
                    id,
                    'adjust_clock',
                    '{"seconds":3601}',
                    state.event.revision
                ]),
            /uma hora/
        );
        state = await rpc('community_command', [
            id,
            'adjust_clock',
            '{"seconds":300}',
            state.event.revision
        ]);
        assert.equal(Date.parse(state.rounds[0].ends_at) - Date.parse(before.ends_at), 300000);
        assert.equal(
            Date.parse(state.rounds[0].overtime_ends_at) - Date.parse(before.overtime_ends_at),
            300000
        );
        assert.equal(state.audit[0].action, 'adjust_clock');
        assert.equal(state.audit[0].details.actor_name, 'Player 1');
        assert.equal(state.audit[0].details.seconds, 300);
        assert.equal('reason' in state.audit[0].details, false);
        state = await rpc('community_command', [
            id,
            'adjust_clock',
            '{"seconds":-120}',
            state.event.revision
        ]);
        assert.equal(Date.parse(state.rounds[0].ends_at) - Date.parse(before.ends_at), 180000);
        assert.equal(
            Date.parse(state.rounds[0].overtime_ends_at) - Date.parse(state.rounds[0].ends_at),
            300000
        );
        await assert.rejects(
            () =>
                rpc('community_command', [
                    id,
                    'adjust_clock',
                    '{"seconds":60}',
                    state.event.revision - 1
                ]),
            /torneio mudou/
        );
    } finally {
        await db.close();
    }
});

test('admins correct historical results without losing later rounds and must review corrected final standings again', async () => {
    const { db, rpc, create, login } = await setup(true);
    const { buildPairings } = await import('../supabase/functions/_shared/community-engine.mjs');
    try {
        const id = await create();
        let state = await rpc('community_snapshot', [id]);
        state = await rpc('community_add_players', [
            id,
            JSON.stringify([pid(1), pid(2), pid(3), pid(4)]),
            state.event.revision
        ]);
        state = await rpc('community_start_event', [id, state.event.revision]);
        const command = async (action, data = {}) => {
            if (data.match_id)
                data.match_revision = state.matches.find(
                    (match) => match.id === data.match_id
                ).revision;
            state = await rpc('community_command', [
                id,
                action,
                JSON.stringify(data),
                state.event.revision
            ]);
        };
        const complete = async () => {
            const round = state.rounds[state.rounds.length - 1];
            for (const match of state.matches.filter((match) => match.round_id === round.id))
                await command('resolve', { match_id: match.id, wins: 2, losses: 0, draws: 0 });
        };
        const next = async () => {
            await command('pair', {
                pairs: buildPairings(
                    state.standings,
                    state.matches,
                    'history-' + state.rounds.length
                ),
                seed: 'history'
            });
            await command('start_round');
        };
        await complete();
        const first = state.matches[0];
        await next();
        const laterRound = state.rounds[1];
        const laterMatches = state.matches.filter((match) => match.round_id === laterRound.id);
        const payload = {
            match_id: first.id,
            match_revision: first.revision,
            wins: 0,
            losses: 2,
            draws: 0
        };
        await login(2);
        await assert.rejects(
            () =>
                rpc('community_correct_result', [
                    id,
                    JSON.stringify(payload),
                    state.event.revision
                ]),
            /administrativo/
        );
        await login(1);
        await assert.rejects(
            () =>
                rpc('community_correct_result', [
                    id,
                    JSON.stringify({ ...payload, wins: 2, losses: 2 }),
                    state.event.revision
                ]),
            /somar/
        );
        await assert.rejects(
            () =>
                rpc('community_correct_result', [
                    id,
                    JSON.stringify({ ...payload, match_revision: first.revision - 1 }),
                    state.event.revision
                ]),
            /placar mudou/
        );
        state = await rpc('community_correct_result', [
            id,
            JSON.stringify(payload),
            state.event.revision
        ]);
        assert.deepEqual(state.rounds[1], laterRound, 'the current clock and round are preserved');
        assert.deepEqual(
            state.matches.filter((match) => match.round_id === laterRound.id),
            laterMatches,
            'later pairings are preserved'
        );
        assert.equal(state.standings.find((entry) => entry.id === first.p1).points, 0);
        assert.equal(state.standings.find((entry) => entry.id === first.p2).points, 3);
        assert.equal(state.audit[0].action, 'correct_result');
        await complete();
        await next();
        await complete();
        await command('finish', { reviewed: true });
        await command('export');
        await command('link_digilab', { digilab_id: 12345 });
        const frozenExport = state.exports[0].body;
        const roundIds = state.rounds.map((round) => round.id);
        const revision = state.matches.find((match) => match.id === first.id).revision;
        state = await rpc('community_correct_result', [
            id,
            JSON.stringify({ ...payload, match_revision: revision, wins: 1, losses: 1 }),
            state.event.revision
        ]);
        assert.equal(state.event.status, 'running');
        assert.equal(state.event.final_order, null);
        assert.equal(state.event.reconciliation, 'review');
        assert.deepEqual(
            state.rounds.map((round) => round.id),
            roundIds
        );
        assert.equal(state.exports[0].body, frozenExport, 'the old export remains archived');
        await assert.rejects(() => command('export'), /Finalize/);
        await command('finish', { reviewed: true });
        assert.equal(state.event.status, 'finished');
        await command('export');
        assert.notEqual(state.exports[0].body, frozenExport);
    } finally {
        await db.close();
    }
});

test('players can withdraw only their own registration before starting and rejoin the freed seat', async () => {
    const { db, rpc, create, login } = await setup(true);
    try {
        const id = await create();
        let state = await rpc('community_snapshot', [id]);
        state = await rpc('community_add_players', [
            id,
            JSON.stringify([pid(1), pid(2), pid(3), pid(4)]),
            state.event.revision
        ]);
        const command = async (action, data = {}, revision = state.event.revision) => {
            state = await rpc('community_command', [id, action, JSON.stringify(data), revision]);
        };
        const other = state.entries.find((entry) => entry.player_id === pid(3)).id;
        await login(null);
        await assert.rejects(() => command('drop'), /conta ativa/);
        await login(5);
        await assert.rejects(() => command('drop', { entry_id: other }), /própria inscrição/);
        await login(2);
        await assert.rejects(() => command('drop', { entry_id: other }), /própria inscrição/);
        assert.equal(state.entries.length, 4);
        const stale = state.event.revision;
        await command('drop');
        assert.equal(state.event.status, 'published');
        assert.equal(state.entries.length, 3);
        assert.ok(!state.entries.some((entry) => entry.player_id === pid(2)));
        assert.ok(state.entries.some((entry) => entry.id === other));
        assert.ok(state.audit === undefined || state.audit.length === 0);
        await assert.rejects(() => command('drop', {}, stale), /torneio mudou/);
        await assert.rejects(() => command('drop'), /própria inscrição/);
        await command('register');
        assert.equal(state.entries.length, 4);
        await login(1);
        state = await rpc('community_snapshot', [id]);
        assert.ok(state.audit.some((item) => item.action === 'drop' && item.actor === uid(2)));
        state = await rpc('community_start_event', [id, state.event.revision]);
        await login(2);
        await assert.rejects(() => command('drop'), /administrativo/);
    } finally {
        await db.close();
    }
});

test('overview only shows a running event to players who have not dropped', async () => {
    const { db, rpc, create, login } = await setup(true);
    try {
        const id = await create();
        let state = await rpc('community_snapshot', [id]);
        await login(null);
        assert.equal(
            (await rpc('community_list', [false]))[0].id,
            id,
            'open enrollment is visible before starting'
        );
        await login(1);
        state = await rpc('community_add_players', [
            id,
            JSON.stringify([pid(1), pid(2), pid(3), pid(4)]),
            state.event.revision
        ]);
        state = await rpc('community_start_event', [id, state.event.revision]);
        for (const user of [null, 5]) {
            await login(user);
            assert.equal((await rpc('community_list', [false])).length, 0);
        }
        await login(2);
        assert.equal((await rpc('community_list', [false]))[0].active_participant, true);
        await login(1);
        for (const match of state.matches) {
            state = await rpc('community_command', [
                id,
                'resolve',
                JSON.stringify({
                    match_id: match.id,
                    match_revision: match.revision,
                    wins: 2,
                    losses: 0,
                    draws: 0
                }),
                state.event.revision
            ]);
        }
        await login(2);
        await assert.rejects(
            () => rpc('community_command', [id, 'drop', '{}', state.event.revision]),
            /administrativo/
        );
        await login(1);
        state = await rpc('community_command', [
            id,
            'drop',
            JSON.stringify({
                entry_id: state.entries.find((entry) => entry.player_id === pid(2)).id
            }),
            state.event.revision
        ]);
        await login(2);
        assert.ok(state.entries.find((entry) => entry.player_id === pid(2)).dropped);
        assert.equal(
            (await rpc('community_list', [false])).length,
            0,
            'drop removes the active banner'
        );
        await login(1);
        assert.equal((await rpc('community_list', [false]))[0].active_participant, true);
        assert.equal(
            (await rpc('community_list', [true]))[0].id,
            id,
            'management discovery remains available to admins'
        );
    } finally {
        await db.close();
    }
});

test('start publishes a complete first round and starts its clock atomically for even and odd fields', async () => {
    const { db, rpc, create, login } = await setup(true);
    try {
        for (const count of [4, 5]) {
            const id = await create();
            let snapshot = await rpc('community_snapshot', [id]);
            snapshot = await rpc('community_add_players', [
                id,
                JSON.stringify([pid(1)]),
                snapshot.event.revision
            ]);
            await login(2);
            await assert.rejects(
                () => rpc('community_start_event', [id, snapshot.event.revision]),
                /administrativo/
            );
            await login(1);
            await assert.rejects(
                () => rpc('community_start_event', [id, snapshot.event.revision]),
                /4 a 128/
            );
            const unchanged = await rpc('community_snapshot', [id]);
            assert.equal(unchanged.event.status, 'published');
            assert.equal(unchanged.rounds.length, 0);
            snapshot = await rpc('community_add_players', [
                id,
                JSON.stringify(Array.from({ length: count - 1 }, (_, i) => pid(i + 2))),
                snapshot.event.revision
            ]);
            snapshot = await rpc('community_start_event', [id, snapshot.event.revision]);
            assert.equal(snapshot.event.status, 'running');
            assert.equal(snapshot.event.registration_open, false);
            assert.equal(snapshot.rounds.length, 1);
            assert.equal(snapshot.rounds[0].status, 'running');
            assert.equal(snapshot.matches.length, Math.ceil(count / 2));
            assert.equal(
                new Set(snapshot.matches.flatMap((m) => [m.p1, m.p2]).filter(Boolean)).size,
                count
            );
            assert.equal(snapshot.matches.filter((m) => m.p2 === null).length, count % 2);
            assert.equal(snapshot.standings.length, count);
            assert.equal(
                Date.parse(snapshot.rounds[0].ends_at) - Date.parse(snapshot.rounds[0].started_at),
                45 * 60000
            );
            assert.ok(snapshot.audit.some((entry) => entry.action === 'start'));
            assert.ok(snapshot.audit.some((entry) => entry.action === 'pair'));
            assert.ok(snapshot.audit.some((entry) => entry.action === 'start_round'));
            const player = snapshot.entries.find((entry) => entry.player_id === pid(2));
            const otherTable = snapshot.matches.find(
                (match) => match.p2 && match.p1 !== player.id && match.p2 !== player.id
            );
            await login(2);
            await assert.rejects(
                () =>
                    rpc('community_command', [
                        id,
                        'propose',
                        JSON.stringify({
                            match_id: otherTable.id,
                            match_revision: otherTable.revision,
                            wins: 2,
                            losses: 0,
                            draws: 0
                        }),
                        snapshot.event.revision
                    ]),
                /não participa/
            );
            const ownTable = snapshot.matches.find(
                (match) => match.p2 && (match.p1 === player.id || match.p2 === player.id)
            );
            if (ownTable) {
                snapshot = await rpc('community_command', [
                    id,
                    'propose',
                    JSON.stringify({
                        match_id: ownTable.id,
                        match_revision: ownTable.revision,
                        wins: 2,
                        losses: 0,
                        draws: 0
                    }),
                    snapshot.event.revision
                ]);
                assert.equal(
                    snapshot.matches.find((match) => match.id === ownTable.id).status,
                    'proposed'
                );
            }
            await login(1);
            snapshot = await rpc('community_snapshot', [id]);
            snapshot = await rpc('community_command', [
                id,
                'resolve',
                JSON.stringify({
                    match_id: otherTable.id,
                    match_revision: otherTable.revision,
                    wins: 2,
                    losses: 0,
                    draws: 0
                }),
                snapshot.event.revision
            ]);
            assert.equal(
                snapshot.matches.find((match) => match.id === otherTable.id).status,
                'confirmed',
                'admins can resolve any table'
            );
            await assert.rejects(
                () => rpc('community_start_event', [id, snapshot.event.revision]),
                /iniciado/
            );
            assert.equal((await rpc('community_snapshot', [id])).rounds.length, 1);
        }
    } finally {
        await db.close();
    }
});

test('open enrollment migration upgrades existing drafts and is safe to reapply', async () => {
    const { db, rpc, create, login } = await setup();
    try {
        const id = await create();
        assert.equal((await rpc('community_snapshot', [id])).event.status, 'draft');
        await db.exec('reset role');
        for (const migration of [
            '20261101090000_community_play_flow.sql',
            '20261101100000_community_open_enrollment.sql',
            '20261101100000_community_open_enrollment.sql',
            '20261101110000_community_readable_audit.sql',
            '20261101110000_community_readable_audit.sql'
        ])
            await db.exec(readFileSync(`database/migrations/${migration}`, 'utf8'));
        await db.exec('set role authenticated');
        await login(null);
        const events = await rpc('community_list', [false]);
        assert.equal(events[0].id, id);
        assert.equal(events[0].registration_open, true);
        await login(2);
        const snapshot = await rpc('community_command', [id, 'register', '{}', events[0].revision]);
        assert.equal(snapshot.entries.length, 1);
        assert.equal(snapshot.entries[0].checked_in, true);
        await assert.rejects(
            () => rpc('community_command', [id, 'register', '{}', snapshot.event.revision]),
            /já inscrito/
        );
        assert.equal(snapshot.audit.length, 0, 'audit is private to the organization');
        await login(1);
        let admin = await rpc('community_snapshot', [id]);
        assert.equal(admin.audit.find((a) => a.action === 'create').details.actor_name, 'Player 1');
        admin = await rpc('community_add_players', [
            id,
            JSON.stringify([pid(3), pid(4)]),
            admin.event.revision
        ]);
        assert.deepEqual(admin.audit[0].details.target_names, ['Player 3', 'Player 4']);
        const removed = admin.entries.find((entry) => entry.player_id === pid(3));
        admin = await rpc('community_command', [
            id,
            'drop',
            JSON.stringify({ entry_id: removed.id }),
            admin.event.revision
        ]);
        assert.equal(
            admin.entries.some((entry) => entry.id === removed.id),
            false
        );
        assert.equal(admin.audit[0].details.actor_name, 'Player 1');
        assert.deepEqual(
            admin.audit[0].details.target_names,
            ['Player 3'],
            'target name survives removal of the entry'
        );
    } finally {
        await db.close();
    }
});

test('PLAY: enrollment, repeated counterproposals, score limits, server clock and final confirmation', async () => {
    const { db, rpc, create, login } = await setup(true);
    try {
        const id = await create();
        let s = await rpc('community_snapshot', [id]);
        const command = async (action, data = {}) => {
            if (data.match_id && data.match_revision === undefined)
                data.match_revision = s.matches.find((m) => m.id === data.match_id).revision;
            s = await rpc('community_command', [
                id,
                action,
                JSON.stringify(data),
                s.event.revision
            ]);
            return s;
        };
        s = await rpc('community_add_players', [
            id,
            JSON.stringify([pid(1), pid(2), pid(3)]),
            s.event.revision
        ]);
        assert.ok(s.entries.every((e) => e.checked_in));
        assert.equal(s.event.status, 'published', 'new events are immediately published');
        assert.equal(s.event.registration_open, true);
        await login(null);
        assert.equal(
            (await rpc('community_list', [false]))[0].id,
            id,
            'overview discovers enrollment immediately'
        );
        await login(4);
        await command('register');
        await login(1);
        await assert.rejects(() => command('checkin_window', { open: true }), /desconhecida/);
        await command('start');
        assert.equal(s.event.initial_players, 4);
        await login(null);
        assert.equal(
            (await rpc('community_list', [false])).length,
            0,
            'running notices are hidden from nonparticipants'
        );
        await login(1);
        const entries = [1, 2, 3, 4].map((n) => s.entries.find((e) => e.player_id === pid(n)));
        const rounds = [
            [
                [0, 1],
                [2, 3]
            ],
            [
                [0, 2],
                [1, 3]
            ],
            [
                [0, 3],
                [1, 2]
            ]
        ];
        for (let index = 0; index < rounds.length; index++) {
            await command('pair', {
                pairs: rounds[index].map(([a, b]) => ({ p1: entries[a].id, p2: entries[b].id })),
                seed: 'play-test'
            });
            await command('start_round');
            const round = s.rounds[s.rounds.length - 1];
            assert.equal(Date.parse(round.ends_at) - Date.parse(round.started_at), 45 * 60000);
            assert.equal(Date.parse(round.overtime_ends_at) - Date.parse(round.ends_at), 5 * 60000);
            const matches = s.matches.filter((m) => m.round_id === round.id);
            if (index === 0) {
                const match = matches.find((m) => m.p1 !== entries[0].id && m.p2 !== entries[0].id);
                const n1 = Number(s.entries.find((e) => e.id === match.p1).player_id.slice(-12));
                const n2 = Number(s.entries.find((e) => e.id === match.p2).player_id.slice(-12));
                await login(n1);
                for (const [wins, losses, draws] of [
                    [2, 2, 1],
                    [2, 1, 1],
                    [0, 0, 0]
                ])
                    await assert.rejects(
                        () => command('propose', { match_id: match.id, wins, losses, draws }),
                        /somar/
                    );
                await command('propose', { match_id: match.id, wins: 2, losses: 0, draws: 0 });
                const stale = s.matches.find((m) => m.id === match.id).revision;
                await assert.rejects(
                    () => command('confirm', { match_id: match.id }),
                    /adversário/
                );
                await login(n2);
                await command('contest', { match_id: match.id, wins: 2, losses: 1, draws: 0 });
                assert.equal(s.matches.find((m) => m.id === match.id).proposed_by, match.p2);
                assert.equal(s.matches.find((m) => m.id === match.id).wins, 1);
                await login(n1);
                await assert.rejects(
                    () => command('confirm', { match_id: match.id, match_revision: stale }),
                    /placar mudou/
                );
                await command('contest', { match_id: match.id, wins: 2, losses: 0, draws: 0 });
                await login(n2);
                await command('confirm', { match_id: match.id });
                assert.equal(s.rounds[s.rounds.length - 1].status, 'running');
                await login(1);
                await command('resolve', {
                    match_id: matches.find((m) => m.id !== match.id).id,
                    wins: 2,
                    losses: 0,
                    draws: 0
                });
            } else {
                for (const match of matches)
                    await command('resolve', { match_id: match.id, wins: 2, losses: 1, draws: 0 });
            }
            assert.equal(s.rounds[s.rounds.length - 1].status, 'closed');
            const reloaded = await rpc('community_snapshot', [id]);
            assert.deepEqual(
                reloaded.matches,
                s.matches,
                'submitted scores survive reopening the app'
            );
        }
        await assert.rejects(() => command('finish'), /Confirme/);
        await command('finish', { reviewed: true, order: s.standings.map((e) => e.id) });
        assert.equal(s.event.status, 'finished');
        await command('export');
        assert.equal(s.exports[0].body.split('\n').length, 4);
    } finally {
        await db.close();
    }
});

async function setup(playFlow = false) {
    const db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated;
 create table auth.users(id uuid primary key);
 create table public.players(id uuid primary key,name text,bandai_id text,digilab_name text);
 create table public.user_profiles(user_id uuid primary key,player_id uuid,status text default 'active');
 create table public.admin_users(user_id uuid primary key);
 create function public.site_has_identity() returns boolean language sql stable security definer as $$ select exists(select 1 from public.user_profiles where user_id=auth.uid() and status='active') $$;
 create function public.site_is_admin() returns boolean language sql stable security definer as $$ select public.site_has_identity() and exists(select 1 from public.admin_users where user_id=auth.uid()) $$;
 create table public.formats(id bigint primary key,code text,created_at timestamptz default now(),is_active boolean default true,is_default boolean default false); insert into public.formats(id,code) values(1,'EX13');
 create table public.stores(id uuid primary key,name text);
 create table public.decks(id uuid primary key,name text);
 create table public.tournament(id bigint primary key);
 insert into public.admin_users values('${uid(1)}');`);
    for (let i = 1; i <= 130; i++) await db.query(`insert into auth.users values($1);`, [uid(i)]);
    for (let i = 1; i <= 130; i++) {
        await db.query('insert into public.players values($1,$2,$3,null)', [
            pid(i),
            'Player ' + i,
            String(i).padStart(10, '0')
        ]);
        await db.query('insert into public.user_profiles(user_id,player_id) values($1,$2)', [
            uid(i),
            pid(i)
        ]);
    }
    await db.exec(
        readFileSync('database/migrations/20261101010000_community_tournaments.sql', 'utf8')
    );
    await db.exec(
        readFileSync(
            'database/migrations/20261101040000_community_event_defaults_and_players.sql',
            'utf8'
        )
    );
    await db.exec(
        readFileSync('database/migrations/20261101050000_community_delete_event.sql', 'utf8')
    );
    await db.exec(
        readFileSync('database/migrations/20261101060000_community_bye_game_percentage.sql', 'utf8')
    );
    await db.exec(
        readFileSync('database/migrations/20261101070000_community_start_datetime.sql', 'utf8')
    );
    if (playFlow) {
        await db.exec(
            readFileSync('database/migrations/20261101090000_community_play_flow.sql', 'utf8')
        );
        await db.exec(
            readFileSync('database/migrations/20261101100000_community_open_enrollment.sql', 'utf8')
        );
        await db.exec(
            readFileSync('database/migrations/20261101110000_community_readable_audit.sql', 'utf8')
        );
        await db.exec(
            readFileSync(
                'database/migrations/20261101120000_community_automatic_first_round.sql',
                'utf8'
            )
        );
        await db.exec(
            readFileSync('database/migrations/20261101130000_community_active_notices.sql', 'utf8')
        );
        await db.exec(
            readFileSync(
                'database/migrations/20261101140000_community_history_corrections.sql',
                'utf8'
            )
        );
        await db.exec(
            readFileSync('database/migrations/20261101150000_community_clock_no_reason.sql', 'utf8')
        );
        await db.exec(
            readFileSync(
                'database/migrations/20261101160000_community_admin_configuration.sql',
                'utf8'
            )
        );
        await db.exec(
            readFileSync(
                'database/migrations/20261101170000_community_two_player_events.sql',
                'utf8'
            )
        );
        await db.exec(
            readFileSync('database/migrations/20261101180000_community_restart_round.sql', 'utf8')
        );
        await db.exec(
            readFileSync('database/migrations/20261101190000_community_round_durations.sql', 'utf8')
        );
        await db.exec(
            readFileSync('database/migrations/20261101200000_community_resume_round.sql', 'utf8')
        );
        await db.exec(
            readFileSync(
                'database/migrations/20261102210000_community_organizer_round_controls.sql',
                'utf8'
            )
        );
        await db.exec(
            readFileSync(
                'database/migrations/20261102220000_community_player_score_perspective.sql',
                'utf8'
            )
        );
        await db.exec(
            readFileSync(
                'database/migrations/20261102230000_community_minimum_four_players.sql',
                'utf8'
            )
        );
        await db.exec(
            readFileSync('database/migrations/20261102240000_community_admin_results.sql', 'utf8')
        );
        await db.exec(
            readFileSync('database/migrations/20261102250000_community_self_withdrawal.sql', 'utf8')
        );
    }
    await db.exec(
        `set role authenticated; select set_config('request.jwt.claim.sub','${uid(1)}',false);`
    );
    const rpc = async (name, params) =>
        (
            await db.query(
                `select public.${name}(${params.map((_, i) => '$' + (i + 1)).join(',')}) as value`,
                params
            )
        ).rows[0].value;
    const create = () =>
        rpc('community_create', [
            JSON.stringify({
                name: 'CWB Teste',
                starts_at: '2026-11-10T18:00:00-03:00',
                modality: 'online',
                event_type: 'Semanal',
                format_id: 1,
                capacity: 128
            })
        ]);
    return {
        db,
        rpc,
        create,
        login: async (n) =>
            db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? uid(n) : ''])
    };
}

test('community SQL: access, registration, rounds, proposals, audit and paste', async () => {
    const { db, rpc, create, login } = await setup();
    try {
        const id = await create();
        let snapshot = await rpc('community_snapshot', [id]);
        async function command(action, data = {}) {
            if (data.match_id)
                data = {
                    ...data,
                    match_revision: snapshot.matches.find((m) => m.id === data.match_id)?.revision
                };
            snapshot = await rpc('community_command', [
                id,
                action,
                JSON.stringify(data),
                snapshot.event.revision
            ]);
            return snapshot;
        }
        await command('publish');
        await command('registration', { open: true });
        await command('checkin_window', { open: true });
        for (let i = 1; i <= 4; i++) {
            await login(i);
            await command('register');
            await command('checkin');
        }
        await assert.rejects(() => command('register'), /já inscrito/);
        await assert.rejects(() => command('start'), /administrativo/);
        await db.exec(
            "reset role; update public.user_profiles set player_id=null where user_id='" +
                uid(5) +
                "'; set role authenticated;"
        );
        await login(5);
        await assert.rejects(() => command('register'), /Vincule/);
        await login(1);
        await command('start');
        assert.equal(snapshot.event.rounds, 3);
        assert.equal(snapshot.event.initial_players, 4);
        const entries = snapshot.entries;
        const combinations = [
            [
                [0, 1],
                [2, 3]
            ],
            [
                [0, 2],
                [1, 3]
            ],
            [
                [0, 3],
                [1, 2]
            ]
        ];
        for (let round = 0; round < 3; round++) {
            const pairs = combinations[round].map(([a, b]) => ({
                p1: entries[a].id,
                p2: entries[b].id
            }));
            await command('pair', { pairs, seed: 'test-' + round });
            await command('start_round');
            await assert.rejects(() => command('close_round'), /Resolva/);
            const current = snapshot.rounds.at(-1);
            const matches = snapshot.matches.filter((m) => m.round_id === current.id);
            const priorRevision = snapshot.event.revision;
            await command('resolve', {
                match_id: matches[0].id,
                wins: 1,
                losses: 1,
                draws: round === 0 ? 0 : 1,
                reason: 'resultado conferido'
            });
            if (round === 0)
                assert.equal(
                    Number(snapshot.standings.find((s) => s.id === matches[0].p1).gw),
                    0.5,
                    '1–1–0 counts two games'
                );
            const match = matches[1],
                p1 = entries.find((e) => e.id === match.p1),
                p2 = entries.find((e) => e.id === match.p2);
            const n1 = Number(p1.player_id.slice(-12)),
                n2 = Number(p2.player_id.slice(-12));
            await login(n1);
            snapshot = await rpc('community_command', [
                id,
                'propose',
                JSON.stringify({
                    match_id: match.id,
                    match_revision: match.revision,
                    wins: 2,
                    losses: 1,
                    draws: 0
                }),
                priorRevision
            ]);
            await assert.rejects(() => command('confirm', { match_id: match.id }), /adversário/);
            await login(n2);
            await assert.rejects(
                () =>
                    rpc('community_command', [
                        id,
                        'confirm',
                        JSON.stringify({ match_id: match.id, match_revision: 0 }),
                        priorRevision
                    ]),
                /placar mudou/
            );
            await command('confirm', { match_id: match.id });
            await login(1);
            await command('close_round');
        }
        await assert.rejects(() => command('finish'), /Revise/);
        await command('reopen_round', { reason: 'Conferência final preservando as mesas' });
        assert.equal(snapshot.rounds.at(-1).status, 'running');
        await command('close_round');
        await command('finish', { reviewed: true, reason: 'Conferência manual da classificação' });
        await command('export');
        assert.match(snapshot.exports[0].body, /1 Player \d+ #0000000\d{3} \d/);
        assert.equal(snapshot.exports[0].header.players, 4);
        assert.ok(snapshot.matches.some((m) => m.draws === 1));
        assert.ok(snapshot.matches.some((m) => m.wins === 1 && m.losses === 1 && m.draws === 0));
        await login(2);
        const player = await rpc('community_snapshot', [id]);
        assert.equal(player.exports.length, 0);
        assert.equal(player.audit.length, 0);
        assert.ok(
            player.entries
                .filter((e) => e.player_id !== pid(2))
                .every((e) => e.bandai_id === null && e.decklist === null)
        );
        await assert.rejects(() => command('cancel'), /administrativo/);
        await db.exec('set role anon;');
        await login(null);
        assert.equal((await rpc('community_list', [false])).length, 0);
        await assert.rejects(() => rpc('community_standings', [id]), /permission denied/);
    } finally {
        await db.close();
    }
});

test('community database accepts 128 checked-in players, freezes seven rounds and publishes 64 tables', async () => {
    const { db, rpc, create } = await setup();
    try {
        const id = await create();
        let snapshot = await rpc('community_snapshot', [id]);
        const command = async (action, data = {}) => {
            snapshot = await rpc('community_command', [
                id,
                action,
                JSON.stringify(data),
                snapshot.event.revision
            ]);
        };
        await command('publish');
        await db.exec('reset role;');
        await db.query('update community_events set capacity=128 where id=$1', [id]);
        await db.query(
            `insert into community_entries(event_id,player_id,checked_in) select $1,id,true from players order by id limit 128`,
            [id]
        );
        await db.exec('set role authenticated;');
        await command('start');
        assert.equal(snapshot.event.initial_players, 128);
        assert.equal(snapshot.event.rounds, 7);
        const pairs = Array.from({ length: 64 }, (_, i) => ({
            p1: snapshot.entries[2 * i].id,
            p2: snapshot.entries[2 * i + 1].id
        }));
        await command('pair', { pairs, seed: '128-player-test' });
        assert.equal(snapshot.matches.length, 64);
        await command('start_round');
        const initial = snapshot.rounds[0].ends_at;
        await command('adjust_clock', { seconds: 300, reason: 'Pausa técnica' });
        assert.equal(new Date(snapshot.rounds[0].ends_at) - new Date(initial), 300000);
        await assert.rejects(
            () => command('adjust_clock', { seconds: 300, reason: '' }),
            /justificativa/
        );
        await command('undo_round', { reason: 'Refazer mesas antes dos jogos' });
        assert.equal(snapshot.matches.length, 0);
        assert.ok(snapshot.audit.some((a) => a.action === 'invalidated_round_snapshot'));
    } finally {
        await db.close();
    }
});

test('community creation and editing preserve the chosen start time in Brasília', async () => {
    const { db, rpc, login } = await setup();
    try {
        const startsAt = '2026-11-01T23:45:00-03:00';
        const id = await rpc('community_create', [
            JSON.stringify({
                name: 'Casual noturno',
                starts_at: startsAt,
                date: '2026-10-31',
                player_ids: [pid(2)]
            })
        ]);
        let state = await rpc('community_snapshot', [id]);
        assert.equal(new Date(state.event.starts_at).toISOString(), '2026-11-02T02:45:00.000Z');
        assert.equal(
            new Date(
                state.audit.find((entry) => entry.action === 'create').details.starts_at
            ).toISOString(),
            new Date(startsAt).toISOString()
        );
        assert.equal(state.entries.length, 1);
        const editedStart = '2026-11-02T00:15:00-03:00';
        state = await rpc('community_command', [
            id,
            'configure',
            JSON.stringify({
                ...state.event,
                starts_at: editedStart
            }),
            state.event.revision
        ]);
        assert.equal(new Date(state.event.starts_at).toISOString(), '2026-11-02T03:15:00.000Z');
        await db.exec('reset role');
        await db.exec(
            readFileSync('database/migrations/20261101070000_community_start_datetime.sql', 'utf8')
        );
        await db.exec('set role authenticated');
        assert.equal(
            (await rpc('community_snapshot', [id])).event.starts_at,
            state.event.starts_at,
            'reapplying the migration does not modify existing schedules'
        );
        await assert.rejects(
            () =>
                rpc('community_create', [
                    JSON.stringify({ name: 'Data inválida', starts_at: 'infinity' })
                ]),
            /data e horário válidos/
        );
        await login(2);
        await assert.rejects(
            () =>
                rpc('community_create', [
                    JSON.stringify({ name: 'Sem permissão', starts_at: startsAt })
                ]),
            /administrativo/
        );
    } finally {
        await db.close();
    }
});

test('community creation defaults to 32 seats and current datetime, and admin can enroll guests atomically', async () => {
    const { db, rpc, login } = await setup();
    try {
        await db.exec(`reset role;
            insert into public.formats(id,code,created_at) values(2,'BT27',now()+interval '1 day');
            insert into public.players(id,name,bandai_id) values('${pid(999)}','Convidado sem conta',null);
            set role authenticated;`);
        const id = await rpc('community_create', [
            JSON.stringify({
                name: 'Casual de hoje',
                capacity: 128,
                player_ids: [pid(1), pid(999), pid(1)]
            })
        ]);
        let state = await rpc('community_snapshot', [id]);
        assert.equal(state.event.capacity, 32, 'capacity cannot be overridden on creation');
        assert.equal(state.event.location, 'Curitiba, Brazil');
        assert.equal(state.event.event_type, 'For Fun');
        assert.equal(state.event.modality, 'presencial');
        assert.equal(state.event.store_id, null);
        assert.equal(state.event.format_id, 2);
        const currentMinute = (await db.query("select date_trunc('minute',now())::text instant"))
            .rows[0].instant;
        assert.ok(
            Math.abs(Date.parse(state.event.starts_at) - Date.parse(currentMinute)) <= 60000,
            'default start preserves the current time rather than reducing it to midnight'
        );
        assert.equal(state.entries.length, 2);
        assert.ok(state.entries.some((e) => e.name === 'Convidado sem conta'));
        assert.ok(state.entries.every((e) => e.checked_in === false));
        const initialRevision = state.event.revision;
        state = await rpc('community_add_players', [
            id,
            JSON.stringify([pid(1), pid(2), pid(3)]),
            initialRevision
        ]);
        assert.equal(state.entries.length, 4);
        state = await rpc('community_add_players', [
            id,
            JSON.stringify([pid(1), pid(2), pid(3)]),
            initialRevision
        ]);
        assert.equal(state.entries.length, 4, 'retry does not duplicate registered players');
        await assert.rejects(
            () =>
                rpc('community_add_players', [
                    id,
                    JSON.stringify(Array.from({ length: 33 }, (_, i) => pid(i + 1))),
                    state.event.revision
                ]),
            /ultrapassa/
        );
        assert.equal(
            (await rpc('community_snapshot', [id])).entries.length,
            4,
            'capacity failure never enrolls a partial batch'
        );
        const count = (await rpc('community_list', [true])).length;
        await assert.rejects(
            () =>
                rpc('community_create', [
                    JSON.stringify({ name: 'Inválido', player_ids: [pid(998)] })
                ]),
            /não está cadastrado/
        );
        assert.equal(
            (await rpc('community_list', [true])).length,
            count,
            'failed initial selection rolls back the event too'
        );
        await assert.rejects(
            () =>
                rpc('community_create', [
                    JSON.stringify({
                        name: 'Lotado',
                        player_ids: Array.from({ length: 33 }, (_, i) => pid(i + 1))
                    })
                ]),
            /ultrapassa/
        );
        assert.equal((await rpc('community_list', [true])).length, count);
        await login(2);
        await assert.rejects(
            () =>
                rpc('community_add_players', [id, JSON.stringify([pid(4)]), state.event.revision]),
            /administrativo/
        );
        await assert.rejects(
            () => rpc('community_create', [JSON.stringify({ name: 'Sem permissão' })]),
            /administrativo/
        );
        await login(1);
        await db.exec('reset role');
        await db.exec(
            readFileSync(
                'database/migrations/20261101040000_community_event_defaults_and_players.sql',
                'utf8'
            )
        );
        await db.exec('set role authenticated');
        assert.equal(
            (await rpc('community_snapshot', [id])).entries.length,
            4,
            'reapplication keeps participants'
        );
    } finally {
        await db.close();
    }
});

test('community SQL: last seat, stale revisions, cross-event pairs and invalid scores', async () => {
    const { db, rpc, create, login } = await setup();
    try {
        const id = await create();
        let s = await rpc('community_snapshot', [id]);
        const command = async (action, data = {}) => {
            if (data.match_id)
                data = {
                    ...data,
                    match_revision: s.matches.find((m) => m.id === data.match_id)?.revision
                };
            s = await rpc('community_command', [
                id,
                action,
                JSON.stringify(data),
                s.event.revision
            ]);
        };
        await db.exec(
            `reset role; update public.community_events set capacity=4 where id='${id}'; set role authenticated;`
        );
        await command('publish');
        await command('registration', { open: true });
        const registrationRevision = s.event.revision;
        for (let i = 1; i <= 4; i++) {
            await login(i);
            s = await rpc('community_command', [id, 'register', '{}', registrationRevision]);
        }
        await login(5);
        await assert.rejects(() => command('register'), /esgotadas/);
        await login(1);
        await assert.rejects(
            () => rpc('community_command', [id, 'registration', '{"open":false}', 0]),
            /mudou/
        );
        for (const e of s.entries) await command('checkin', { entry_id: e.id });
        await command('start');
        await assert.rejects(
            () => command('pair', { pairs: [{ p1: s.entries[0].id, p2: s.entries[0].id }] }),
            /repetido/
        );
        await assert.rejects(
            () => command('pair', { pairs: [{ p1: pid(120), p2: s.entries[0].id }] }),
            /outro evento/
        );
        await command('pair', {
            pairs: [
                { p1: s.entries[0].id, p2: s.entries[1].id },
                { p1: s.entries[2].id, p2: s.entries[3].id }
            ]
        });
        await command('start_round');
        await assert.rejects(
            () =>
                command('resolve', {
                    match_id: s.matches[0].id,
                    wins: 2,
                    losses: 2,
                    draws: 0,
                    reason: 'invalid'
                }),
            /check constraint/
        );
    } finally {
        await db.close();
    }
});

test('only active admins can permanently delete an event, with revision and name confirmation', async () => {
    const { db, rpc, create, login } = await setup();
    try {
        // Schema deployment can be safely repeated.
        await db.exec('reset role');
        await db.exec(
            readFileSync('database/migrations/20261101050000_community_delete_event.sql', 'utf8')
        );
        await db.exec('set role authenticated');
        const control = await create();
        for (const status of ['draft', 'published', 'running', 'finished', 'cancelled']) {
            const id = await create();
            await db.exec('reset role');
            await db.query('update community_events set status=$2 where id=$1', [id, status]);
            if (status === 'finished') {
                await db.query('insert into tournament(id) values(123)');
                await db.query(
                    'update community_events set canonical_tournament_id=123 where id=$1',
                    [id]
                );
            }
            const entry = (
                await db.query(
                    'insert into community_entries(event_id,player_id,checked_in) values($1,$2,true) returning id',
                    [id, pid(2)]
                )
            ).rows[0].id;
            const round = (
                await db.query(
                    "insert into community_rounds(event_id,number,seed) values($1,1,'delete-test') returning id",
                    [id]
                )
            ).rows[0].id;
            await db.query(
                'insert into community_matches(event_id,round_id,table_number,p1,proposed_by) values($1,$2,1,$3,$3)',
                [id, round, entry]
            );
            await db.query(
                "insert into community_exports(event_id,revision,header,body) values($1,0,'{}','1 Player 2 #0000000002 3')",
                [id]
            );
            await db.exec('set role authenticated');
            await login(2);
            await assert.rejects(
                () => rpc('community_delete_event', [id, 0, 'CWB Teste']),
                /administrativo/
            );
            await login(1);
            await db.exec('reset role');
            await db.query("update user_profiles set status='disabled' where user_id=$1", [uid(1)]);
            await db.exec('set role authenticated');
            await assert.rejects(
                () => rpc('community_delete_event', [id, 0, 'CWB Teste']),
                /administrativo/
            );
            await db.exec('reset role');
            await db.query("update user_profiles set status='active' where user_id=$1", [uid(1)]);
            await db.exec('set role authenticated');
            await assert.rejects(
                () => rpc('community_delete_event', [id, null, 'CWB Teste']),
                /torneio mudou/
            );
            await assert.rejects(
                () => rpc('community_delete_event', [id, 1, 'CWB Teste']),
                /torneio mudou/
            );
            await assert.rejects(
                () => rpc('community_delete_event', [id, 0, 'Outro torneio']),
                /Digite o nome/
            );
            await assert.rejects(
                () => rpc('community_delete_event', [id, 0, null]),
                /Digite o nome/
            );
            assert.equal((await rpc('community_snapshot', [id])).entries.length, 1);
            await db.exec('set role anon');
            await assert.rejects(
                () => rpc('community_delete_event', [id, 0, 'CWB Teste']),
                /permission denied/
            );
            await db.exec('set role authenticated');
            assert.equal(await rpc('community_delete_event', [id, 0, 'CWB Teste']), id);
            await assert.rejects(
                () => rpc('community_delete_event', [id, 0, 'CWB Teste']),
                /não encontrado/
            );
            await db.exec('reset role');
            for (const table of [
                'community_events',
                'community_entries',
                'community_rounds',
                'community_matches',
                'community_audit',
                'community_exports'
            ]) {
                const column = table === 'community_events' ? 'id' : 'event_id';
                assert.equal(
                    (
                        await db.query(
                            `select count(*)::integer n from ${table} where ${column}=$1`,
                            [id]
                        )
                    ).rows[0].n,
                    0
                );
            }
            if (status === 'finished')
                assert.equal(
                    (await db.query('select count(*)::integer n from tournament where id=123'))
                        .rows[0].n,
                    1
                );
            await db.exec('set role authenticated');
        }
        assert.equal((await rpc('community_snapshot', [control])).event.id, control);
    } finally {
        await db.close();
    }
});

test('community byes award three points and follow active-player parity after drops', async () => {
    const { buildPairings } = await import('../supabase/functions/_shared/community-engine.mjs');
    const { db, rpc, create } = await setup();
    try {
        const id = await create();
        let snapshot = await rpc('community_snapshot', [id]);
        const command = async (action, data = {}) => {
            snapshot = await rpc('community_command', [
                id,
                action,
                JSON.stringify(data),
                snapshot.event.revision
            ]);
        };
        await rpc('community_add_players', [
            id,
            JSON.stringify(Array.from({ length: 8 }, (_, i) => pid(i + 1))),
            snapshot.event.revision
        ]);
        for (const entry of (await rpc('community_snapshot', [id])).entries)
            await command('checkin', { entry_id: entry.id });
        await command('publish');
        await command('start');
        let byeRecipient;
        for (const activeCount of [8, 7, 6]) {
            const seed = 'drops-' + activeCount;
            const pairs = buildPairings(snapshot.standings, snapshot.matches, seed);
            assert.equal(pairs.filter((pair) => pair.p2 === null).length, activeCount % 2);
            const pairedIds = pairs.flatMap((pair) => (pair.p2 ? [pair.p1, pair.p2] : [pair.p1]));
            assert.equal(pairedIds.length, activeCount);
            assert.equal(new Set(pairedIds).size, activeCount);
            assert.ok(
                snapshot.entries
                    .filter((entry) => entry.dropped)
                    .every((entry) => !pairedIds.includes(entry.id))
            );
            // A justification cannot introduce extra byes when the active count is even.
            if (activeCount % 2 === 0) {
                const invalid = [
                    { p1: pairs[0].p1, p2: null },
                    { p1: pairs[0].p2, p2: null },
                    ...pairs.slice(1)
                ];
                await assert.rejects(
                    () => command('pair', { pairs: invalid, seed, reason: 'Teste de validação' }),
                    /no máximo um bye/
                );
            }
            const before = new Map(snapshot.standings.map((entry) => [entry.id, entry]));
            await command('pair', { pairs, seed });
            const roundId = snapshot.rounds.at(-1).id;
            const roundMatches = snapshot.matches.filter((match) => match.round_id === roundId);
            const bye = roundMatches.find((match) => match.p2 === null);
            if (bye) {
                byeRecipient = bye.p1;
                assert.equal(bye.status, 'confirmed');
                assert.deepEqual([bye.wins, bye.losses, bye.draws], [2, 0, 0]);
                const standing = snapshot.standings.find((entry) => entry.id === bye.p1);
                const previous = before.get(bye.p1);
                assert.equal(standing.points, previous.points + 3);
                assert.equal(standing.byes, 1);
                assert.equal(Number(standing.game_points), Number(previous.game_points) + 6);
                assert.equal(Number(standing.games), Number(previous.games) + 2);
                assert.equal(
                    Number(standing.gw),
                    (Number(previous.game_points) + 6) / (3 * (Number(previous.games) + 2))
                );
                assert.equal(
                    Number(standing.played),
                    Number(previous.played),
                    'Bye creates no real opponent'
                );
                assert.equal(Number(standing.omw), Number(previous.omw));
            }
            await command('start_round');
            for (const match of roundMatches.filter((match) => match.p2))
                await command('resolve', {
                    match_id: match.id,
                    match_revision: match.revision,
                    wins: 2,
                    losses: 0,
                    draws: 0,
                    reason: 'Resultado conferido'
                });
            await command('close_round');
            if (activeCount > 6) {
                const departing = snapshot.entries.find(
                    (entry) => !entry.dropped && entry.id !== byeRecipient
                );
                const points = snapshot.standings.find((entry) => entry.id === departing.id).points;
                const history = snapshot.matches.length;
                await command('drop', { entry_id: departing.id });
                assert.equal(snapshot.matches.length, history);
                assert.equal(
                    snapshot.standings.find((entry) => entry.id === departing.id).points,
                    points
                );
            }
        }
        assert.equal(snapshot.matches.filter((match) => match.p2 === null).length, 1);
        assert.equal(snapshot.event.initial_players, 8);
    } finally {
        await db.close();
    }
});

test('Swiss engine: official round boundaries and complete deterministic matching through 128', async () => {
    const engine = await import(
        'data:text/javascript;base64,' +
            Buffer.from(
                readFileSync('supabase/functions/_shared/community-engine.mjs', 'utf8')
            ).toString('base64')
    );
    for (const [n, r] of [
        [2, 1],
        [3, 3],
        [4, 3],
        [8, 3],
        [9, 4],
        [16, 4],
        [17, 5],
        [32, 5],
        [33, 6],
        [64, 6],
        [65, 7],
        [128, 7]
    ])
        assert.equal(engine.swissRounds(n), r);
    for (const n of [2, 3, 4, 5, 7, 8, 9, 17, 33, 65, 127, 128]) {
        const standings = Array.from({ length: n }, (_, i) => ({
            id: pid(i + 1),
            points: 0,
            checked_in: true,
            dropped: false
        }));
        let matches = [];
        for (let r = 0; r < engine.swissRounds(n); r++) {
            const seed = 'event-' + n + '-' + r;
            const pairs = engine.buildPairings(standings, matches, seed);
            assert.deepEqual(pairs, engine.buildPairings(standings, matches, seed));
            assert.equal(new Set(pairs.flatMap((p) => (p.p2 ? [p.p1, p.p2] : [p.p1]))).size, n);
            for (const pair of pairs) {
                if (pair.p2)
                    assert.ok(
                        !matches.some(
                            (m) => [m.p1, m.p2].includes(pair.p1) && [m.p1, m.p2].includes(pair.p2)
                        )
                    );
                else assert.ok(!matches.some((m) => m.p1 === pair.p1 && !m.p2));
                standings.find((p) => p.id === pair.p1).points += 3;
            }
            matches.push(...pairs);
        }
    }
});
