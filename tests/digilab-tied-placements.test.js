const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
let db;
const read = (name) => readFileSync(`database/migrations/${name}.sql`, 'utf8');
before(async () => {
    db = new PGlite();
    await db.exec(`set timezone = 'UTC'; create role anon; create role authenticated; create role service_role;
        create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;`);
    await db.exec(readFileSync('database/schema.sql', 'utf8'));
    await db.exec(`create table formats(id bigint generated always as identity primary key, code text unique, name text,
        is_active boolean default true, is_default boolean default false);
        alter table tournament add column format_id bigint references formats(id), add column rounds smallint;
        alter table tournament_results add column match_points integer;
        create table tournament_ocr_files(tournament_id bigint, batch_id uuid, storage_path text, original_name text, mime_type text, size_bytes bigint);
        insert into stores(name) values ('Test Store');`);
    await db.exec(read('20260725200000_transactional_tournament_save'));
    await db.exec(read('20260731000000_create_tournament_digilab_sync'));
    const playerMigration = read('20260731020000_create_digilab_player_sync_and_import');
    await db.exec(
        playerMigration.slice(0, playerMigration.indexOf('create or replace function')) +
            '\ncommit;'
    );
    await db.exec(read('20260731040000_add_digilab_deck_sync'));
    const queue = read('20260803010000_background_digilab_import');
    await db.exec(
        queue.slice(queue.indexOf('create table'), queue.indexOf('select cron.unschedule'))
    );
    await db.exec(read('20260924010000_reliable_digilab_sync'));
    await db.exec(read('20261005040000_require_digilab_tournament_format'));
    await db.exec(`alter table tournament add column if not exists organizer_name text;
        alter table tournament add column if not exists instagram_link text;
        alter table tournament_results add column if not exists team_member smallint;
        create table if not exists deck_images(id bigserial primary key, deck_id uuid, image_url text, created_at timestamptz default now());
        create table community_events(id uuid primary key default gen_random_uuid(), digilab_id bigint,
            status text, store_id uuid, organizer text, initial_players integer, starts_at timestamptz,
            format_id bigint, rounds integer, final_order jsonb, canonical_tournament_id bigint,
            reconciliation text, reconcile_error text, revision integer default 0, event_type text,
            last_reconcile_at timestamptz);
        create table community_entries(id uuid primary key default gen_random_uuid(), event_id uuid, player_id uuid);
        create table community_audit(id bigserial primary key, event_id uuid, action text, details jsonb);`);
    await db.exec(read('20261119000000_digilab_tied_placements'));
});
after(async () => {
    if (db) await db.close();
});
const standing = (name, placement, wins = 1, ties = 0) => ({
    player: { name, slug: name.toLowerCase().replace(/\s+/g, '-') },
    deck: { name: 'Jesmon', slug: 'jesmon' },
    placement,
    record: { wins, ties }
});
async function sync(id, rows, date) {
    return (
        await db.query('select sync_digilab_tournament_atomic($1,$2,$3) as result', [
            id,
            {
                player_count: rows.length,
                store: { name: 'Test Store' },
                date,
                format: 'EX13',
                tournament_name: 'Semanal'
            },
            rows
        ])
    ).rows[0].result;
}
const places = async (tournamentId) =>
    (
        await db.query(
            `select p.name, r.placement, r.reported_placement, r.match_points
             from tournament_results r join players p on p.id = r.player_id
             where r.tournament_id = $1 order by r.placement`,
            [tournamentId]
        )
    ).rows;

test('DigiLab ties at any position import with unique places in listing order', async () => {
    const saved = await sync(
        12230,
        [
            standing('Lukas Fujisawa', 1, 2, 1),
            standing('Alex Freire', 1, 2, 1),
            standing('Matheus Donizete', 3, 1, 1),
            standing('Nai', 3, 1, 1),
            standing('Vinicius Castagnoli', 5, 1, 0)
        ],
        '2026-11-19'
    );
    assert.deepEqual(await places(saved.tournament_id), [
        { name: 'Lukas Fujisawa', placement: 1, reported_placement: null, match_points: 7 },
        { name: 'Alex Freire', placement: 2, reported_placement: 1, match_points: 7 },
        { name: 'Matheus Donizete', placement: 3, reported_placement: null, match_points: 4 },
        { name: 'Nai', placement: 4, reported_placement: 3, match_points: 4 },
        { name: 'Vinicius Castagnoli', placement: 5, reported_placement: null, match_points: 3 }
    ]);
    // A later DigiLab tiebreak updates the linked tournament and clears the shared place.
    await sync(
        12230,
        [
            standing('Alex Freire', 1, 2, 1),
            standing('Lukas Fujisawa', 2, 2, 1),
            standing('Matheus Donizete', 3, 1, 1),
            standing('Nai', 4, 1, 1),
            standing('Vinicius Castagnoli', 5, 1, 0)
        ],
        '2026-11-19'
    );
    const resolved = await places(saved.tournament_id);
    assert.deepEqual(
        resolved.map((row) => [row.name, row.placement, row.reported_placement]),
        [
            ['Alex Freire', 1, null],
            ['Lukas Fujisawa', 2, null],
            ['Matheus Donizete', 3, null],
            ['Nai', 4, null],
            ['Vinicius Castagnoli', 5, null]
        ]
    );
});

test('gaps or misplaced shared places still require review', async () => {
    for (const rows of [
        [standing('Gap A', 1), standing('Gap B', 2), standing('Gap C', 4)],
        [standing('Dense A', 1), standing('Dense B', 1), standing('Dense C', 2)]
    ])
        await assert.rejects(sync(50000, rows, '2026-11-20'), /Colocacoes incompletas/);
});

test('editing a place by hand clears the DigiLab shared place', async () => {
    const id = (
        await db.query(
            "select r.id from tournament_results r join players p on p.id=r.player_id where p.name='Alex Freire'"
        )
    ).rows[0].id;
    await db.query('update tournament_results set reported_placement = 1 where id = $1', [id]);
    await db.query('update tournament_results set placement = 9 where id = $1', [id]);
    assert.equal(
        (await db.query('select reported_placement from tournament_results where id=$1', [id]))
            .rows[0].reported_placement,
        null
    );
});

test('community reconciliation accepts DigiLab ties and keeps the local tiebreak order', async () => {
    const ids = Object.fromEntries(
        (
            await db.query(
                "select name, id from players where name in ('Lukas Fujisawa','Alex Freire')"
            )
        ).rows.map((row) => [row.name, row.id])
    );
    const store = (await db.query("select id from stores where name='Test Store'")).rows[0].id;
    const format = (await db.query("select id from formats where code='EX13'")).rows[0].id;
    const event = (
        await db.query(
            `insert into community_events(digilab_id,status,store_id,initial_players,starts_at,format_id,event_type)
             values(777,'finished',$1,2,'2026-11-21 18:00:00+00',$2,'Semanal') returning id`,
            [store, format]
        )
    ).rows[0].id;
    const entries = [];
    for (const name of ['Alex Freire', 'Lukas Fujisawa'])
        entries.push(
            (
                await db.query(
                    'insert into community_entries(event_id,player_id) values($1,$2) returning id',
                    [event, ids[name]]
                )
            ).rows[0].id
        );
    await db.query('update community_events set final_order=$1 where id=$2', [
        JSON.stringify(entries),
        event
    ]);
    await db.exec(`create or replace function public.community_standings(p_event uuid) returns jsonb
        language sql as $$ select jsonb_agg(jsonb_build_object('id', id, 'points', 7)) from community_entries where event_id = p_event $$;`);
    const result = (
        await db.query('select community_reconcile($1,$2,$3) as result', [
            777,
            {
                player_count: 2,
                store: { name: 'Test Store' },
                date: '2026-11-21',
                format: 'EX13'
            },
            JSON.stringify([standing('Lukas Fujisawa', 1, 2, 1), standing('Alex Freire', 1, 2, 1)])
        ])
    ).rows[0].result;
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(
        (await places(result.tournament_id)).map((row) => [
            row.name,
            row.placement,
            row.reported_placement
        ]),
        [
            ['Alex Freire', 1, null],
            ['Lukas Fujisawa', 2, 1]
        ]
    );
});
