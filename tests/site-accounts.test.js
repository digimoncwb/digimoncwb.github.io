const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const ids = {
    admin: '10000000-0000-0000-0000-000000000001',
    a: '10000000-0000-0000-0000-000000000002',
    b: '10000000-0000-0000-0000-000000000003',
    pending: '10000000-0000-0000-0000-000000000004',
    legacy: '10000000-0000-0000-0000-000000000005',
    player: '20000000-0000-0000-0000-000000000001',
    archetype: '30000000-0000-0000-0000-000000000001',
    result: '40000000-0000-0000-0000-000000000001'
};
async function setup(extraMigrations = []) {
    const db = new PGlite();
    await db.exec(`
        set time zone 'UTC'; create role anon; create role authenticated; create role service_role;
        create schema auth;
        create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        grant usage on schema auth to anon,authenticated,service_role;
        create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',encrypted_password text);
        create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),provider text not null);
        insert into auth.users(id,email,email_confirmed_at) values
            ('${ids.admin}','admin@example.test',now()),('${ids.a}','a@example.test',now()),('${ids.b}','b@example.test',now()),
            ('${ids.pending}','pending@example.test',null),('${ids.legacy}','old@admin.digistats.local',now());
        create table public.admin_users(user_id uuid primary key references auth.users,username text unique,display_name text,created_at timestamptz default now(),created_by uuid);
        insert into public.admin_users values('${ids.admin}','administrator','Admin',now(),null),('${ids.legacy}','old_admin','Legacy admin',now(),null);
        alter table public.admin_users enable row level security;
        create policy own_admin on public.admin_users for select to authenticated using(user_id=auth.uid());
        grant select on public.admin_users to authenticated;
        create table public.players(id uuid primary key,name text,is_active boolean default true,bandai_id text,bandai_nick text,digilab_name text);
        create table public.decks(id uuid primary key,name text,is_active boolean default true);
        create table public.deck_formats(id bigint primary key,code text,name text,rules_revision integer default 1);
        create table public.tournament(id bigint primary key,deck_format_id bigint,store_id uuid,tournament_date date);
        create table public.tournament_results(id uuid primary key,tournament_id bigint,store_id uuid,tournament_date date,deck_id uuid);
        create table public.decklists(id bigserial primary key,name text,deck_format_id bigint,tournament_result_id uuid unique,
            source text default 'builder',draft_cards jsonb,draft_revision integer not null default 0,format_rules_revision integer,
            archetype_id uuid references public.decks,creator_player_id uuid references public.players,updated_at timestamptz default now());
        create table public.decklist_cards(id bigserial primary key,decklist_id bigint references public.decklists on delete cascade,position int,card_code text,qty integer);
        create table public.cards_cache(id bigint primary key,card_code text);
        create table public.digilab_sync_events(id bigint primary key,status text);
        create table public.tournament_weekly_schedule(weekday smallint,store_id uuid,is_active boolean default true,updated_at timestamptz default now(),primary key(weekday,store_id));
        create schema storage;
        create table storage.objects(id uuid primary key,bucket_id text,name text,owner_id text);
        grant usage on schema storage to anon,authenticated;
        grant select,insert,update,delete on storage.objects to anon,authenticated;
        alter table storage.objects enable row level security;
        create policy old_storage_access on storage.objects for all to anon,authenticated using(true) with check(true);
        insert into storage.objects values('60000000-0000-0000-0000-000000000001','images','existing.webp',null);
        insert into public.digilab_sync_events values(1,'private');
        create function public.valid_deck_draft_cards(value jsonb) returns boolean language sql as $$ select jsonb_typeof(value)='array' $$;
        insert into public.players(id,name) values('${ids.player}','Registered player');
        insert into public.decks(id,name) values('${ids.archetype}','Registered type');
        insert into public.deck_formats(id,code,name) values(1,'STANDARD','Padrão');
        insert into public.tournament(id,deck_format_id) values(1,1);
        insert into public.tournament_results(id,tournament_id,deck_id) values('${ids.result}',1,'${ids.archetype}');
        insert into public.decklists(name,deck_format_id,archetype_id,draft_cards) values('LEGACY',1,'${ids.archetype}','[{"code":"BT1-001","qty":4}]');
        insert into public.decklists(name,deck_format_id,archetype_id,tournament_result_id,draft_cards) values('TOURNAMENT',1,'${ids.archetype}','${ids.result}','[]');
        insert into public.decklist_cards(decklist_id,position,card_code,qty) values(1,1,'BT1-001',4);
        create function public.legacy_delete_player() returns void language plpgsql security definer as $$ begin delete from public.players; end $$;
        grant usage,select on all sequences in schema public to anon,authenticated;
        do $$ declare t text; begin foreach t in array array['players','decks','deck_formats','tournament','tournament_results','decklists','decklist_cards','cards_cache','digilab_sync_events'] loop
            execute format('alter table public.%I enable row level security',t);
            execute format('create policy old_public_access on public.%I for all to anon using(true) with check(true)',t);
            execute format('grant select,insert,update,delete on public.%I to anon',t);
        end loop; end $$;
    `);
    for (const file of [
        '20261025010000_site_accounts_and_audit.sql',
        '20261025020000_account_management_operations.sql',
        '20261025030000_account_deck_saves.sql',
        '20261025040000_account_storage_and_integration_access.sql',
        '20261025050000_site_audit_retention_schedule.sql',
        ...extraMigrations
    ]) {
        try {
            await db.exec(readFileSync(`database/migrations/${file}`, 'utf8'));
        } catch (error) {
            await db.close();
            throw new Error(`${file}: ${error.message}`);
        }
    }
    return db;
}
async function as(db, who) {
    await db.exec(
        `reset role; set role ${who ? 'authenticated' : 'anon'}; set request.jwt.claim.role='${who ? 'authenticated' : 'anon'}'; set request.jwt.claim.sub='${who ? ids[who] : ''}'`
    );
}
async function sqlOwner(db) {
    await db.exec("reset role; set request.jwt.claim.role=''; set request.jwt.claim.sub=''");
}
async function prepare(db) {
    await as(db, 'admin');
    await db.query(
        "select admin_configure_site_accounts(false,'https://example.test/privacy','v1',180,'Test environment retention justification')"
    );
    for (const who of ['admin', 'a', 'b']) {
        await as(db, who);
        await db.query(`select save_my_site_profile('user_${who}','User ${who}','v1')`);
    }
    await as(db, 'admin');
    await db.query(
        "select admin_configure_site_accounts(true,'https://example.test/privacy','v1',180,'Test environment retention justification')"
    );
}

test('Verified player links reconcile historical decks and future approvals without replacing owners', async () => {
    const db = await setup();
    const migration = readFileSync(
        'database/migrations/20261025150000_reconcile_linked_player_deck_ownership.sql',
        'utf8'
    );
    try {
        await prepare(db);
        await sqlOwner(db);
        await db.query('update user_profiles set player_id=$1 where user_id=$2', [
            ids.player,
            ids.a
        ]);
        await db.query('update decklists set creator_player_id=$1', [ids.player]);
        await db.query(
            "insert into decklists(name,creator_player_id,owner_user_id) values('EXPLICIT OWNER',$1,$2)",
            [ids.player, ids.b]
        );
        await db.exec(migration);
        assert.equal(
            (await db.query('select owner_user_id from decklists where id=1')).rows[0]
                .owner_user_id,
            ids.a
        );
        assert.equal(
            (await db.query('select owner_user_id from decklists where id=2')).rows[0]
                .owner_user_id,
            null
        );
        assert.equal(
            (await db.query("select owner_user_id from decklists where name='EXPLICIT OWNER'"))
                .rows[0].owner_user_id,
            ids.b
        );
        assert.equal(
            (await db.query('select reconcile_linked_player_deck_ownership() count')).rows[0].count,
            0
        );
        const otherPlayer = '20000000-0000-0000-0000-000000000002';
        await db.query("insert into players(id,name) values($1,'Other player')", [otherPlayer]);
        await db.query("insert into decklists(name,creator_player_id) values('AWAITING LINK',$1)", [
            otherPlayer
        ]);
        await as(db, 'b');
        const request = (
            await db.query("select submit_account_request('player_link',$1) id", [otherPlayer])
        ).rows[0].id;
        await assert.rejects(
            db.query('select reconcile_linked_player_deck_ownership()'),
            /permission denied/
        );
        await as(db, 'admin');
        await db.query("select admin_review_account_request($1,'approved')", [request]);
        assert.equal(
            (await db.query("select owner_user_id from decklists where name='AWAITING LINK'"))
                .rows[0].owner_user_id,
            ids.b
        );
        await sqlOwner(db);
        await db.query("insert into decklists(name,creator_player_id) values('LATER IMPORT',$1)", [
            otherPlayer
        ]);
        assert.equal(
            (await db.query("select owner_user_id from decklists where name='LATER IMPORT'"))
                .rows[0].owner_user_id,
            ids.b
        );
        await db.query("update user_profiles set status='blocked' where user_id=$1", [ids.b]);
        await db.query(
            "insert into decklists(name,creator_player_id) values('BLOCKED AUTHOR',$1)",
            [otherPlayer]
        );
        assert.equal(
            (await db.query("select owner_user_id from decklists where name='BLOCKED AUTHOR'"))
                .rows[0].owner_user_id,
            null
        );
    } finally {
        await db.close();
    }
});

test('Deck assignment is immediate, cannot steal decks, and admin APIs omit private email', async () => {
    const db = await setup([
        '20261025110000_email_admin_accounts_and_player_claims.sql',
        '20261025150000_reconcile_linked_player_deck_ownership.sql',
        '20261025160000_direct_deck_claims_and_private_account_email.sql'
    ]);
    try {
        await prepare(db);
        await as(db, 'pending');
        await assert.rejects(
            db.query("select submit_account_request('deck_claim',null,1)"),
            /confirme/
        );
        await as(db, 'a');
        const request = (await db.query("select submit_account_request('deck_claim',null,1) id"))
            .rows[0].id;
        assert.equal(
            (await db.query('select owner_user_id from decklists where id=1')).rows[0]
                .owner_user_id,
            ids.a
        );
        assert.equal(
            (await db.query('select status from account_requests where id=$1', [request])).rows[0]
                .status,
            'approved'
        );
        await as(db, 'b');
        await assert.rejects(
            db.query("select submit_account_request('deck_claim',null,1)"),
            /proprietário/
        );
        await assert.rejects(
            db.query("select submit_account_request('deck_claim',null,2)"),
            /disponível/
        );
        assert.equal(
            (
                await db.query('update decklists set owner_user_id=$1 where id=1 returning id', [
                    ids.b
                ])
            ).rows.length,
            0
        );
        await as(db, 'admin');
        const accounts = (await db.query("select admin_list_site_accounts('user_a') rows")).rows[0]
            .rows;
        assert.ok(accounts.some((row) => row.user_id === ids.a));
        assert.ok(accounts.every((row) => !Object.hasOwn(row, 'email')));
        assert.equal(
            (await db.query("select admin_list_site_accounts('a@example.test') rows")).rows[0].rows
                .length,
            0
        );
        const requests = (await db.query('select admin_account_requests() rows')).rows[0].rows;
        assert.ok(requests.every((row) => !Object.hasOwn(row, 'email')));
    } finally {
        await db.close();
    }
});

test('Basic profile editing does not require published legal documents or grant consent', async () => {
    const db = await setup(['20261025140000_update_basic_site_profile.sql']);
    try {
        await as(db, 'a');
        const saved = (
            await db.query("select update_my_site_profile(' New_Name ',' Novo nome ') profile")
        ).rows[0].profile;
        assert.equal(saved.username, 'new_name');
        assert.equal(saved.display_name, 'Novo nome');
        assert.equal(saved.privacy_version, null);
        await as(db, 'b');
        await assert.rejects(
            db.query("select update_my_site_profile('new_name','Duplicate')"),
            /unique/
        );
        await as(db, 'a');
        assert.equal(
            (await db.query('select my_site_account() value')).rows[0].value.profile.username,
            'new_name'
        );
        await assert.rejects(db.query("select update_my_site_profile('bad name','Bad')"), /3 a 40/);
        await as(db, 'pending');
        await assert.rejects(
            db.query("select update_my_site_profile('pending','Pending')"),
            /Confirme/
        );
        await as(db);
        await assert.rejects(
            db.query("select update_my_site_profile('anonymous','Anonymous')"),
            /permission denied/
        );
        await sqlOwner(db);
        await db.query('update user_profiles set status=$1 where user_id=$2', ['blocked', ids.a]);
        await as(db, 'a');
        await assert.rejects(
            db.query("select update_my_site_profile('blocked','Blocked')"),
            /Confirme/
        );
    } finally {
        await db.close();
    }
});

test('Email admin management keeps private email search restricted and validates grants and player claims', async () => {
    const db = await setup(['20261025110000_email_admin_accounts_and_player_claims.sql']);
    try {
        await as(db, 'a');
        await assert.rejects(
            db.query("select admin_list_site_accounts('admin@example.test')"),
            /administrativo/
        );
        await as(db, 'admin');
        const rows = (
            await db.query("select admin_list_site_accounts('a@example.test') as accounts")
        ).rows[0].accounts;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].email, 'a@example.test');
        assert.equal(rows[0].email_confirmed, true);
        await assert.rejects(
            db.query(`select admin_update_site_account('${ids.pending}',null,true)`),
            /confirmado/
        );
        await assert.rejects(
            db.query(`select admin_update_site_account('${ids.legacy}',null,true)`),
            /confirmado/
        );
        await assert.rejects(
            db.query(`select admin_update_site_account('${ids.a}','blocked',true)`),
            /confirmado/
        );
        await db.query(`select admin_update_site_account('${ids.a}',null,true)`);
        await db.query(`select admin_update_site_account('${ids.a}',null,false)`);
        await db.query(`select admin_update_site_account('${ids.legacy}',null,false)`);
        await assert.rejects(
            db.query(`select admin_update_site_account('${ids.admin}',null,false)`),
            /última/
        );
        await as(db, 'a');
        const id = (
            await db.query(`select submit_account_request('player_link','${ids.player}') as id`)
        ).rows[0].id;
        await as(db, 'admin');
        const requests = (await db.query('select admin_account_requests() as requests')).rows[0]
            .requests;
        assert.equal(requests[0].player_name, 'Registered player');
        assert.equal(requests[0].email, 'a@example.test');
        await db.query("select admin_review_account_request($1,'approved','Identity reviewed')", [
            id
        ]);
        assert.equal(
            (await db.query(`select player_id from user_profiles where user_id='${ids.a}'`)).rows[0]
                .player_id,
            ids.player
        );
        await as(db, 'b');
        const conflicting = (
            await db.query(`select submit_account_request('player_link','${ids.player}') as id`)
        ).rows[0].id;
        await as(db, 'admin');
        await assert.rejects(
            db.query("select admin_review_account_request($1,'approved','Reviewed')", [
                conflicting
            ]),
            /unique/
        );
    } finally {
        await db.close();
    }
});

test('Accounts migrate additively, enforce ownership against old public policies and audit confirmed changes', async () => {
    const db = await setup();
    try {
        await as(db);
        assert.equal((await db.query('select site_accounts_enabled() value')).rows[0].value, false);
        assert.equal((await db.query('select count(*)::int n from decklists')).rows[0].n, 2);
        await prepare(db);
        await as(db);
        await assert.rejects(
            db.query("insert into decklists(name,deck_format_id) values('PUBLIC',1)"),
            /Entre|row-level/
        );
        await as(db, 'a');
        const saved = (
            await db.query(
                `select save_deck_draft(null,null,'mixed Case',1,'[{"code":"BT1-002","qty":3}]',0,'${ids.archetype}',null) value`
            )
        ).rows[0].value;
        assert.equal(saved.owner_user_id, ids.a);
        const deck = (await db.query('select * from decklists where id=$1', [saved.id])).rows[0];
        assert.equal(deck.name, 'MIXED CASE');
        await assert.rejects(
            db.query('update decklists set owner_user_id=$1 where id=$2', [ids.b, saved.id]),
            /transferência/
        );
        await assert.rejects(
            db.query('update decklists set created_by_user_id=$1 where id=$2', [ids.b, saved.id]),
            /responsável original/
        );
        await assert.rejects(
            db.query(
                "insert into players(id,name) values('20000000-0000-0000-0000-000000000002','Forbidden')"
            ),
            /row-level|administrativo/
        );
        await assert.rejects(
            db.query(`select save_deck_draft(2,'${ids.result}','HACK',1,'[]',0)`),
            /administrativo/
        );
        await as(db, 'b');
        await assert.rejects(
            db.query(`select save_deck_draft(${saved.id},null,'HACK',1,'[]',1,'${ids.archetype}')`),
            /não encontrado/
        );
        await assert.rejects(
            db.query('select delete_community_deck($1,$2)', [saved.id, deck.updated_at]),
            /não pode/
        );
        await assert.rejects(
            db.query(
                'select delete_community_deck(1,(select updated_at from decklists where id=1))'
            ),
            /não pode/
        );
        const copy = (await db.query('select copy_community_deck($1) id', [saved.id])).rows[0].id;
        assert.equal(
            (await db.query('select owner_user_id from decklists where id=$1', [copy])).rows[0]
                .owner_user_id,
            ids.b
        );
        await as(db, 'a');
        await db.query('select delete_community_deck($1,$2)', [saved.id, deck.updated_at]);
        await assert.rejects(db.query('select * from site_audit.events'), /permission denied/);
        await as(db, 'admin');
        const events = (
            await db.query(
                "select admin_audit_events('decklists','',null,'',null,null,0,false) events"
            )
        ).rows[0].events;
        assert.ok(
            events.some(
                (event) => event.action === 'decklists.insert' && event.actor_user_id === ids.a
            )
        );
        assert.ok(
            events.some(
                (event) =>
                    event.action === 'decklists.delete' && event.entity_id === String(saved.id)
            )
        );
        assert.equal(
            events.some((event) => JSON.stringify(event.changes).includes('HACK')),
            false
        );
        assert.equal(
            (await db.query('select count(*)::int n from decklists where id in (1,2)')).rows[0].n,
            2
        );
    } finally {
        await db.close();
    }
});

test('Community deletion permits owners and admins of anonymous decks, including direct SQL and rollout disabled', async () => {
    const db = await setup(['20261025120000_community_deck_delete_permissions.sql']);
    try {
        await prepare(db);
        await as(db, 'a');
        const owned = (
            await db.query(
                `select save_deck_draft(null,null,'OWNED',1,'[]',0,'${ids.archetype}',null) value`
            )
        ).rows[0].value;
        const stamp = (await db.query('select updated_at from decklists where id=$1', [owned.id]))
            .rows[0].updated_at;
        await as(db, 'admin');
        await assert.rejects(
            db.query('select delete_community_deck($1,$2)', [owned.id, stamp]),
            /não pode/
        );
        assert.equal(
            (await db.query('delete from decklists where id=$1 returning id', [owned.id])).rows
                .length,
            0
        );
        // RLS can be bypassed by SECURITY DEFINER functions; the trigger must still reject it.
        await sqlOwner(db);
        await db.exec(`create function public.test_delete_community(bigint) returns void language sql security definer as $$ delete from public.decklists where id=$1 $$;
            grant execute on function public.test_delete_community(bigint) to authenticated;`);
        await as(db, 'admin');
        await assert.rejects(db.query('select test_delete_community($1)', [owned.id]), /próprios/);
        // Model the pre-rollout configuration directly; the public admin RPC rightly forbids reopening access.
        await sqlOwner(db);
        await db.exec(
            'update public.site_security_config set accounts_enabled=false where singleton'
        );
        await as(db, 'admin');
        await assert.rejects(
            db.query('select delete_community_deck($1,$2)', [owned.id, stamp]),
            /não pode/
        );
        await assert.rejects(db.query('select test_delete_community($1)', [owned.id]), /próprios/);
        await as(db, 'b');
        await assert.rejects(
            db.query('select delete_community_deck($1,$2)', [owned.id, stamp]),
            /não pode/
        );
        await assert.rejects(
            db.query(
                'select delete_community_deck(1,(select updated_at from decklists where id=1))'
            ),
            /não pode/
        );
        await as(db);
        assert.equal(
            (await db.query('delete from decklists where id=$1 returning id', [owned.id])).rows
                .length,
            0
        );
        await as(db, 'a');
        await assert.rejects(
            db.query('select delete_community_deck($1,null)', [owned.id]),
            /alterado/
        );
        await db.query('select delete_community_deck($1,$2)', [owned.id, stamp]);
        await as(db, 'admin');
        await db.query(
            'select delete_community_deck(1,(select updated_at from decklists where id=1))'
        );
        await assert.rejects(
            db.query(
                'select delete_community_deck(2,(select updated_at from decklists where id=2))'
            ),
            /não encontrado/
        );
    } finally {
        await db.close();
    }
});

test('Profile privacy, validated links, role changes and audit access cannot be self-assigned', async () => {
    const db = await setup();
    try {
        await prepare(db);
        await as(db, 'pending');
        await assert.rejects(
            db.query("select save_my_site_profile('pending_user','Pending','v1')"),
            /Confirme/
        );
        await as(db, 'a');
        await assert.rejects(
            db.query("update user_profiles set status='active'"),
            /permission denied/
        );
        await assert.rejects(
            db.query(`select admin_update_site_account('${ids.a}','active',true)`),
            /administrativo/
        );
        await assert.rejects(db.query('select admin_audit_events()'), /administrativo/);
        const requestA = (
            await db.query(`select submit_account_request('player_link','${ids.player}') id`)
        ).rows[0].id;
        await as(db, 'admin');
        await db.query("select admin_review_account_request($1,'approved','Validated')", [
            requestA
        ]);
        await as(db, 'b');
        const requestB = (
            await db.query(`select submit_account_request('player_link','${ids.player}') id`)
        ).rows[0].id;
        await as(db, 'admin');
        await assert.rejects(
            db.query("select admin_review_account_request($1,'approved','Validated')", [requestB]),
            /unique/
        );
        await assert.rejects(
            db.query(`select admin_update_site_account('${ids.admin}',null,false)`),
            /última/
        );
        await db.query(`select admin_update_site_account('${ids.a}','blocked',null)`);
        await as(db, 'a');
        assert.equal((await db.query('select site_is_member() value')).rows[0].value, false);
        await assert.rejects(
            db.query(`select save_deck_draft(null,null,'BLOCKED',1,'[]',0,'${ids.archetype}')`),
            /ativa/
        );
        await as(db, 'admin');
        await db.query(`select admin_update_site_account('${ids.a}','active',null)`);
        await db.query(
            "select admin_configure_site_accounts(true,'https://example.test/privacy','v2',180,'Changed privacy version for testing')"
        );
        await as(db, 'a');
        assert.equal((await db.query('select site_is_member() value')).rows[0].value, false);
        await db.query("select save_my_site_profile('user_a','User A','v2')");
        assert.equal((await db.query('select site_is_member() value')).rows[0].value, true);
        const exported = (await db.query('select my_site_data() value')).rows[0].value;
        assert.equal(exported.profile.player_id, ids.player);
        assert.equal(exported.email, 'a@example.test');
        assert.equal(JSON.stringify(exported).includes('encrypted_password'), false);
        await assert.rejects(db.query('select purge_site_audit()'), /permission denied/);
        await sqlOwner(db);
        assert.equal(
            (
                await db.query(
                    "select count(*)::int n from pg_policies where schemaname='site_audit'"
                )
            ).rows[0].n,
            0
        );
    } finally {
        await db.close();
    }
});

test('Storage, private integrations and trusted audit identity obey account enforcement', async () => {
    const db = await setup();
    try {
        await prepare(db);
        await as(db);
        assert.equal(
            (await db.query('select count(*)::int n from digilab_sync_events')).rows[0].n,
            0
        );
        await assert.rejects(
            db.query("insert into cards_cache values(1,'BT1-001')"),
            /row-level|administrativo/
        );
        await as(db, 'a');
        assert.equal(
            (await db.query('select count(*)::int n from digilab_sync_events')).rows[0].n,
            0
        );
        await db.query('delete from storage.objects');
        assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n, 1);
        await assert.rejects(
            db.query(
                "insert into storage.objects values(gen_random_uuid(),'images','forbidden.webp',null)"
            ),
            /row-level|administrativo/
        );
        await db.query(`select set_config('request.headers',$1,false)`, [
            JSON.stringify({ 'x-site-actor-id': ids.admin, 'x-site-operation-id': 'forged' })
        ]);
        await db.query("select save_deck_draft(null,null,'real actor',1,'[]',0,$1)", [
            ids.archetype
        ]);
        await as(db, 'admin');
        const events = (await db.query("select admin_audit_events('decklists') value")).rows[0]
            .value;
        assert.ok(
            events.some(
                (event) =>
                    event.actor_user_id === ids.a &&
                    event.action === 'decklists.insert' &&
                    event.operation_id !== 'forged'
            )
        );
        await db.query('delete from storage.objects');
        assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n, 0);
        assert.equal(
            (await db.query('select count(*)::int n from digilab_sync_events')).rows[0].n,
            1
        );
        await as(db, 'a');
        await assert.rejects(db.query('select legacy_delete_player()'), /administrativo/);
        await assert.rejects(
            db.query('select site_actor_authorized($1)', [ids.admin]),
            /permission denied/
        );
        await sqlOwner(db);
        await db.exec("set role service_role; set request.jwt.claim.role='service_role'");
        assert.equal(
            (await db.query('select site_actor_authorized($1) value', [ids.admin])).rows[0].value,
            true
        );
        assert.equal(
            (await db.query('select site_actor_authorized($1) value', [ids.a])).rows[0].value,
            false
        );
        await db.query(
            "select record_site_integration_event($1,'test-integration',gen_random_uuid(),403)",
            [ids.a]
        );
        await as(db, 'admin');
        const denied = (await db.query("select admin_audit_events('integration') value")).rows[0]
            .value;
        assert.equal(denied[0].outcome, 'denied');
        assert.equal(denied[0].actor_user_id, ids.a);
    } finally {
        await db.close();
    }
});

test('Legacy claims, transfer concurrency, safe bootstrap and transactional audit failure are enforced', async () => {
    const db = await setup();
    try {
        await prepare(db);
        await as(db, 'a');
        const claim = (
            await db.query("select submit_account_request('deck_claim',null,1,'Verified claim') id")
        ).rows[0].id;
        await as(db, 'admin');
        await db.query("select admin_review_account_request($1,'approved','Verified separately')", [
            claim
        ]);
        const owned = (await db.query('select owner_user_id,updated_at from decklists where id=1'))
            .rows[0];
        assert.equal(owned.owner_user_id, ids.a);
        await assert.rejects(
            db.query("select admin_review_account_request($1,'approved','Again')", [claim]),
            /analisada/
        );
        await db.query("select admin_transfer_community_deck(1,$1,$2,'Validated transfer')", [
            ids.b,
            owned.updated_at
        ]);
        await assert.rejects(
            db.query("select admin_transfer_community_deck(1,$1,$2,'Stale transfer')", [
                ids.a,
                owned.updated_at
            ]),
            /alterado/
        );
        await as(db, 'a');
        assert.equal(
            (await db.query('update decklist_cards set qty=99 where decklist_id=1 returning id'))
                .rows.length,
            0
        );
        await assert.rejects(
            db.query("insert into decklist_cards(decklist_id,card_code,qty) values(1,'BT1-009',9)"),
            /row-level/
        );
        await sqlOwner(db);
        const forged = '70000000-0000-0000-0000-000000000001';
        await db.query(
            "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'new@example.test',now(),$2)",
            [
                forged,
                JSON.stringify({
                    role: 'admin',
                    is_admin: true,
                    player_id: ids.player,
                    display_name: 'New member'
                })
            ]
        );
        assert.equal(
            (await db.query('select count(*)::int n from admin_users where user_id=$1', [forged]))
                .rows[0].n,
            0
        );
        assert.equal(
            (await db.query('select player_id from user_profiles where user_id=$1', [forged]))
                .rows[0].player_id,
            null
        );
        await db.exec(`create function site_audit.test_fail() returns trigger language plpgsql as $$ begin raise exception 'Audit unavailable'; end $$;
            create trigger test_fail before insert on site_audit.events for each row execute function site_audit.test_fail();`);
        await as(db, 'b');
        await assert.rejects(
            db.query("select save_deck_draft(null,null,'must rollback',1,'[]',0,$1)", [
                ids.archetype
            ]),
            /Audit unavailable/
        );
        assert.equal(
            (await db.query("select count(*)::int n from decklists where name='MUST ROLLBACK'"))
                .rows[0].n,
            0
        );
        await sqlOwner(db);
        await db.exec('drop trigger test_fail on site_audit.events');
        await db.query(
            "insert into site_audit.events(occurred_at,actor_kind,action,entity_type) values(now()-interval '181 days','maintenance','test.expired','test'),(now(),'maintenance','test.recent','test')"
        );
        await db.query('select purge_site_audit()');
        assert.equal(
            (
                await db.query(
                    "select count(*)::int n from site_audit.events where action='test.expired'"
                )
            ).rows[0].n,
            0
        );
        assert.equal(
            (
                await db.query(
                    "select count(*)::int n from site_audit.events where action='test.recent'"
                )
            ).rows[0].n,
            1
        );
    } finally {
        await db.close();
    }
});

async function prepareLegal(db) {
    await as(db, 'admin');
    for (const kind of ['terms', 'privacy'])
        await db.query('select admin_register_site_legal_document($1,$2,$3,$4)', [
            kind,
            'v1',
            `https://example.test/${kind}`,
            `Reviewed ${kind} document with enough text for testing.`
        ]);
    await db.query("select admin_configure_site_terms('https://example.test/terms','v1')");
    await db.query(
        "select admin_configure_site_accounts(false,'https://example.test/privacy','v1',180,'Test retention justification')"
    );
    for (const who of ['admin', 'a', 'b']) {
        await as(db, who);
        await db.query(
            `select save_my_site_profile_legal('user_${who}','User ${who}','v1','v1',true,true,true)`
        );
    }
    await as(db, 'admin');
    await db.query(
        "select admin_configure_site_accounts(true,'https://example.test/privacy','v1',180,'Test retention justification')"
    );
}
const legalMigration = '20261025060000_versioned_terms_and_adult_declarations.sql';
const bandaiMigration = '20261026010000_self_service_bandai_player_link.sql';
const playerAdminMigration = '20261026020000_admin_privileges_on_bandai_players.sql';
const automaticAdminListMigration = '20261026030000_limit_automatic_player_admins.sql';
const legacyAdminPlayer = '20000000-0000-0000-0000-000000000099';

async function preparePlayerAdmins(db) {
    await prepareLegal(db);
    await sqlOwner(db);
    await db.query("insert into auth.identities(user_id,provider) values($1,'google')", [
        ids.admin
    ]);
    await db.query('update user_profiles set player_id=$1 where user_id=$2', [
        ids.player,
        ids.admin
    ]);
    await db.query(
        "insert into players(id,name,bandai_nick) values($1,'Legacy Bandai','Legacy Bandai')",
        [legacyAdminPlayer]
    );
    await db.query('update user_profiles set player_id=$1 where user_id=$2', [
        legacyAdminPlayer,
        ids.legacy
    ]);
}

test('Player admin automatic claims are limited to the six specified players and preserve the current owner', async () => {
    const db = await setup([legalMigration, bandaiMigration, playerAdminMigration]);
    try {
        await preparePlayerAdmins(db);
        await db.query('select reserve_legacy_player_admins($1)', [ids.admin]);
        await db.query("update user_profiles set username='edu_lopes' where user_id=$1", [
            ids.admin
        ]);
        await db.query("update players set name='Eduardo Lopes' where id=$1", [ids.player]);
        await db.query("update players set name='Marcio Braga' where id=$1", [legacyAdminPlayer]);
        for (const name of [
            'Lukas Fujisawa',
            'Matheus Fonseca',
            'Carlos Fortes',
            'Philippe Oliveira',
            'Matheus Souza'
        ]) {
            await db.query(
                'insert into players(id,name,bandai_nick) values(gen_random_uuid(),$1,$1)',
                [name]
            );
        }
        await db.exec(readFileSync(`database/migrations/${automaticAdminListMigration}`, 'utf8'));
        const names = (
            await db.query(
                'select p.name from player_admin_grants g join players p on p.id=g.player_id order by p.name'
            )
        ).rows.map((row) => row.name);
        assert.deepEqual(names, [
            'Carlos Fortes',
            'Lukas Fujisawa',
            'Marcio Braga',
            'Matheus Fonseca',
            'Matheus Souza',
            'Philippe Oliveira'
        ]);
        assert.equal(
            (
                await db.query('select admin_player_id from admin_users where user_id=$1', [
                    ids.admin
                ])
            ).rows[0].admin_player_id,
            null
        );
        await db.query(
            "insert into auth.identities(user_id,provider) values($1,'google'),($2,'google')",
            [ids.a, ids.b]
        );
        await as(db, 'a');
        await db.query("select complete_my_player_link('Matheus Souza')");
        assert.equal(
            (await db.query('select my_site_account() value')).rows[0].value.is_admin,
            true
        );
        await as(db, 'b');
        await db.query("select complete_my_player_link('Ordinary Player')");
        assert.equal(
            (await db.query('select my_site_account() value')).rows[0].value.is_admin,
            false
        );
        await as(db, 'admin');
        assert.equal(
            (await db.query('select my_site_account() value')).rows[0].value.is_admin,
            true
        );
        await db.query('select admin_update_site_account($1,null,true)', [ids.b]);
        assert.equal(
            (await db.query('select admin_list_player_admins() value')).rows[0].value.length,
            6
        );
        await as(db, 'b');
        assert.equal(
            (await db.query('select my_site_account() value')).rows[0].value.is_admin,
            true
        );
    } finally {
        await db.close();
    }
});

test('Player admin reservations release legacy accounts without changing emails and a Google claim gains admin automatically', async () => {
    const db = await setup([legalMigration, bandaiMigration, playerAdminMigration]);
    try {
        await preparePlayerAdmins(db);
        const before = (await db.query('select email from auth.users where id=$1', [ids.legacy]))
            .rows[0].email;
        assert.equal(
            (await db.query('select reserve_legacy_player_admins($1) count', [ids.admin])).rows[0]
                .count,
            1
        );
        assert.equal((await db.query('select count(*)::int n from admin_users')).rows[0].n, 1);
        assert.equal(
            (await db.query('select player_id from user_profiles where user_id=$1', [ids.legacy]))
                .rows[0].player_id,
            null
        );
        assert.equal(
            (await db.query('select email from auth.users where id=$1', [ids.legacy])).rows[0]
                .email,
            before
        );
        await as(db, 'a');
        await assert.rejects(
            db.query("select complete_my_player_link('Legacy Bandai',$1)", [legacyAdminPlayer]),
            /Google/
        );
        assert.equal(
            (await db.query('select my_site_account() value')).rows[0].value.profile.player_id,
            null
        );
        await sqlOwner(db);
        await db.query("insert into auth.identities(user_id,provider) values($1,'google')", [
            ids.a
        ]);
        await as(db, 'a');
        await db.query("select complete_my_player_link('Legacy Bandai',$1)", [legacyAdminPlayer]);
        assert.equal(
            (await db.query('select my_site_account() value')).rows[0].value.is_admin,
            true
        );
        assert.equal(
            (await db.query('select admin_player_id from admin_users where user_id=$1', [ids.a]))
                .rows[0].admin_player_id,
            legacyAdminPlayer
        );
        await as(db, 'admin');
        const roles = (await db.query('select admin_list_player_admins() value')).rows[0].value;
        assert.equal(roles.filter((role) => role.claimed).length, 2);
        await sqlOwner(db);
        assert.equal(
            (await db.query('select reserve_legacy_player_admins($1) count', [ids.admin])).rows[0]
                .count,
            0
        );
        await as(db, 'b');
        await db.query("select complete_my_player_link('Regular player')");
        assert.equal(
            (await db.query('select my_site_account() value')).rows[0].value.is_admin,
            false
        );
    } finally {
        await db.close();
    }
});

test('Player admin reservations protect the retained administrator, revoke roles and block direct privilege writes', async () => {
    const db = await setup([legalMigration, bandaiMigration, playerAdminMigration]);
    try {
        await preparePlayerAdmins(db);
        await assert.rejects(
            db.query('select reserve_legacy_player_admins($1)', [ids.b]),
            /preservada/
        );
        await db.query('select reserve_legacy_player_admins($1)', [ids.admin]);
        await db.query("insert into auth.identities(user_id,provider) values($1,'google')", [
            ids.a
        ]);
        await as(db, 'a');
        await assert.rejects(
            db.query('select reserve_legacy_player_admins($1)', [ids.admin]),
            /permission denied/
        );
        await assert.rejects(
            db.query('select sync_player_admin_user($1)', [ids.a]),
            /permission denied/
        );
        await assert.rejects(
            db.query("select complete_my_player_link_without_admin('Legacy Bandai',$1)", [
                legacyAdminPlayer
            ]),
            /permission denied/
        );
        await assert.rejects(db.query('select * from player_admin_grants'), /permission denied/);
        await db.query("select complete_my_player_link('Legacy Bandai',$1)", [legacyAdminPlayer]);
        await as(db, 'admin');
        await db.query('select admin_update_site_account($1,null,false)', [ids.a]);
        await as(db, 'a');
        assert.equal(
            (await db.query('select my_site_account() value')).rows[0].value.is_admin,
            false
        );
        await db.query("select complete_my_player_link('Legacy Bandai',$1)", [legacyAdminPlayer]);
        assert.equal(
            (await db.query('select my_site_account() value')).rows[0].value.is_admin,
            false
        );
        await as(db, 'admin');
        await assert.rejects(
            db.query('select admin_update_site_account($1,null,false)', [ids.admin]),
            /última conta/
        );
        assert.equal(
            (await db.query('select my_site_account() value')).rows[0].value.is_admin,
            true
        );
    } finally {
        await db.close();
    }
});

test('Bandai self-service links existing players or creates new players without approval and protects existing links', async () => {
    const db = await setup([legalMigration, bandaiMigration]);
    try {
        await prepareLegal(db);
        await as(db, 'a');
        let account = (await db.query('select my_site_account() value')).rows[0].value;
        assert.equal(account.player_link_required, true);
        assert.equal(account.is_member, false);
        const matches = (await db.query("select search_bandai_players('Registered') value")).rows[0]
            .value;
        assert.equal(matches[0].id, ids.player);
        assert.equal(matches[0].available, true);
        await db.query("select complete_my_player_link('Registered player',$1)", [ids.player]);
        account = (await db.query('select my_site_account() value')).rows[0].value;
        assert.equal(account.player_link_required, false);
        assert.equal(account.is_member, true);
        assert.equal(account.profile.player_id, ids.player);
        assert.equal((await db.query('select count(*)::int n from account_requests')).rows[0].n, 0);
        await as(db, 'b');
        await assert.rejects(
            db.query("select complete_my_player_link('Registered player',$1)", [ids.player]),
            /outra conta/
        );
        assert.equal(
            (await db.query("select search_bandai_players('Registered') value")).rows[0].value[0]
                .available,
            false
        );
        const created = (await db.query("select complete_my_player_link('  New   Bandai  ') value"))
            .rows[0].value;
        const player = (await db.query('select * from players where id=$1', [created.player_id]))
            .rows[0];
        assert.equal(player.name, 'New Bandai');
        assert.equal(player.bandai_nick, 'New Bandai');
        await db.query("select complete_my_player_link('New Bandai')");
        assert.equal(
            (await db.query("select count(*)::int n from players where bandai_nick='New Bandai'"))
                .rows[0].n,
            1
        );
        await assert.rejects(
            db.query("select complete_my_player_link('Registered player',$1)", [ids.player]),
            /já tem/
        );
    } finally {
        await db.close();
    }
});

test('Bandai first-login copies and refreshes the Google photo only for the account linked player', async () => {
    const db = await setup([legalMigration, bandaiMigration]);
    try {
        await prepareLegal(db);
        await sqlOwner(db);
        await db.query('update auth.users set raw_user_meta_data=$1 where id=$2', [
            { avatar_url: 'https://lh3.googleusercontent.com/first-photo' },
            ids.a
        ]);
        await as(db, 'a');
        await db.query("select complete_my_player_link('Registered player',$1)", [ids.player]);
        assert.equal(
            (await db.query('select avatar_url from players where id=$1', [ids.player])).rows[0]
                .avatar_url,
            'https://lh3.googleusercontent.com/first-photo'
        );
        await sqlOwner(db);
        await db.query('update auth.users set raw_user_meta_data=$1 where id=$2', [
            { picture: 'https://lh3.googleusercontent.com/updated-photo' },
            ids.a
        ]);
        await as(db, 'a');
        await db.query('select sync_my_player_google_avatar()');
        assert.equal(
            (await db.query('select avatar_url from players where id=$1', [ids.player])).rows[0]
                .avatar_url,
            'https://lh3.googleusercontent.com/updated-photo'
        );
        await as(db, 'b');
        assert.equal(
            (
                await db.query(
                    "update players set avatar_url='https://example.test/other' where id=$1 returning id",
                    [ids.player]
                )
            ).rows.length,
            0
        );
        await db.query('select sync_my_player_google_avatar()');
        assert.equal(
            (await db.query('select avatar_url from players where id=$1', [ids.player])).rows[0]
                .avatar_url,
            'https://lh3.googleusercontent.com/updated-photo'
        );
        await sqlOwner(db);
        await db.query('update auth.users set raw_user_meta_data=$1 where id=$2', [
            { avatar_url: 'https://example.test/unrelated-photo' },
            ids.a
        ]);
        await as(db, 'a');
        await db.query('select sync_my_player_google_avatar()');
        assert.equal(
            (await db.query('select avatar_url from players where id=$1', [ids.player])).rows[0]
                .avatar_url,
            'https://lh3.googleusercontent.com/updated-photo'
        );
        await as(db, 'admin');
        await db.query(
            "update players set name='Jogador anonimizado',bandai_nick=null,bandai_id=null,is_active=false where id=$1",
            [ids.player]
        );
        assert.equal(
            (await db.query('select avatar_url from players where id=$1', [ids.player])).rows[0]
                .avatar_url,
            null
        );
    } finally {
        await db.close();
    }
});

test('Bandai onboarding rejects unconfirmed, blocked and ambiguous claims and preserves legal declarations', async () => {
    const db = await setup([legalMigration, bandaiMigration]);
    try {
        await prepareLegal(db);
        await as(db, null);
        await assert.rejects(
            db.query("select complete_my_player_link('Anonymous')"),
            /permission denied/
        );
        await as(db, 'pending');
        await assert.rejects(
            db.query("select complete_my_player_link('Unconfirmed')"),
            /confirmado/
        );
        await sqlOwner(db);
        await db.query("update user_profiles set status='blocked' where user_id=$1", [ids.b]);
        await db.query(
            "insert into players(id,name,bandai_nick) values(gen_random_uuid(),'Duplicate A','Same Nick'),(gen_random_uuid(),'Duplicate B','Same Nick')"
        );
        await as(db, 'b');
        await assert.rejects(db.query("select complete_my_player_link('Blocked')"), /ativa/);
        await as(db, 'a');
        await assert.rejects(db.query("select complete_my_player_link('Same Nick')"), /mais de um/);
        await assert.rejects(
            db.query("select complete_my_player_link('Wrong Name',$1)", [ids.player]),
            /Selecione novamente/
        );
        const matches = (await db.query("select search_bandai_players('Same Nick') value")).rows[0]
            .value;
        await sqlOwner(db);
        await db.query('update user_profiles set legal_acceptance_id=null where user_id=$1', [
            ids.a
        ]);
        await as(db, 'a');
        await assert.rejects(
            db.query("select complete_my_player_link('Same Nick',$1)", [matches[0].id]),
            /aceites/
        );
        await sqlOwner(db);
        await db.query(
            'update user_profiles set legal_acceptance_id=(select id from site_legal_acceptances where user_id=$1 order by accepted_at desc limit 1) where user_id=$1',
            [ids.a]
        );
        await as(db, 'a');
        await db.query("select complete_my_player_link('Same Nick',$1)", [matches[0].id]);
        assert.equal(
            (await db.query('select my_site_account() value')).rows[0].value.legal_current,
            true
        );
    } finally {
        await db.close();
    }
});
test('Published signup documents match the public pages, preserve rollout state and require separate declarations', async () => {
    const db = await setup([legalMigration]);
    try {
        await sqlOwner(db);
        const currentLegal = JSON.parse(readFileSync('legal/documents.json', 'utf8'));
        await db.exec(
            readFileSync(
                'database/migrations/20261025180000_register_site_legal_documents.sql',
                'utf8'
            )
        );
        const previousDocuments = (
            await db.query(
                "select kind,body,sha256 from site_legal_documents where version='2026-10-25.1' order by kind"
            )
        ).rows;
        await db.exec(
            readFileSync(
                `database/migrations/${currentLegal.migration || '20261025180000_register_site_legal_documents.sql'}`,
                'utf8'
            )
        );
        const config = (await db.query('select site_account_status() value')).rows[0].value;
        assert.equal(config.legal_ready, true);
        assert.equal(config.enabled, false);
        assert.deepEqual(
            (
                await db.query(
                    "select kind,body,sha256 from site_legal_documents where version='2026-10-25.1' order by kind"
                )
            ).rows,
            previousDocuments
        );
        const source = JSON.parse(readFileSync('legal/documents.json', 'utf8'));
        await as(db, null);
        const documents = (
            await db.query(
                'select kind,version,url,body,sha256 from site_legal_documents where version=$1 order by kind',
                [source.version]
            )
        ).rows;
        assert.equal(documents.length, 2);
        for (const document of documents) {
            const canonical = source[document.kind];
            assert.equal(document.version, source.version);
            assert.ok(document.url.endsWith(canonical.filename));
            assert.equal(
                document.body,
                [
                    canonical.title,
                    `Versão ${source.version} · ${source.publishedDate}`,
                    ...canonical.sections.flatMap((section) => [
                        section.title,
                        ...section.paragraphs
                    ])
                ].join('\n\n')
            );
            const html = readFileSync(`legal/${canonical.filename}`, 'utf8');
            assert.ok(html.includes(canonical.title));
            assert.ok(html.includes(source.version));
        }
        await as(db, 'a');
        for (const declarations of [
            [false, true, true],
            [true, false, true],
            [true, true, false]
        ]) {
            await assert.rejects(
                db.query('select save_my_site_profile_legal($1,$2,$3,$4,$5,$6,$7)', [
                    'user_a',
                    'User A',
                    source.version,
                    source.version,
                    ...declarations
                ])
            );
        }
        await db.query('select save_my_site_profile_legal($1,$2,$3,$4,true,true,true)', [
            'user_a',
            'User A',
            source.version,
            source.version
        ]);
        assert.equal(
            (await db.query('select my_site_account() value')).rows[0].value.legal_current,
            true
        );
    } finally {
        await db.close();
    }
});
test('Legal versions are immutable and membership requires authenticated, explicit adult acceptance', async () => {
    const db = await setup([legalMigration]);
    try {
        await as(db, 'admin');
        await assert.rejects(
            db.query(
                "select admin_configure_site_accounts(true,'https://example.test/privacy','v1',180,'Test retention justification')"
            ),
            /perfil|Publique/
        );
        await prepareLegal(db);
        await as(db, 'a');
        const current = (await db.query('select my_site_account() value')).rows[0].value;
        assert.equal(current.legal_current, true);
        assert.equal(current.is_member, true);
        const savedProfile = (
            await db.query(
                "select save_my_site_profile_legal('renamed_user','Novo nome','v1','v1',true,true,true) value"
            )
        ).rows[0].value;
        assert.equal(savedProfile.username, 'renamed_user');
        // A later account load must read the same persisted values.
        await as(db, 'b');
        await as(db, 'a');
        const reloadedProfile = (await db.query('select my_site_account() value')).rows[0].value
            .profile;
        assert.equal(reloadedProfile.username, 'renamed_user');
        assert.equal(reloadedProfile.display_name, 'Novo nome');
        await assert.rejects(
            db.query("select save_my_site_profile_legal('user_a','A','v1','v1',true,true,false)"),
            /18 anos/
        );
        await assert.rejects(
            db.query('update site_legal_acceptances set declared_adult=false'),
            /permission denied/
        );
        await as(db, 'admin');
        await db.query(
            "select admin_register_site_legal_document('privacy','v2','https://example.test/privacy','New reviewed privacy document with sufficient text.')"
        );
        await assert.rejects(
            db.query(
                "select admin_register_site_legal_document('privacy','v1','https://example.test/privacy','Replacement text should not overwrite a published version.')"
            ),
            /duplicate/
        );
        await db.query(
            "select admin_configure_site_accounts(true,'https://example.test/privacy','v2',180,'Test retention justification')"
        );
        await as(db, 'a');
        await db.query("select save_my_site_profile('user_a','A','v2')");
        assert.equal((await db.query('select site_is_member() value')).rows[0].value, false);
        await assert.rejects(
            db.query("select save_my_site_profile_legal('user_a','A','v1','v1',true,true,true)"),
            /atualizados/
        );
        await db.query("select save_my_site_profile_legal('user_a','A','v1','v2',true,true,true)");
        assert.equal((await db.query('select site_is_member() value')).rows[0].value, true);
        assert.equal(
            (
                await db.query(
                    'select count(*)::int n from site_legal_acceptances where user_id=auth.uid()'
                )
            ).rows[0].n,
            2
        );
        await sqlOwner(db);
        await assert.rejects(db.query("update site_legal_documents set body='Tamper'"), /imut/);
    } finally {
        await db.close();
    }
});
const erasureMigration = '20261025070000_account_erasure_workflow.sql';
test('Google profile names initialize only a display name and preserve identity and permission boundaries', async () => {
    const db = await setup([
        legalMigration,
        erasureMigration,
        '20261025200000_google_profile_display_names.sql'
    ]);
    try {
        await sqlOwner(db);
        const googleUser = '70000000-0000-0000-0000-000000000099';
        await db.query(
            "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'google@example.test',now(),$2)",
            [
                googleUser,
                JSON.stringify({
                    full_name: 'Google User',
                    is_admin: true,
                    player_id: ids.player,
                    legal_current: true
                })
            ]
        );
        const profile = (
            await db.query('select * from user_profiles where user_id=$1', [googleUser])
        ).rows[0];
        assert.equal(profile.display_name, 'Google User');
        assert.equal(profile.auth_user_id, googleUser);
        assert.equal(profile.player_id, null);
        assert.equal(profile.legal_acceptance_id, null);
        assert.equal(
            (
                await db.query('select count(*) count from admin_users where user_id=$1', [
                    googleUser
                ])
            ).rows[0].count,
            0
        );
    } finally {
        await db.close();
    }
});
const exportMigration = '20261025080000_audit_period_exports.sql';
const monitorMigration = '20261025090000_audit_operation_monitoring.sql';
test('Audit health recognizes a later scheduled catalog recovery while retaining failures and other alerts', async () => {
    const db = await setup([
        legalMigration,
        exportMigration,
        monitorMigration,
        '20261025170000_audit_catalog_recovery_health.sql'
    ]);
    try {
        await sqlOwner(db);
        await db.exec(`create schema cron;
            create table cron.job(jobid bigint,jobname text,active boolean);
            insert into cron.job values(1,'site-audit-retention',true);
            insert into site_audit.integration_runs(operation_id,operation,started_at,finished_at,http_status)
            values(gen_random_uuid(),'digilab-deck-catalog',now()-interval '40 minutes',now()-interval '35 minutes',500);`);
        const snapshot = async () =>
            (await db.query('select site_audit.health_snapshot() value')).rows[0].value;
        assert.equal((await snapshot()).severity, 'warning');
        await db.exec(`insert into site_audit.integration_runs(operation_id,operation,actor_user_id,started_at,finished_at,http_status) values
            (gen_random_uuid(),'another-integration',null,now()-interval '20 minutes',now()-interval '19 minutes',200),
            (gen_random_uuid(),'digilab-deck-catalog','${ids.a}',now()-interval '20 minutes',now()-interval '19 minutes',200),
            (gen_random_uuid(),'digilab-deck-catalog',null,now()-interval '45 minutes',now()-interval '19 minutes',200),
            (gen_random_uuid(),'digilab-deck-catalog',null,now()-interval '20 minutes',now()-interval '19 minutes',401);`);
        assert.equal((await snapshot()).unresolved_failed_integrations_24h, 1);
        await db.exec(`insert into site_audit.integration_runs(operation_id,operation,started_at,finished_at,http_status)
            values(gen_random_uuid(),'digilab-deck-catalog',now()-interval '20 minutes',now()-interval '19 minutes',200);`);
        let health = await snapshot();
        assert.equal(health.severity, 'ok');
        assert.equal(health.failed_integrations_24h, 1);
        assert.equal(health.unresolved_failed_integrations_24h, 0);
        assert.equal(health.recovered_failed_integrations_24h, 1);
        await db.exec(`insert into site_audit.integration_runs(operation_id,operation,started_at,finished_at,http_status)
            values(gen_random_uuid(),'digilab-deck-catalog',now()-interval '5 minutes',now()-interval '4 minutes',500);`);
        health = await snapshot();
        assert.equal(health.severity, 'warning');
        assert.equal(health.failed_integrations_24h, 2);
        assert.equal(health.unresolved_failed_integrations_24h, 1);
        assert.equal(health.recovered_failed_integrations_24h, 1);
        await db.exec(`alter table decklists disable trigger site_audit_change`);
        assert.equal((await snapshot()).severity, 'critical');
    } finally {
        await db.close();
    }
});
test('Erasure requires reviewed workflow, keeps historical rows and confirms provider deletion before completion', async () => {
    const db = await setup([legalMigration, erasureMigration]);
    try {
        await prepareLegal(db);
        await as(db, 'a');
        await db.query(`select submit_account_request('player_link','${ids.player}')`);
        await as(db, 'admin');
        await db.query(
            "select admin_review_account_request((select id from account_requests where request_type='player_link'),'approved','Verified link')"
        );
        await as(db, 'a');
        const deck = (
            await db.query(
                `select save_deck_draft(null,null,'MY DECK',1,'[]',0,'${ids.archetype}') value`
            )
        ).rows[0].value;
        const request = (
            await db.query(
                "select submit_account_request('erasure',null,null,'Personal private note') id"
            )
        ).rows[0].id;
        await assert.rejects(
            db.query(
                "select admin_prepare_account_erasure($1,'anonymize_linked_player','Reviewed erasure',true)",
                [request]
            ),
            /administrativo/
        );
        await as(db, 'admin');
        await assert.rejects(
            db.query("select admin_review_account_request($1,'completed','Premature completion')", [
                request
            ]),
            /procedimento/
        );
        await assert.rejects(
            db.query(
                "select admin_prepare_account_erasure($1,'anonymize_linked_player','Reviewed erasure',false)",
                [request]
            ),
            /Valide/
        );
        const job = (
            await db.query(
                "select admin_prepare_account_erasure($1,'anonymize_linked_player','Validated identity and requested removal',true) id",
                [request]
            )
        ).rows[0].id;
        const profile = (await db.query('select * from user_profiles where user_id=$1', [ids.a]))
            .rows[0];
        assert.equal(profile.status, 'closed');
        assert.equal(profile.display_name, 'Conta encerrada');
        assert.equal(profile.player_id, null);
        assert.equal(
            (await db.query('select name from players where id=$1', [ids.player])).rows[0].name,
            'Jogador anonimizado'
        );
        assert.equal(
            (await db.query('select owner_user_id from decklists where id=$1', [deck.id])).rows[0]
                .owner_user_id,
            null
        );
        assert.equal(
            (await db.query('select count(*)::int n from tournament_results')).rows[0].n,
            1
        );
        await assert.rejects(
            db.query('select admin_complete_account_erasure($1,true)', [job]),
            /credenciais/
        );
        await sqlOwner(db);
        await db.exec("set role service_role; set request.jwt.claim.role='service_role'");
        await assert.rejects(
            db.query('select finish_site_account_auth_erasure($1,true)', [job]),
            /ainda existem/
        );
        await sqlOwner(db);
        await db.query('delete from auth.users where id=$1', [ids.a]);
        assert.equal(
            (await db.query('select auth_user_id from user_profiles where user_id=$1', [ids.a]))
                .rows[0].auth_user_id,
            null
        );
        await db.exec("set role service_role; set request.jwt.claim.role='service_role'");
        await db.query('select finish_site_account_auth_erasure($1,true)', [job]);
        await as(db, 'admin');
        await assert.rejects(
            db.query('select admin_complete_account_erasure($1,false)', [job]),
            /revisão/
        );
        await db.query('select admin_complete_account_erasure($1,true)', [job]);
        assert.equal(
            (await db.query('select status,note from account_requests where id=$1', [request]))
                .rows[0].status,
            'completed'
        );
        assert.equal(
            (await db.query('select note from account_requests where id=$1', [request])).rows[0]
                .note,
            ''
        );
    } finally {
        await db.close();
    }
});
test('Audit period exports use fixed snapshots, keyset pages and access restricted to their initiating admin', async () => {
    const db = await setup([
        legalMigration,
        exportMigration,
        monitorMigration,
        '20261025100000_distinguish_anonymous_integration_actors.sql'
    ]);
    try {
        await prepareLegal(db);
        await sqlOwner(db);
        await db.query(
            "insert into site_audit.events(occurred_at,actor_kind,action,entity_type,entity_id,changes) select now()-interval '1 second','maintenance','test.export','export_test',n::text,jsonb_build_object('name',jsonb_build_object('before','a','after','b')) from generate_series(1,1003) n"
        );
        await as(db, 'admin');
        const job = (
            await db.query("select admin_begin_audit_export(p_entity=>'export_test') value")
        ).rows[0].value;
        assert.equal(job.total, 1003);
        await sqlOwner(db);
        await db.query(
            "insert into site_audit.events(actor_kind,action,entity_type) values('maintenance','test.late','export_test')"
        );
        await as(db, 'admin');
        let cursor = null,
            events = [];
        for (;;) {
            const page = (
                await db.query('select admin_audit_export_page($1,$2) value', [job.id, cursor])
            ).rows[0].value;
            events.push(...page.events);
            if (page.done) break;
            cursor = page.next_cursor;
        }
        assert.equal(events.length, 1003);
        assert.equal(new Set(events.map((e) => e.event_id)).size, 1003);
        assert.equal(
            events.some((e) => e.action === 'test.late'),
            false
        );
        await assert.rejects(
            db.query('select admin_finish_audit_export($1,2,false)', [job.id]),
            /incompleta/
        );
        await as(db, 'b');
        await assert.rejects(
            db.query('select admin_audit_export_page($1)', [job.id]),
            /administrativo/
        );
        await as(db, 'admin');
        await db.query(`select admin_update_site_account('${ids.b}',null,true)`);
        await as(db, 'b');
        await assert.rejects(
            db.query('select admin_audit_export_page($1)', [job.id]),
            /indisponível/
        );
        await as(db, 'admin');
        await db.query('select admin_finish_audit_export($1,1003,false)', [job.id]);
        await assert.rejects(
            db.query('select admin_audit_export_page($1)', [job.id]),
            /indisponível/
        );
        await assert.rejects(db.query('select * from site_audit.exports'), /permission denied/);
    } finally {
        await db.close();
    }
});
test('Audit monitoring detects absent collectors, failed and stalled operations without claiming external delivery', async () => {
    const db = await setup([
        legalMigration,
        exportMigration,
        monitorMigration,
        '20261025100000_distinguish_anonymous_integration_actors.sql'
    ]);
    try {
        await prepareLegal(db);
        await as(db, 'a');
        await assert.rejects(db.query('select admin_site_audit_health()'), /administrativo/);
        await assert.rejects(db.query('select collect_site_audit_health()'), /permission denied/);
        await sqlOwner(db);
        await db.exec("set role service_role; set request.jwt.claim.role='service_role'");
        const operation = '80000000-0000-0000-0000-000000000001';
        await db.query("select start_site_integration_event($1,'test-monitor',null,null)", [
            operation
        ]);
        await db.query("select record_site_integration_event(null,'test-monitor',$1,500,null)", [
            operation
        ]);
        await sqlOwner(db);
        await db.query(
            "insert into site_audit.integration_runs(operation_id,operation,started_at) values(gen_random_uuid(),'test-stalled',now()-interval '31 minutes')"
        );
        await db.exec('alter table decklists disable trigger site_audit_change');
        await as(db, 'admin');
        const report = (await db.query('select admin_site_audit_health() value')).rows[0].value;
        assert.equal(report.severity, 'critical');
        assert.equal(report.missing_triggers, 1);
        assert.equal(report.failed_integrations_24h, 1);
        assert.equal(report.stalled_integrations, 1);
        assert.equal(report.external_alert_delivery_configured, false);
        assert.equal(report.api_log_ingestion_configured, false);
        await db.query(
            "select admin_record_audit_provider_review('api','Reviewed provider gateway logs in test environment')"
        );
        assert.equal(
            (await db.query('select admin_site_audit_health() value')).rows[0].value
                .provider_reviews.length,
            1
        );
        await sqlOwner(db);
        await db.exec("set role service_role; set request.jwt.claim.role='service_role'");
        await db.query('select collect_site_audit_health()');
        await db.query(
            "select record_site_integration_event(null,'public-image-test',gen_random_uuid(),200,null,'anonymous')"
        );
        await sqlOwner(db);
        assert.equal(
            (
                await db.query(
                    "select actor_kind from site_audit.events where action='integration.public-image-test' order by event_id desc limit 1"
                )
            ).rows[0].actor_kind,
            'anonymous'
        );

        await as(db, 'admin');
        assert.equal(
            (await db.query('select admin_site_audit_health() value')).rows[0].value.recent_checks
                .length,
            1
        );
    } finally {
        await db.close();
    }
});
