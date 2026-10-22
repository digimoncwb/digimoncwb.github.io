const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const migration = readFileSync('database/migrations/20261021000000_deck_library.sql', 'utf8');
const adminId = '10000000-0000-0000-0000-000000000001';
const resultId = '20000000-0000-0000-0000-000000000001';

test('Deck library migration preserves tournament lists, enforces regulations and copies atomically under RLS', async () => {
    const db = new PGlite();
    try {
        await db.exec(`create role anon; create role authenticated; create schema auth;
            create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
            create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
            grant usage on schema auth to anon,authenticated;
            create table admin_users(user_id uuid primary key);
            alter table admin_users enable row level security;
            create policy own_admin on admin_users for select to authenticated using(user_id=auth.uid());
            grant select on admin_users to authenticated;
            insert into admin_users values('${adminId}');
            create table formats(id bigserial primary key,code text, name text);
            create table tournament(id bigint primary key,format_id bigint references formats,store_id uuid,tournament_date date);
            create table tournament_results(id uuid primary key,tournament_id bigint references tournament,decklist text,store_id uuid,tournament_date date);
            create table decklists(id bigserial primary key,tournament_result_id uuid not null unique references tournament_results,source text default 'builder',updated_at timestamptz default now());
            create table decklist_cards(id bigserial primary key,decklist_id bigint references decklists,position integer not null check(position>0),card_code text not null,qty integer check(qty between 1 and 4),unique(decklist_id,position));
            alter table formats enable row level security;
            alter table decklists enable row level security;
            alter table decklist_cards enable row level security;
            create policy old_formats on formats for all to public using(true) with check(true);
            create policy old_lists on decklists for all to anon using(true) with check(true);
            create policy old_cards on decklist_cards for all to anon using(true) with check(true);
            grant select,insert,update,delete on formats,decklists,decklist_cards,tournament_results to anon;
            grant select on tournament to anon;
            grant usage,select on all sequences in schema public to anon;
            insert into formats(code,name) values('EX13','Atual'),('BT26','Anterior');
            insert into tournament(id,format_id) values(1,1);
            insert into tournament_results(id,tournament_id,decklist) values('${resultId}',1,'4 BT1-001');
            insert into decklists(tournament_result_id) values('${resultId}');
            insert into decklist_cards(decklist_id,position,card_code,qty) values(1,1,'BT1-001',4);`);
        await db.exec(migration);
        await db.exec(migration); // Re-applying must preserve every record.
        assert.equal((await db.query('select count(*)::int n from decklists')).rows[0].n, 1);
        await db.exec("set role anon; set request.jwt.claim.role='anon'");
        await assert.rejects(
            db.exec("insert into decklists(name) values('Missing format')"),
            /decklists_free_identity/
        );
        await assert.rejects(
            db.exec("update formats set rules_text='Visitor rules' where id=1"),
            /administradores/
        );
        await assert.rejects(
            db.exec("insert into formats(code,rules_text) values('BAD','Visitor rules')"),
            /administradores/
        );
        await db.exec("insert into decklists(name,format_id) values('Livre',2)");
        const source = (await db.query("select id from decklists where name='Livre'")).rows[0].id;
        await db.exec(
            `select replace_decklist_cards(${source},'[ {"position":1,"card_code":"EX13-001","qty":3} ]')`
        );
        await assert.rejects(
            db.exec(
                `select replace_decklist_cards(${source},'[ {"position":1,"card_code":"BAD","qty":9} ]')`
            ),
            /check constraint/
        );
        assert.equal(
            (await db.query('select card_code from decklist_cards where decklist_id=$1', [source]))
                .rows[0].card_code,
            'EX13-001'
        );
        await assert.rejects(
            db.exec(`select copy_free_deck_to_result(${source},'${resultId}',false)`),
            /Confirme/
        );
        assert.equal(
            (await db.query('select card_code from decklist_cards where decklist_id=1')).rows[0]
                .card_code,
            'BT1-001'
        );
        await db.exec(`select copy_free_deck_to_result(${source},'${resultId}',true)`);
        assert.equal(
            (await db.query('select card_code from decklist_cards where decklist_id=1')).rows[0]
                .card_code,
            'EX13-001'
        );
        assert.equal(
            (await db.query('select format_id from decklists where id=1')).rows[0].format_id,
            1
        );
        assert.equal(
            (await db.query('select decklist from tournament_results')).rows[0].decklist,
            '3 EX13-001'
        );
        assert.equal(
            (
                await db.query('select count(*)::int n from decklist_cards where decklist_id=$1', [
                    source
                ])
            ).rows[0].n,
            1
        );
        await db.exec(`reset role;
            insert into tournament values(2,1,'30000000-0000-0000-0000-000000000001','2026-10-20');
            insert into tournament_results values('20000000-0000-0000-0000-000000000002',null,null,'30000000-0000-0000-0000-000000000001','2026-10-20');
            set role anon;
            select copy_free_deck_to_result(${source},'20000000-0000-0000-0000-000000000002',false);`);
        assert.equal(
            (
                await db.query(
                    "select format_id from decklists where tournament_result_id='20000000-0000-0000-0000-000000000002'"
                )
            ).rows[0].format_id,
            1
        );
        await db.exec(`reset role;
            insert into tournament values(3,2,'30000000-0000-0000-0000-000000000001','2026-10-20');
            set role anon;`);
        await assert.rejects(
            db.exec(
                `select copy_free_deck_to_result(${source},'20000000-0000-0000-0000-000000000002',true)`
            ),
            /único torneio/
        );
        await db.exec(`delete from decklists where id=${source}`);
        assert.equal(
            (await db.query('select count(*)::int n from decklists where id=$1', [source])).rows[0]
                .n,
            1
        );
        await db.exec(
            `reset role; set role authenticated; set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${adminId}'; update formats set rules_text='Regras reais',is_community_highlight=true where id=1`
        );
        assert.equal(
            (await db.query('select rules_text from formats where id=1')).rows[0].rules_text,
            'Regras reais'
        );
        await db.exec("set request.jwt.claim.sub='10000000-0000-0000-0000-000000000099'");
        await assert.rejects(
            db.exec("update formats set rules_text='Unauthorized' where id=1"),
            /administradores/
        );
        await assert.rejects(db.exec('delete from formats where id=1'), /administradores/);
        await db.exec(`update decklists set name='Livre atualizado' where id=${source}`);
        assert.equal(
            (await db.query('select name from decklists where id=$1', [source])).rows[0].name,
            'Livre atualizado'
        );
    } finally {
        await db.close();
    }
});
