const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const indexes = readFileSync('database/migrations/20261118020000_foreign_key_indexes.sql', 'utf8');
const retention = readFileSync(
    'database/migrations/20261118030000_operational_history_retention.sql',
    'utf8'
);

test('foreign key index migration creates the audited indexes and can be repeated', async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            create table public.tournament_results(id bigserial primary key, tournament_id bigint, player_id uuid);
            create table public.deck_images(id bigserial primary key, deck_id uuid, created_at timestamptz);
            create table public.tournament(id bigint primary key, store_id uuid);
            create table public.decklists(id bigserial primary key, archetype_id uuid, creator_player_id uuid);
            create table public.community_entries(id uuid primary key, player_id uuid, deck_id uuid);
            create table public.community_events(id uuid primary key, store_id uuid);
            create table public.digilab_player_sync(id bigserial primary key, player_id uuid);
            create table public.digilab_deck_sync(id bigserial primary key, deck_id uuid);
            create table public.digilab_background_imports(id bigserial primary key, tournament_id bigint, claim_run_id uuid);
            create table public.account_requests(id uuid primary key, player_id uuid, decklist_id bigint);`);
        await db.exec(indexes);
        await db.exec(indexes);
        const names = (
            await db.query("select indexname from pg_indexes where schemaname='public'")
        ).rows.map((row) => row.indexname);
        for (const name of [
            'tournament_results_tournament_idx',
            'tournament_results_player_idx',
            'deck_images_deck_latest_idx',
            'digilab_background_imports_claim_run_idx',
            'account_requests_decklist_idx'
        ])
            assert.ok(names.includes(name), name);
    } finally {
        await db.close();
    }
});

test('operational history retention keeps recent, running and referenced runs', async () => {
    const db = new PGlite();
    try {
        await db.exec(`create role anon; create role authenticated; create role service_role;
            create function public.site_is_maintenance() returns boolean language sql stable as
                $$select coalesce(current_setting('test.maintenance', true), '') = 'yes'$$;
            create table public.digilab_sync_runs(id uuid primary key, started_at timestamptz not null,
                finished_at timestamptz, status text not null);
            create table public.digilab_sync_events(id bigserial primary key,
                run_id uuid not null references public.digilab_sync_runs(id) on delete cascade);
            create table public.digilab_sync_state(id int primary key, run_id uuid references public.digilab_sync_runs(id));
            create table public.digilab_background_imports(id bigserial primary key,
                claim_run_id uuid references public.digilab_sync_runs(id));
            create table public.digilab_catalog_sync_runs(id uuid primary key default gen_random_uuid(),
                started_at timestamptz not null, finished_at timestamptz, status text not null);
            create schema cron;
            create table cron.job_run_details(runid bigserial primary key, end_time timestamptz);
            insert into public.digilab_sync_runs values
                ('00000000-0000-0000-0000-000000000001', now()-interval '120 days', now()-interval '120 days', 'completed'),
                ('00000000-0000-0000-0000-000000000002', now()-interval '10 days', now()-interval '10 days', 'completed'),
                ('00000000-0000-0000-0000-000000000003', now()-interval '120 days', null, 'running'),
                ('00000000-0000-0000-0000-000000000004', now()-interval '120 days', now()-interval '120 days', 'failed'),
                ('00000000-0000-0000-0000-000000000005', now()-interval '120 days', now()-interval '120 days', 'completed');
            insert into public.digilab_sync_events(run_id) values
                ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
            insert into public.digilab_sync_state values (1, '00000000-0000-0000-0000-000000000004');
            insert into public.digilab_background_imports(claim_run_id) values ('00000000-0000-0000-0000-000000000005');
            insert into public.digilab_catalog_sync_runs(started_at, finished_at, status) values
                (now()-interval '100 days', now()-interval '100 days', 'completed'),
                (now()-interval '5 days', now()-interval '5 days', 'completed');
            insert into cron.job_run_details(end_time) values (now()-interval '40 days'), (now()-interval '2 days');`);
        await db.exec(retention);
        await assert.rejects(
            db.query('select public.purge_operational_history()'),
            /restrita à rotina de manutenção/
        );
        await db.exec(`set test.maintenance = 'yes'`);
        const result = (await db.query('select public.purge_operational_history() value')).rows[0]
            .value;
        assert.deepEqual(result, {
            digilab_sync_runs: 1,
            digilab_catalog_sync_runs: 1,
            cron_job_run_details: 1
        });
        const remaining = (
            await db.query('select id from public.digilab_sync_runs order by id')
        ).rows.map((row) => row.id.slice(-1));
        assert.deepEqual(remaining, ['2', '3', '4', '5']);
        assert.equal(
            (await db.query('select count(*)::int n from public.digilab_sync_events')).rows[0].n,
            1
        );
        const privilege = (
            await db.query(
                "select has_function_privilege('anon', 'public.purge_operational_history()', 'execute') ok"
            )
        ).rows[0].ok;
        assert.equal(privilege, false);
    } finally {
        await db.close();
    }
});

test('anonymous write access is removed while signed-in policies and reads remain', async () => {
    const migration = readFileSync(
        'database/migrations/20261118040000_remove_anonymous_writes.sql',
        'utf8'
    );
    const db = new PGlite();
    try {
        await db.exec(`create role anon; create role authenticated;
            create table public.tournament(id bigserial primary key, name text);
            create table public.decklists(id bigserial primary key, tournament_result_id bigint);
            alter table public.tournament enable row level security;
            alter table public.decklists enable row level security;
            create view public.v_tournament as select * from public.tournament;
            grant all on public.tournament, public.decklists, public.v_tournament to anon, authenticated;
            grant all on all sequences in schema public to anon, authenticated;
            create policy "Allow anonymous select" on public.tournament for select using (true);
            create policy "Allow anonymous insert" on public.tournament for insert
                with check (current_user = any (array['anon', 'authenticated']));
            create policy "Allow anonymous delete" on public.tournament for delete to anon using (true);
            create policy "Public create free decks" on public.decklists for insert to authenticated, anon
                with check (tournament_result_id is null);
            create policy "site_insert" on public.tournament as restrictive for insert to authenticated, anon
                with check (true);`);
        await db.exec(migration);
        await db.exec(migration);
        const policies = Object.fromEntries(
            (
                await db.query(
                    "select policyname, roles::text from pg_policies where schemaname='public'"
                )
            ).rows.map((row) => [row.policyname, row.roles])
        );
        assert.equal(policies['Allow anonymous delete'], undefined);
        assert.equal(policies['Allow anonymous insert'], '{authenticated}');
        assert.equal(policies['Public create free decks'], '{authenticated}');
        assert.equal(policies['Allow anonymous select'], '{public}');
        assert.deepEqual(policies.site_insert.slice(1, -1).split(',').sort(), [
            'anon',
            'authenticated'
        ]);
        const can = async (role, object, privilege) =>
            (await db.query('select has_table_privilege($1, $2, $3) ok', [role, object, privilege]))
                .rows[0].ok;
        for (const object of ['public.tournament', 'public.decklists', 'public.v_tournament']) {
            for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'])
                assert.equal(await can('anon', object, privilege), false, `${object} ${privilege}`);
            assert.equal(await can('anon', object, 'SELECT'), true, object);
            assert.equal(await can('authenticated', object, 'INSERT'), true, object);
        }
        await db.exec('set role anon');
        await assert.rejects(
            db.query("insert into public.tournament(name) values ('x')"),
            /permission denied/
        );
        assert.deepEqual((await db.query('select * from public.tournament')).rows, []);
    } finally {
        await db.close();
    }
});
