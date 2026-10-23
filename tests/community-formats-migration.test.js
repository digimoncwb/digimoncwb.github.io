const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const migration = readFileSync(
    'database/migrations/20261023000000_community_format_rules.sql',
    'utf8'
);
const prior = readFileSync('database/migrations/20261021010000_deck_editor_drafts.sql', 'utf8');
const adminId = '10000000-0000-0000-0000-000000000001';
test('Community format seed, typed rules, admin permissions and history are idempotent without replacing later edits', async () => {
    const db = new PGlite();
    try {
        await db.exec(`create role anon; create role authenticated; create schema auth;
            create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
            create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
            grant usage on schema auth to anon,authenticated;
            create table admin_users(user_id uuid primary key); insert into admin_users values('${adminId}'); grant select on admin_users to authenticated;
            create function public.valid_format_rules(value jsonb) returns boolean language sql immutable as $$select true$$;
            create table deck_formats(id bigserial primary key,code text unique,name text,description text,rules_text text,rules_url text,is_active boolean default true,is_default boolean default false,is_community_highlight boolean default false,rules_status text default 'draft',validation_rules jsonb check(public.valid_format_rules(validation_rules)),rules_revision integer default 1,updated_at timestamptz default now(),change_note text,created_at timestamptz default now());
            create table deck_format_rule_versions(id bigserial primary key,deck_format_id bigint references deck_formats,version integer,created_at timestamptz default now(),description text,rules_snapshot jsonb,unique(deck_format_id,version));
            create table decklist_card_metadata(card_code text primary key,name text);
            alter table deck_formats enable row level security;
            create policy read_formats on deck_formats for select to anon,authenticated using(true);
            create policy admin_formats on deck_formats for all to authenticated using(exists(select 1 from admin_users where user_id=auth.uid())) with check(exists(select 1 from admin_users where user_id=auth.uid()));
            grant select on deck_formats to anon;grant select,insert,update,delete on deck_formats to authenticated;grant usage,select on sequence deck_formats_id_seq to authenticated;`);
        await db.exec(
            prior.slice(
                prior.indexOf('create or replace function public.guard_format_validation()'),
                prior.indexOf('alter table public.decklists add column if not exists draft_cards')
            )
        );
        await db.exec(
            "insert into deck_formats(code,name,validation_rules,rules_status) values('STANDARD','Padrão','{\"main_count\":50,\"egg_max\":5,\"copies\":4}','published')"
        );
        const raw = readFileSync('database/seeds/digicrest-initial.tsv', 'utf8')
            .trim()
            .split(/\r?\n/)
            .map((line) => line.split(/\s+/));
        assert.equal(raw.length, 193);
        for (const [input] of raw) {
            if (['BT21-02', 'EX6'].includes(input)) continue;
            const code =
                { 'AD01-002': 'AD1-002', 'BT14-0': 'BT14-009', 'BT12-57': 'BT12-057' }[input] ||
                input;
            await db.query('insert into decklist_card_metadata values($1,$2)', [
                code,
                `Card ${code}`
            ]);
        }
        await db.exec(migration);
        const seed = (await db.query("select * from deck_formats where code='DIGICREST'")).rows[0];
        assert.equal(Object.keys(seed.validation_rules.card_points).length, 191);
        assert.equal(seed.validation_rules.points_pending.length, 2);
        assert.equal(seed.validation_rules.card_points['EX1-066'].points, 20);
        assert.equal(seed.validation_rules.card_points['BT9-098'].points, 15);
        assert.equal(seed.validation_rules.card_points['BT15-003'].points, 90);
        assert.equal(seed.rules_status, 'draft');
        for (const [input, points] of raw) {
            const code =
                { 'AD01-002': 'AD1-002', 'BT14-0': 'BT14-009', 'BT12-57': 'BT12-057' }[input] ||
                input;
            const saved =
                seed.validation_rules.card_points[code] ||
                seed.validation_rules.points_pending.find((row) => row.code === code);
            assert.equal(saved.points, Number(points), input);
        }
        assert.deepEqual(
            (await db.query("select validation_rules from deck_formats where code='PAUPER'"))
                .rows[0].validation_rules.allowed_rarities,
            ['C', 'U']
        );
        for (const value of [
            { points_limit: -1 },
            { points_limit: 1.5 },
            { allowed_rarities: ['Unknown'] },
            { card_points: { 'DD-010': { name: 'Other game', points: 1 } } },
            { card_points: { 'BT9-098': { name: 'Card', points: -1 } } },
            { card_points: { 'BT9-098': { name: '', points: 15 } } }
        ])
            assert.equal(
                (
                    await db.query('select valid_format_rules($1::jsonb) result', [
                        JSON.stringify(value)
                    ])
                ).rows[0].result,
                false
            );
        await db.exec('set role anon');
        await assert.rejects(
            db.query("update deck_formats set name='Changed' where code='PAUPER'"),
            /permission denied/
        );
        await db.exec('reset role; set role authenticated');
        assert.equal(
            (
                await db.query(
                    "update deck_formats set name='Changed' where code='PAUPER' returning id"
                )
            ).rows.length,
            0
        );
        await db.exec(
            `reset role;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${adminId}';set role authenticated;`
        );
        await assert.rejects(
            db.query("update deck_formats set rules_status='published' where code='DIGICREST'"),
            /pendentes/
        );
        await db.query(
            "update deck_formats set validation_rules=jsonb_set(validation_rules,'{card_points,BT9-098,points}','17') where code='DIGICREST'"
        );
        const edited = (await db.query("select * from deck_formats where code='DIGICREST'"))
            .rows[0];
        assert.equal(edited.validation_rules.card_points['BT9-098'].points, 17);
        assert.equal(edited.rules_revision, 2);
        await db.exec("reset role;set request.jwt.claim.role='';set request.jwt.claim.sub='';");
        await db.exec(migration);
        assert.deepEqual(
            (
                await db.query(
                    "select validation_rules,rules_revision from deck_formats where code='DIGICREST'"
                )
            ).rows[0],
            { validation_rules: edited.validation_rules, rules_revision: edited.rules_revision }
        );
        assert.equal((await db.query('select count(*)::int n from deck_formats')).rows[0].n, 3);
        assert.equal(
            (
                await db.query(
                    'select count(*)::int n from deck_format_rule_versions where deck_format_id=$1',
                    [seed.id]
                )
            ).rows[0].n,
            2
        );
        const legacy = JSON.parse(JSON.stringify(edited.validation_rules));
        for (const [oldCode, code] of [
            ['BT14-0', 'BT14-009'],
            ['BT12-57', 'BT12-057']
        ]) {
            legacy.points_pending.push({
                code: oldCode,
                name: oldCode,
                points: legacy.card_points[code].points
            });
            delete legacy.card_points[code];
        }
        await db.query("update deck_formats set validation_rules=$1 where code='DIGICREST'", [
            JSON.stringify(legacy)
        ]);
        const correction = readFileSync(
            'database/migrations/20261023010000_digicrest_confirmed_codes.sql',
            'utf8'
        );
        await db.exec(correction);
        const corrected = (
            await db.query(
                "select validation_rules,rules_revision from deck_formats where code='DIGICREST'"
            )
        ).rows[0];
        assert.equal(corrected.validation_rules.card_points['BT14-009'].points, 2);
        assert.equal(corrected.validation_rules.card_points['BT12-057'].points, 15);
        assert.equal(corrected.validation_rules.card_points['BT9-098'].points, 17);
        assert.equal(corrected.validation_rules.points_pending.length, 2);
        assert.ok(corrected.validation_rules.card_points['ST13-08']);
        await db.exec(correction);
        assert.deepEqual(
            (
                await db.query(
                    "select validation_rules,rules_revision from deck_formats where code='DIGICREST'"
                )
            ).rows[0],
            corrected
        );
        const activation = readFileSync(
            'database/migrations/20261023020000_activate_confirmed_digicrest.sql',
            'utf8'
        );
        await db.exec(activation);
        const activated = (await db.query("select * from deck_formats where code='DIGICREST'"))
            .rows[0];
        assert.equal(activated.rules_status, 'published');
        assert.equal(activated.is_active, true);
        assert.equal(Object.keys(activated.validation_rules.card_points).length, 191);
        assert.deepEqual(activated.validation_rules.points_pending, []);
        assert.deepEqual(
            activated.validation_rules.card_points,
            corrected.validation_rules.card_points
        );
        await db.exec(activation);
        assert.deepEqual(
            (await db.query("select * from deck_formats where code='DIGICREST'")).rows[0],
            activated
        );
        await db.exec("update deck_formats set rules_status='draft' where code='DIGICREST'");
        await db.exec(activation);
        assert.equal(
            (await db.query("select rules_status from deck_formats where code='DIGICREST'")).rows[0]
                .rules_status,
            'draft'
        );
        const securityMigration = readFileSync(
            'database/migrations/20261023030000_format_security_count.sql',
            'utf8'
        );
        const beforeSecurity = (
            await db.query(
                'select id,validation_rules,rules_revision from deck_formats order by id'
            )
        ).rows;
        await db.exec(securityMigration);
        const afterSecurity = (
            await db.query(
                'select id,validation_rules,rules_revision from deck_formats order by id'
            )
        ).rows;
        for (let i = 0; i < beforeSecurity.length; i++) {
            assert.deepEqual(afterSecurity[i].validation_rules, {
                ...beforeSecurity[i].validation_rules,
                security_count: 5
            });
            assert.equal(afterSecurity[i].rules_revision, beforeSecurity[i].rules_revision + 1);
        }
        for (const value of [-1, 1.5, 1000, '5', null]) {
            assert.equal(
                (
                    await db.query('select valid_format_rules($1::jsonb) result', [
                        JSON.stringify({ security_count: value })
                    ])
                ).rows[0].result,
                false
            );
        }
        assert.equal(
            (
                await db.query('select valid_format_rules($1::jsonb) result', [
                    JSON.stringify({ security_count: 0 })
                ])
            ).rows[0].result,
            true
        );
        await db.exec(
            "update deck_formats set validation_rules=jsonb_set(validation_rules,'{security_count}','7') where code='PAUPER'"
        );
        const customSecurity = (
            await db.query(
                'select id,validation_rules,rules_revision from deck_formats order by id'
            )
        ).rows;
        await db.exec(securityMigration);
        assert.deepEqual(
            (
                await db.query(
                    'select id,validation_rules,rules_revision from deck_formats order by id'
                )
            ).rows,
            customSecurity
        );
        await db.exec(
            'insert into deck_formats(code,name,validation_rules) values(\'FUTURE\',\'Future\',\'{"main_count":50,"egg_max":5,"copies":4}\')'
        );
        assert.equal(
            (await db.query("select validation_rules from deck_formats where code='FUTURE'"))
                .rows[0].validation_rules.security_count,
            5
        );
        await db.exec(
            "alter table decklist_card_metadata add column card_payload jsonb default '{}'::jsonb; insert into decklist_card_metadata values('BT26-091','Yoshino Fujieda','{\"rarity\":\"RC\",\"type\":\"Tamer\"}'),('BT1-099','Other','{\"rarity\":\"RC\"}')"
        );
        const rarityMigration = readFileSync(
            'database/migrations/20261023040000_correct_bt26_091_rarity.sql',
            'utf8'
        );
        await db.exec(rarityMigration);
        const banlistMigration = readFileSync(
            'database/migrations/20261023050000_optional_official_banlist.sql',
            'utf8'
        );
        const beforeBanlist = (
            await db.query('select code,validation_rules from deck_formats order by code')
        ).rows;
        await db.exec(banlistMigration);
        for (const row of beforeBanlist) {
            const after = (
                await db.query('select validation_rules from deck_formats where code=$1', [
                    row.code
                ])
            ).rows[0].validation_rules;
            assert.deepEqual(after, {
                ...row.validation_rules,
                use_official_banlist: row.code !== 'DIGICREST'
            });
        }
        assert.equal(
            (
                await db.query(
                    `select valid_format_rules('{"use_official_banlist":true}'),valid_format_rules('{"use_official_banlist":false}') as disabled`
                )
            ).rows[0].disabled,
            true
        );
        assert.equal(
            (
                await db.query(
                    `select valid_format_rules('{"use_official_banlist":"false"}') as valid`
                )
            ).rows[0].valid,
            false
        );
        assert.equal(
            (await db.query(`select valid_format_rules('{"use_official_banlist":null}') as valid`))
                .rows[0].valid,
            false
        );
        await db.exec(
            `update deck_formats set validation_rules=jsonb_set(validation_rules,'{use_official_banlist}','true') where code='DIGICREST'`
        );
        const chosen = (
            await db.query(
                'select code,validation_rules,rules_revision from deck_formats order by code'
            )
        ).rows;
        await db.exec(banlistMigration);
        assert.deepEqual(
            (
                await db.query(
                    'select code,validation_rules,rules_revision from deck_formats order by code'
                )
            ).rows,
            chosen
        );
        await db.exec(
            `insert into deck_formats(code,name,validation_rules) values('BANDEFAULT','Default','{}'),('BANOFF','Off','{"use_official_banlist":false}')`
        );
        assert.equal(
            (await db.query(`select validation_rules from deck_formats where code='BANDEFAULT'`))
                .rows[0].validation_rules.use_official_banlist,
            true
        );
        assert.equal(
            (await db.query(`select validation_rules from deck_formats where code='BANOFF'`))
                .rows[0].validation_rules.use_official_banlist,
            false
        );
        assert.deepEqual(
            (
                await db.query(
                    "select card_payload from decklist_card_metadata where card_code='BT26-091'"
                )
            ).rows[0].card_payload,
            { rarity: 'R', type: 'Tamer' }
        );
        assert.equal(
            (
                await db.query(
                    "select card_payload from decklist_card_metadata where card_code='BT1-099'"
                )
            ).rows[0].card_payload.rarity,
            'RC'
        );
        await db.exec(
            "update decklist_card_metadata set card_payload=jsonb_set(card_payload,'{rarity}','\"RC\"') where card_code='BT26-091'"
        );
        assert.equal(
            (
                await db.query(
                    "select card_payload from decklist_card_metadata where card_code='BT26-091'"
                )
            ).rows[0].card_payload.rarity,
            'R'
        );
        await db.exec(rarityMigration);
    } finally {
        await db.close();
    }
});
