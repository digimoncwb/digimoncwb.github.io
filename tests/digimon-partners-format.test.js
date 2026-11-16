const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

const migration = readFileSync(
    'database/migrations/20261116010000_digimon_partners_format.sql',
    'utf8'
);
const api = vm.runInNewContext(
    stripTypeScriptTypes(readFileSync('frontend/apps/builder/editor-model.ts', 'utf8')).replace(
        /export /g,
        ''
    ) + '\n({normalizeCard,effectiveRules,validateDeck,copyLimit,adjustCopies,partnerProblem})'
);
const typeId = '10000000-0000-0000-0000-000000000001';
const reviewFixes = readFileSync(
    'database/migrations/20261116020000_deckbuilder_review_fixes.sql',
    'utf8'
);

async function partnersDatabase() {
    const db = new PGlite();
    await db.exec(`create role anon; create role authenticated;
        create function public.valid_format_rules(value jsonb) returns boolean language sql immutable as $$select true$$;
        create function site_accounts_enabled() returns boolean language sql as $$select false$$;
        create function site_is_member() returns boolean language sql as $$select true$$;
        create function site_is_admin() returns boolean language sql as $$select true$$;
        create schema auth; create function auth.uid() returns uuid language sql as $$select null::uuid$$;
        create table user_profiles(user_id uuid,player_id uuid);
        create table decks(id uuid primary key,name text,is_active boolean default true);
        create table players(id uuid primary key,name text);
        create table deck_formats(id bigserial primary key,code text unique,name text,description text,rules_text text,rules_url text,rules_status text default 'draft',rules_revision int default 1,validation_rules jsonb check(public.valid_format_rules(validation_rules)),change_note text);
        create table tournament(id bigint primary key,deck_format_id bigint,store_id uuid,tournament_date date);
        create table tournament_results(id uuid primary key,tournament_id bigint,store_id uuid,tournament_date date,deck_id uuid);
        create table decklists(id bigserial primary key,name text,deck_format_id bigint,tournament_result_id uuid unique,source text,draft_cards jsonb,draft_revision int default 0,format_rules_revision int,archetype_id uuid,creator_player_id uuid,owner_user_id uuid,updated_at timestamptz default now());
        create function valid_deck_draft_cards(value jsonb) returns boolean language sql as $$select jsonb_typeof(value)='array'$$;
        create function save_deck_draft(bigint,uuid,text,bigint,jsonb,integer,uuid,uuid) returns jsonb language sql as $$select null::jsonb$$;
        insert into decks values('${typeId}','Registered type',true);`);
    await db.exec(migration);
    return db;
}
const card = (code, type, level, name = `${code} name`) =>
    api.normalizeCard({
        card_code: code,
        name,
        card_type: type,
        card_level: level,
        color: 'Red',
        rarity: 'C'
    });

test('Digimon Partners migration seeds the format, validates new keys and saves the partner', async () => {
    const db = await partnersDatabase();
    try {
        await db.exec(migration);
        const format = (
            await db.query(
                "select id,validation_rules,valid_format_rules(validation_rules) ok from deck_formats where code='PARTNERS'"
            )
        ).rows[0];
        assert.equal(format.ok, true);
        assert.equal(format.validation_rules.main_count, 80);
        assert.equal(format.validation_rules.partner_level, 6);
        const valid = async (value) =>
            (await db.query('select valid_format_rules($1::jsonb) ok', [JSON.stringify(value)]))
                .rows[0].ok;
        assert.equal(await valid({ egg_copies: 0 }), false);
        assert.equal(await valid({ partner_level: null, egg_copies: null }), true);
        assert.equal(await valid({ use_official_limits: 'no' }), false);
        assert.equal(
            (await db.query("select count(*)::int n from pg_proc where proname='save_deck_draft'"))
                .rows[0].n,
            1
        );
        const saved = (
            await db.query(
                `select save_deck_draft(null,null,'Partners',${format.id},'[]',0,'${typeId}',null,'BT1-084') result`
            )
        ).rows[0].result;
        assert.equal(saved.partner_card_code, 'BT1-084');
        await db.query(
            `select save_deck_draft(${saved.id},null,'Partners',${format.id},'[]',1,'${typeId}')`
        );
        assert.equal(
            (await db.query('select partner_card_code from decklists')).rows[0].partner_card_code,
            null
        );
        await assert.rejects(
            db.query(
                `select save_deck_draft(null,null,'Bad',${format.id},'[]',0,'${typeId}',null,'not a code')`
            ),
            /partner inválido/
        );
    } finally {
        await db.close();
    }
});

test('Digimon Partners applies 80/2 copies, 8 eggs at 4 copies, only official bans and a level 6 partner', async () => {
    const db = await partnersDatabase();
    let custom;
    try {
        custom = (await db.query("select validation_rules from deck_formats where code='PARTNERS'"))
            .rows[0].validation_rules;
    } finally {
        await db.close();
    }
    const base = {
        banned_codes: ['BT2-090'],
        limited_cards: { 'BT3-054': 1 },
        choice_groups: [['EX2-007', 'BT17-035']]
    };
    const rules = api.effectiveRules(base, custom);
    assert.equal(api.copyLimit('BT3-054', rules), 2);
    assert.equal(api.copyLimit('BT2-090', rules), 0);
    assert.equal(api.copyLimit('BT9-112', rules), 1);
    assert.equal(rules.choice_groups.length, 1);

    const cards = new Map();
    const entries = [];
    const add = (c, qty) => {
        cards.set(c.code, c);
        entries.push({ code: c.code, qty });
    };
    for (let i = 1; i <= 40; i++) add(card(`BT20-${String(i).padStart(3, '0')}`, 'Digimon', 4), 2);
    add(card('BT1-001', 'Digi-Egg', 2), 4);
    add(card('BT1-002', 'Digi-Egg', 2), 4);
    const partner = card('BT1-084', 'Digimon', 6, 'Omnimon');
    cards.set(partner.code, partner);
    assert.equal(api.copyLimit('BT1-001', rules, cards.get('BT1-001')), 4);
    assert.equal(
        api
            .adjustCopies(entries, 'BT1-001', 1, rules, cards.get('BT1-001'))
            .find((e) => e.code === 'BT1-001').qty,
        4
    );

    let result = api.validateDeck(entries, cards, rules, true, 'BT1-084');
    assert.equal(result.issues.length, 0, JSON.stringify(result.issues));
    assert.equal(result.main, 80);
    assert.equal(result.eggs, 8);

    entries[0].qty = 3;
    assert.ok(
        api.validateDeck(entries, cards, rules, true).issues.some((i) => i.id === 'copies-BT20-001')
    );
    entries[0].qty = 2;

    cards.set('BT20-001', card('BT20-001', 'Digimon', 6, 'Omnimon'));
    assert.match(api.partnerProblem('BT1-084', entries, cards, rules), /não pode estar no deck/);
    cards.set('BT20-001', card('BT20-001', 'Digimon', 4));
    cards.set('BT1-090', card('BT1-090', 'Digimon', 5));
    assert.match(api.partnerProblem('BT1-090', entries, cards, rules), /nível 6/);
    assert.match(
        api.partnerProblem('BT1-084', entries, cards, api.effectiveRules({}, {})),
        /não usa partner/
    );
    result = api.validateDeck(entries, cards, rules, true, 'BT1-090');
    assert.ok(result.issues.some((i) => i.id === 'partner'));
});

test('Copying a community deck keeps its partner', async () => {
    const db = await partnersDatabase();
    try {
        await db.exec(reviewFixes);
        const id = (
            await db.query(
                "insert into decklists(name,deck_format_id,draft_cards,partner_card_code) values('Original',1,'[]','BT1-084') returning id"
            )
        ).rows[0].id;
        const copy = (await db.query('select copy_community_deck($1) id', [id])).rows[0].id;
        const saved = (
            await db.query('select name,partner_card_code from decklists where id=$1', [copy])
        ).rows[0];
        assert.equal(saved.partner_card_code, 'BT1-084');
        assert.equal(saved.name, 'ORIGINAL (CÓPIA)');
    } finally {
        await db.close();
    }
});
