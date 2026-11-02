const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const migration = readFileSync(
    'database/migrations/20261101080000_draft_game_format_visibility.sql',
    'utf8'
);
const previous = readFileSync('database/migrations/20261021010000_deck_editor_drafts.sql', 'utf8');
const admin = '10000000-0000-0000-0000-000000000001';
test('Draft formats and their versions are admin-only while preserving data and references', async () => {
    const db = new PGlite();
    try {
        await db.exec(`create role anon; create role authenticated; create schema auth;
            create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
            create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
            grant usage on schema auth to anon,authenticated;
            create table admin_users(user_id uuid primary key,active boolean default true);
            insert into admin_users values('${admin}',true);
            create function public.site_is_admin() returns boolean language sql stable security definer as $$ select exists(select 1 from admin_users where user_id=auth.uid() and active) $$;
            create table deck_formats(id bigserial primary key,code text,name text,description text,rules_text text,rules_url text,is_active boolean default true,is_default boolean default false,is_community_highlight boolean default false,rules_status text default 'draft',validation_rules jsonb,rules_revision integer default 1,updated_at timestamptz default now(),change_note text,created_at timestamptz default now());
            create table deck_format_rule_versions(id bigserial primary key,deck_format_id bigint references deck_formats,version integer,description text,rules_snapshot jsonb,unique(deck_format_id,version));
            alter table deck_formats enable row level security;
            alter table deck_format_rule_versions enable row level security;
            create policy legacy_public_read on deck_formats for select to anon,authenticated using(true);
            create policy legacy_admin_all on deck_formats for all to authenticated using(public.site_is_admin()) with check(public.site_is_admin());
            create policy legacy_versions_read on deck_format_rule_versions for select to anon,authenticated using(true);
            grant select on deck_formats,deck_format_rule_versions to anon,authenticated;
            grant update on deck_formats to authenticated;
            create table decklists(id bigint primary key,deck_format_id bigint references deck_formats,content jsonb);`);
        await db.exec(
            previous.slice(
                previous.indexOf('create or replace function public.guard_format_validation()'),
                previous.indexOf(
                    'insert into public.deck_format_rule_versions(deck_format_id,version,description,rules_snapshot)\nselect id'
                )
            )
        );
        await db.exec(`insert into deck_formats(id,code,name,rules_status,validation_rules,rules_text)
            values(1,'STANDARD','Padrão','published','{"main_count":50,"copies":4,"egg_max":5}','Regras padrão'),
            (2,'DIGICREST','DigiCrest','published','{"main_count":50,"copies":4,"egg_max":5,"points_limit":100,"card_points":{"BT1-001":{"name":"Agumon","points":30}}}','Regras especiais');
            insert into decklists values(42,2,'{"cards":[{"code":"BT1-001","qty":4}]}');`);
        await db.exec(migration);
        await db.exec(migration);
        const before = (await db.query('select * from deck_formats where id=2')).rows[0];
        await db.exec(
            `set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${admin}';set role authenticated;`
        );
        await db.exec(
            "update deck_formats set rules_status='draft',change_note='Voltou para rascunho' where id=2"
        );
        let draft = (await db.query('select * from deck_formats where id=2')).rows[0];
        assert.equal(draft.rules_revision, before.rules_revision + 1);
        for (const key of ['validation_rules', 'rules_text', 'code', 'name', 'id', 'is_active'])
            assert.deepEqual(draft[key], before[key]);
        assert.equal(
            (await db.query('select * from deck_format_rule_versions where deck_format_id=2')).rows
                .length,
            2
        );
        for (const role of ['anon', 'authenticated']) {
            await db.exec(`reset role;set request.jwt.claim.sub='';set role ${role};`);
            assert.deepEqual(
                (await db.query('select id from deck_formats order by id')).rows.map(
                    (row) => row.id
                ),
                [1]
            );
            assert.equal((await db.query('select * from deck_formats where id=2')).rows.length, 0);
            assert.equal(
                (await db.query('select * from deck_format_rule_versions where deck_format_id=2'))
                    .rows.length,
                0
            );
        }
        await db.exec(
            `reset role;update admin_users set active=false;set request.jwt.claim.sub='${admin}';set role authenticated;`
        );
        assert.equal((await db.query('select * from deck_formats where id=2')).rows.length, 0);
        await db.exec('reset role;update admin_users set active=true;set role authenticated;');
        await db.exec("update deck_formats set rules_status='published' where id=2");
        await db.exec("reset role;set request.jwt.claim.sub='';set role anon;");
        assert.equal((await db.query('select * from deck_formats where id=2')).rows.length, 1);
        await db.exec('reset role');
        assert.deepEqual(
            (await db.query('select validation_rules from deck_formats where id=2')).rows[0]
                .validation_rules,
            before.validation_rules
        );
        assert.equal(
            (await db.query('select * from decklists where id=42')).rows[0].deck_format_id,
            2
        );
        assert.equal(
            (await db.query('select * from deck_format_rule_versions where deck_format_id=2')).rows
                .length,
            3
        );
    } finally {
        await db.close();
    }
});
