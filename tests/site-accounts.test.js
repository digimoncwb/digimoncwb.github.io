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
const exportMigration = '20261025080000_audit_period_exports.sql';
const monitorMigration = '20261025090000_audit_operation_monitoring.sql';
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
            "insert into site_audit.events(actor_kind,action,entity_type,entity_id,changes) select 'maintenance','test.export','export_test',n::text,jsonb_build_object('name',jsonb_build_object('before','a','after','b')) from generate_series(1,1003) n"
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
