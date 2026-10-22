const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const migration = readFileSync('database/migrations/20261021020000_deck_archetypes.sql', 'utf8');
const typeId = '10000000-0000-0000-0000-000000000001';
const playerId = '20000000-0000-0000-0000-000000000001';
const resultId = '30000000-0000-0000-0000-000000000001';
test('Deck type and optional player persist atomically; migration preserves legacy data and tournament identity', async () => {
    const db = new PGlite();
    try {
        await db.exec(`set time zone 'UTC'; create role anon; create role authenticated;
            create table decks(id uuid primary key,name text,is_active boolean default true);
            create table players(id uuid primary key,name text);
            create table deck_formats(id bigint primary key,rules_revision int);
            create table tournament(id bigint primary key,deck_format_id bigint,store_id uuid,tournament_date date);
            create table tournament_results(id uuid primary key,tournament_id bigint,store_id uuid,tournament_date date,deck_id uuid);
            create table decklists(id bigserial primary key,name text,deck_format_id bigint,tournament_result_id uuid unique,source text,draft_cards jsonb,draft_revision int default 0,format_rules_revision int,updated_at timestamptz default now());
            create function valid_deck_draft_cards(value jsonb) returns boolean language sql as $$select jsonb_typeof(value)='array'$$;
            insert into decks values('${typeId}','Registered type',true);
            insert into players values('${playerId}','Registered player');
            insert into deck_formats values(1,1); insert into tournament(id,deck_format_id) values(1,1);
            insert into tournament_results(id,tournament_id,deck_id) values('${resultId}',1,'${typeId}');
            insert into decklists(name,tournament_result_id,draft_cards,updated_at) values('Legacy','${resultId}','[{"code":"BT1-010","qty":4}]','2020-01-01');
            alter table decklists enable row level security;create policy existing_public on decklists for all to anon using(true) with check(true);
            grant select on decks,players,deck_formats,tournament to anon;
            grant select,insert,update on decklists,tournament_results to anon;
            grant usage,select on sequence decklists_id_seq to anon;`);
        await db.exec(migration);
        await db.exec(migration);
        assert.equal(
            (await db.query('select updated_at::text from decklists where id=1')).rows[0]
                .updated_at,
            '2020-01-01 00:00:00+00'
        );
        await db.exec('set role anon');
        await assert.rejects(
            db.query("select save_deck_draft(null,null,'No type',1,'[]',0)"),
            /tipo de deck/
        );
        const saved = (
            await db.query(
                `select save_deck_draft(null,null,'Free',1,'[{"code":"BT1-010","qty":55}]',0,'${typeId}','${playerId}') result`
            )
        ).rows[0].result;
        const row = (await db.query('select * from decklists where id=$1', [saved.id])).rows[0];
        assert.equal(row.archetype_id, typeId);
        assert.equal(row.creator_player_id, playerId);
        assert.equal(row.draft_cards[0].qty, 55);
        await assert.rejects(
            db.query(
                `select save_deck_draft(${saved.id},null,'Bad',1,'[]',1,'10000000-0000-0000-0000-000000000099')`
            ),
            /tipo de deck/
        );
        assert.equal(
            (await db.query('select draft_revision from decklists where id=$1', [saved.id])).rows[0]
                .draft_revision,
            1
        );
        await db.query(`select save_deck_draft(${saved.id},null,'Updated',1,'[]',1,'${typeId}')`);
        assert.equal(
            (await db.query('select creator_player_id from decklists where id=$1', [saved.id]))
                .rows[0].creator_player_id,
            playerId
        );
        await db.query(
            `select save_deck_draft(1,'${resultId}','Tournament',1,'[]',0,'10000000-0000-0000-0000-000000000099')`
        );
        assert.equal(
            (await db.query('select archetype_id from decklists where id=1')).rows[0].archetype_id,
            typeId
        );
    } finally {
        await db.close();
    }
});
