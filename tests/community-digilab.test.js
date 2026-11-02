const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const migration = (name) => readFileSync('database/migrations/' + name + '.sql', 'utf8');
test('community DigiLab import without a store is atomic, idempotent and rejects divergences', async () => {
    const db = new PGlite();
    try {
        await db.exec(`create role anon;create role authenticated;create role service_role;
   create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
   create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function public.site_has_identity() returns boolean language sql as $$select true$$;
   create table public.admin_users(user_id uuid primary key);create table public.user_profiles(user_id uuid primary key,player_id uuid);`);
        await db.exec(
            `create function public.site_is_admin() returns boolean language sql stable as $$select exists(select 1 from public.admin_users where user_id=auth.uid())$$;`
        );
        await db.exec(readFileSync('database/schema.sql', 'utf8'));
        await db.exec(`create table formats(id bigint generated always as identity primary key,code text unique,name text,is_active boolean default true,is_default boolean default false);
   alter table tournament add column format_id bigint references formats(id),add column rounds smallint;
   alter table tournament_results add column match_points integer;
   create table tournament_ocr_files(tournament_id bigint,batch_id uuid,storage_path text,original_name text,mime_type text,size_bytes bigint);`);
        await db.exec(migration('20260725200000_transactional_tournament_save'));
        await db.exec(migration('20260731000000_create_tournament_digilab_sync'));
        const playerMigration = migration('20260731020000_create_digilab_player_sync_and_import');
        await db.exec(
            playerMigration.slice(0, playerMigration.indexOf('create or replace function')) +
                '\ncommit;'
        );
        await db.exec(migration('20260731040000_add_digilab_deck_sync'));
        await db.exec(
            migration('20260924010000_reliable_digilab_sync').split(
                'create table if not exists public.digilab_sync_state'
            )[0]
        );
        // The full 2v2 migration supplies the current save/import functions and podium view.
        await db.exec(migration('20261010000000_local_2v2_tournaments'));
        await db.exec(migration('20261101010000_community_tournaments'));
        await db.exec(migration('20261101020000_community_history'));
        await db.exec(migration('20261101030000_community_digilab_reconciliation'));
        const admin = '10000000-0000-0000-0000-000000000001';
        await db.query('insert into auth.users values($1)', [admin]);
        await db.query('insert into admin_users values($1)', [admin]);
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
        const format = (
            await db.query("insert into formats(code,name) values('EX13','EX13') returning id")
        ).rows[0].id;
        const event = (
            await db.query(
                `insert into community_events(name,modality,starts_at,event_type,format_id,capacity,status,created_by,initial_players,rounds,digilab_id)
   values('CWB Online','online','2026-11-01T22:00:00-03:00','Semanal',$1,128,'finished',$2,4,3,112233) returning id`,
                [format, admin]
            )
        ).rows[0].id;
        const entries = [];
        const standings = [];
        for (let i = 1; i <= 4; i++) {
            const player = (
                await db.query(
                    'insert into players(name,bandai_id,digilab_name) values($1,$2,$1) returning id',
                    ['Player ' + i, String(i).padStart(10, '0')]
                )
            ).rows[0].id;
            const entry = (
                await db.query(
                    'insert into community_entries(event_id,player_id,checked_in) values($1,$2,true) returning id',
                    [event, player]
                )
            ).rows[0].id;
            entries.push(entry);
            standings.push({
                placement: i,
                player: { name: 'Player ' + i, slug: 'player-' + i },
                record: { wins: 0, ties: 0 }
            });
        }
        await db.query(
            'update community_events set final_order=$2::jsonb,final_snapshot=community_standings(id) where id=$1',
            [event, JSON.stringify(entries)]
        );
        const details = {
            date: '2026-11-01',
            format: 'EX13',
            player_count: 4,
            rounds: 3,
            store: { name: 'Digimon CWB' },
            scene: { slug: 'online' }
        };
        const reconcile = async (d = details, rows = standings) =>
            (
                await db.query('select community_reconcile(112233,$1::jsonb,$2::jsonb) value', [
                    JSON.stringify(d),
                    JSON.stringify(rows)
                ])
            ).rows[0].value;
        let result = await reconcile();
        assert.equal(result.ok, true, JSON.stringify(result));
        const id = result.tournament_id;
        result = await reconcile();
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(result.tournament_id, id);
        assert.equal((await db.query('select count(*)::integer n from tournament')).rows[0].n, 1);
        assert.equal(
            (await db.query('select count(*)::integer n from tournament_results')).rows[0].n,
            4
        );
        assert.equal(
            (await db.query('select store_id,organizer_name from tournament where id=$1', [id]))
                .rows[0].organizer_name,
            'Digimon CWB'
        );
        assert.equal(
            (
                await db.query(
                    'select count(*)::integer n from v_podium_full where tournament_id=$1',
                    [id]
                )
            ).rows[0].n,
            4
        );
        const before = await db.query('select id,placement from tournament_results order by id');
        const divergent = standings.map((s, i) =>
            i === 0 ? { ...s, record: { wins: 1, ties: 0 } } : s
        );
        result = await reconcile(details, divergent);
        assert.equal(result.needs_review, true);
        assert.match(result.error, /Pontos divergentes/);
        assert.deepEqual(
            (await db.query('select id,placement from tournament_results order by id')).rows,
            before.rows
        );
        result = await reconcile({ ...details, date: '2026-11-02' });
        assert.equal(result.needs_review, true);
        assert.match(result.error, /Data/);
        for (const name of [
            '20261101010000_community_tournaments',
            '20261101020000_community_history',
            '20261101030000_community_digilab_reconciliation'
        ])
            await db.exec(migration(name));
        assert.equal(
            (await db.query('select count(*)::integer n from community_entries')).rows[0].n,
            4,
            'schema reapplication preserves the operation'
        );
        assert.equal(
            (await db.query('select count(*)::integer n from tournament_results')).rows[0].n,
            4
        );
        await db.exec('set role anon');
        await assert.rejects(
            () => db.query('select community_pending_links()'),
            /permission denied/
        );
    } finally {
        await db.close();
    }
});
