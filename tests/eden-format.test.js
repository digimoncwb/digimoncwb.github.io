const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

const migration = readFileSync('database/migrations/20261116000000_eden_format.sql', 'utf8');
const reviewFixes = readFileSync(
    'database/migrations/20261116020000_deckbuilder_review_fixes.sql',
    'utf8'
);
const api = vm.runInNewContext(
    stripTypeScriptTypes(readFileSync('frontend/apps/builder/editor-model.ts', 'utf8')).replace(
        /export /g,
        ''
    ) + '\n({normalizeCard,effectiveRules,validateDeck,cardEligibility,copyLimit,filterCatalog})'
);

async function edenDatabase() {
    const db = new PGlite();
    await db.exec(`create function public.valid_format_rules(value jsonb) returns boolean language sql immutable as $$select true$$;
        create table deck_formats(id bigserial primary key,code text unique,name text,description text,rules_text text,rules_url text,rules_status text default 'draft',validation_rules jsonb check(public.valid_format_rules(validation_rules)),change_note text);`);
    await db.exec(migration);
    return db;
}
const card = (code, type, rarity, name = `${code} name`) =>
    api.normalizeCard({ card_code: code, name, card_type: type, color: 'Red', rarity });

test('EDEN migration seeds a published format accepted by the rules validator and is idempotent', async () => {
    const db = await edenDatabase();
    try {
        await db.exec(migration);
        const { rows } = await db.query(
            "select rules_status,validation_rules,valid_format_rules(validation_rules) ok from deck_formats where code='EDEN'"
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0].rules_status, 'published');
        assert.equal(rows[0].ok, true);
        assert.equal(rows[0].validation_rules.rarity_exception_limit, 4);
        const valid = async (value) =>
            (await db.query('select valid_format_rules($1::jsonb) ok', [JSON.stringify(value)]))
                .rows[0].ok;
        assert.equal(await valid({ digi_egg_any_rarity: 'yes' }), false);
        assert.equal(await valid({ rarity_exception_limit: -1 }), false);
        assert.equal(await valid({ rarity_exceptions: [{ type: 'tamer' }] }), false);
        assert.equal(
            await valid({ rarity_exceptions: [{ type: 'card', rarities: ['R'] }] }),
            false
        );
        assert.equal(
            await valid({ rarity_exceptions: [{ type: 'tamer', rarities: ['R'], extra: 1 }] }),
            false
        );
        assert.equal(
            await valid({
                rarity_exceptions: [{ type: 'option', name_contains: 'x', rarities: ['P'] }]
            }),
            true
        );
    } finally {
        await db.close();
    }
});

test('EDEN admits up to 4 rare/promo exceptions, any-rarity Digi-Eggs and applies its banlist', async () => {
    const db = await edenDatabase();
    let custom;
    try {
        custom = (await db.query("select validation_rules from deck_formats where code='EDEN'"))
            .rows[0].validation_rules;
    } finally {
        await db.close();
    }
    const rules = api.effectiveRules({}, custom);
    const cards = new Map();
    const entries = [];
    const add = (c, qty = 1) => {
        cards.set(c.code, c);
        entries.push({ code: c.code, qty });
    };
    for (let i = 1; i <= 42; i++) add(card(`BT20-${String(i).padStart(3, '0')}`, 'Digimon', 'C'));
    add(card('BT10-088', 'Tamer', 'r', 'Kiriha Aonuma'), 2);
    add(card('LM-033', 'Option', 'P', 'Garnet Memory Boost!'));
    add(card('P-035', 'Option', 'sr', 'Red Memory Boost!'));
    add(card('BT20-090', 'Tamer', 'U', 'Common tamer'), 4);
    add(card('BT1-001', 'Digi-Egg', 'R'), 4);
    let result = api.validateDeck(entries, cards, rules, true);
    assert.equal(result.issues.length, 0, JSON.stringify(result.issues));
    assert.equal(result.exceptions, 4);
    assert.equal(result.raritiesValid, true);

    entries.find((e) => e.code === 'BT20-001').qty = 0;
    add(card('LM-054', 'Option', 'P', 'Treadmill Training'));
    result = api.validateDeck(entries, cards, rules, true);
    assert.equal(result.exceptions, 5);
    assert.ok(result.issues.some((issue) => issue.id === 'rarity-exceptions'));
    assert.equal(result.raritiesValid, false);

    for (const [c, reason] of [
        [card('BT1-090', 'Digimon', 'R'), 'Raridade não permitida (R)'],
        [card('BT10-097', 'Option', 'r', 'Some Rare Option'), 'Raridade não permitida (R)'],
        [card('LM-999', 'Option', 'R', 'Rare Training'), 'Raridade não permitida (R)'],
        [card('BT12-092', 'Tamer', 'R', 'Marcus Damon'), 'Carta proibida neste formato'],
        [card('BT9-103', 'Option', 'c', 'Kongou'), 'Carta proibida neste formato']
    ])
        assert.equal(api.cardEligibility(c, rules), reason, c.code);
    assert.equal(
        api.cardEligibility(card('BT10-097', 'Option', 'r', 'Blazing Memory Boost!'), rules),
        ''
    );
    assert.equal(api.copyLimit('BT1-107', rules), 1);
    assert.equal(api.copyLimit('BT6-085', rules), 4);

    const permitted = api
        .filterCatalog(
            [...cards.values(), card('BT1-090', 'Digimon', 'R')],
            {
                query: '',
                color: '',
                color2: '',
                rarities: [],
                type: '',
                level: '',
                cost: '',
                set: '',
                permitted: true
            },
            rules
        )
        .map((c) => c.code);
    assert.ok(permitted.includes('BT10-088') && permitted.includes('BT1-001'));
    assert.ok(!permitted.includes('BT1-090'));
});

test('Pauper keeps rejecting rare Digi-Eggs and rare tamers without exceptions configured', () => {
    const rules = api.effectiveRules({}, { allowed_rarities: ['C', 'U'] });
    assert.equal(
        api.cardEligibility(card('BT1-001', 'Digi-Egg', 'R'), rules),
        'Raridade não permitida (R)'
    );
    assert.equal(
        api.cardEligibility(card('BT10-088', 'Tamer', 'R'), rules),
        'Raridade não permitida (R)'
    );
});

test('EDEN ignores the official banlist so Sayo & Koh and official-limited C/U cards follow EDEN rules', async () => {
    const db = await edenDatabase();
    let custom;
    try {
        await db.exec('create table decklists(id bigserial primary key,partner_card_code text)');
        await db.exec(reviewFixes);
        await db.exec(reviewFixes);
        const row = (
            await db.query("select validation_rules,rules_text from deck_formats where code='EDEN'")
        ).rows[0];
        custom = row.validation_rules;
        assert.equal(custom.use_official_banlist, false);
        assert.equal(row.rules_text.match(/banlist oficial da Bandai não se aplica/g).length, 1);
    } finally {
        await db.close();
    }
    const official = {
        banned_codes: ['EX5-065', 'BT2-090'],
        limited_cards: { 'EX4-006': 1 },
        choice_groups: [['BT17-035', 'BT20-037']]
    };
    const rules = api.effectiveRules(official, custom);
    assert.equal(api.copyLimit('EX5-065', rules), 4);
    assert.equal(api.copyLimit('EX4-006', rules), 4);
    assert.equal(api.copyLimit('BT9-103', rules), 0);
    assert.equal(rules.choice_groups.length, 1);
    assert.equal(rules.choice_groups[0].join(), 'EX4-015,EX5-065');
});
