const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
function setup() {
    const api = vm.runInNewContext(
        stripTypeScriptTypes(readFileSync('frontend/apps/builder/editor-model.ts', 'utf8')).replace(
            /export /g,
            ''
        ) +
            '\n({normalizeCard,normalizeRarity,effectiveRules,validateDeck,cardEligibility,pendingFormatRules,adjustCopies,copyLimit})'
    );
    const entries = Array.from({ length: 50 }, (_, i) => ({
        code: `BT1-${String(i + 1).padStart(3, '0')}`,
        qty: 1
    }));
    const cards = new Map(
        entries.map(({ code }) => [
            code,
            api.normalizeCard({
                card_code: code,
                name: code + ' name',
                card_type: 'Digimon',
                color: 'Red',
                card_payload: { rarity: 'C' }
            })
        ])
    );
    return { api, entries, cards };
}
test('Official banlist is enabled by default and can be disabled without removing format restrictions or point budgets', () => {
    const { api, entries, cards } = setup();
    const base = {
        banned_codes: [entries[0].code],
        limited_cards: { [entries[1].code]: 1 },
        choice_groups: [[entries[2].code, entries[3].code]],
        unlimited_codes: ['BT6-085']
    };
    let rules = api.effectiveRules(base, {});
    assert.equal(rules.use_official_banlist, true);
    assert.equal(api.validateDeck(entries, cards, rules, true).valid, false);
    rules = api.effectiveRules(base, { use_official_banlist: false, points_limit: 100 });
    assert.equal(rules.use_official_banlist, false);
    assert.equal(rules.banned_codes.length, 0);
    assert.equal(rules.limited_cards[entries[1].code], undefined);
    assert.equal(rules.choice_groups.length, 0);
    assert.ok(rules.unlimited_codes.includes('BT6-085'));
    assert.equal(rules.copies, 4);
    assert.equal(api.copyLimit(entries[0].code, rules), 4);
    assert.equal(api.copyLimit(entries[1].code, rules), 4);
    let added = [];
    for (let i = 0; i < 5; i++) added = api.adjustCopies(added, entries[0].code, 1, rules);
    assert.equal(added[0].qty, 4);
    assert.equal(api.validateDeck(entries, cards, rules, true).valid, true);
    rules = api.effectiveRules(base, {
        use_official_banlist: false,
        points_limit: 100,
        card_points: { [entries[0].code]: { name: 'Point card', points: 101 } },
        banned_codes: [entries[4].code],
        limited_cards: { [entries[5].code]: 2 },
        choice_groups: [[entries[6].code, entries[7].code]]
    });
    assert.ok(rules.banned_codes.includes(entries[4].code));
    assert.equal(rules.limited_cards[entries[5].code], 2);
    assert.equal(rules.choice_groups.length, 1);
    const result = api.validateDeck(entries, cards, rules, true);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.id === 'points'));
    rules = api.effectiveRules(base, { use_official_banlist: true, choice_groups: [] });
    assert.equal(rules.choice_groups.length, 1);
});
test('DigiCrest permits three EX8-012 copies for 90 points despite the official one-copy restriction', () => {
    const { api, entries, cards } = setup();
    const code = 'EX8-012';
    cards.set(
        code,
        api.normalizeCard({
            card_code: code,
            name: 'Growlmon (X Antibody)',
            type: 'Digimon',
            color: 'Red',
            rarity: 'C'
        })
    );
    const base = { limited_cards: { [code]: 1 } };
    const custom = {
        use_official_banlist: false,
        points_limit: 100,
        card_points: { [code]: { name: 'Growlmon (X Antibody)', points: 30 } }
    };
    const rules = api.effectiveRules(base, custom);
    const three = api.validateDeck([{ code, qty: 3 }, ...entries.slice(3)], cards, rules, true);
    assert.equal(three.points, 90);
    assert.equal(three.valid, true);
    assert.equal(api.copyLimit(code, rules), 4);
    assert.equal(api.adjustCopies([{ code, qty: 2 }], code, 1, rules)[0].qty, 3);
    const four = api.validateDeck([{ code, qty: 4 }, ...entries.slice(4)], cards, rules, true);
    assert.equal(four.points, 120);
    assert.equal(four.valid, false);
    assert.ok(four.issues.some((issue) => issue.id === 'points'));
    assert.equal(
        api.copyLimit(code, api.effectiveRules(base, { ...custom, use_official_banlist: true })),
        1
    );
});
test('Pauper accepts only confirmed C/U rarities, including aliases and Digi-Eggs, and preserves invalid cards', () => {
    const { api, entries, cards } = setup();
    const rules = api.effectiveRules({}, { allowed_rarities: ['C', 'U'] });
    assert.equal(api.validateDeck(entries, cards, rules, true).valid, true);
    for (const rarity of ['c', 'Common', 'u', 'Uncommon']) {
        cards.set(
            entries[0].code,
            api.normalizeCard({
                card_code: entries[0].code,
                name: 'Example',
                type: 'Digimon',
                color: 'Red',
                rarity
            })
        );
        assert.equal(api.validateDeck(entries, cards, rules, true).valid, true, rarity);
    }
    const snapshot = JSON.stringify(entries);
    for (const rarity of ['R', 'SR', 'SEC', 'P', '', 'Unknown']) {
        cards.set(
            entries[0].code,
            api.normalizeCard({
                card_code: entries[0].code,
                name: 'Example',
                type: 'Digimon',
                color: 'Red',
                rarity
            })
        );
        const result = api.validateDeck(entries, cards, rules, true);
        assert.equal(result.valid, false, rarity);
        assert.ok(
            result.issues.some((issue) => issue.title.startsWith('Raridade')),
            rarity
        );
    }
    cards.delete(entries[0].code);
    const egg = api.normalizeCard({
        card_code: 'ST1-01',
        name: 'Example egg',
        type: 'Digi-Egg',
        color: 'Red',
        rarity: 'R'
    });
    cards.set(egg.code, egg);
    assert.ok(
        api
            .validateDeck([...entries, { code: egg.code, qty: 1 }], cards, rules, true)
            .issues.some((issue) => issue.codes.includes(egg.code))
    );
    assert.equal(JSON.stringify(entries), snapshot);
});
test('DigiCrest allows 100 points, rejects 101, counts each copy and Digi-Egg, and defaults unlisted cards to zero', () => {
    const { api, entries, cards } = setup();
    const card_points = Object.fromEntries(
        entries.slice(0, 5).map(({ code }) => [code, { name: code, points: 20 }])
    );
    let rules = api.effectiveRules({}, { points_limit: 100, card_points });
    let result = api.validateDeck(entries, cards, rules, true);
    assert.equal(result.points, 100);
    assert.equal(result.valid, true);
    rules = api.effectiveRules(
        {},
        {
            points_limit: 100,
            card_points: { ...card_points, [entries[5].code]: { name: 'Extra point', points: 1 } }
        }
    );
    result = api.validateDeck(entries, cards, rules, true);
    assert.equal(result.points, 101);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.id === 'points'));
    const repeated = [{ code: entries[0].code, qty: 4 }, ...entries.slice(4)];
    rules = api.effectiveRules(
        {},
        { points_limit: 100, card_points: { [entries[0].code]: { name: 'Per copy', points: 25 } } }
    );
    assert.equal(api.validateDeck(repeated, cards, rules, true).points, 100);
    const egg = api.normalizeCard({
        card_code: 'ST1-01',
        name: 'Egg',
        type: 'Digi-Egg',
        color: 'Red',
        rarity: 'U'
    });
    cards.set(egg.code, egg);
    rules = api.effectiveRules(
        {},
        { points_limit: 100, card_points: { [egg.code]: { name: 'Egg', points: 30 } } }
    );
    result = api.validateDeck([...entries, { code: egg.code, qty: 4 }], cards, rules, true);
    assert.equal(result.points, 120);
    assert.ok(result.issues.find((issue) => issue.id === 'points').codes.includes(egg.code));
});
test('Community rules retain the system banlist and copy limits; unresolved point codes prevent availability', () => {
    const { api, entries, cards } = setup();
    const rules = api.effectiveRules(
        { banned_codes: [entries[0].code], limited_cards: { [entries[1].code]: 1 } },
        { banned_codes: [], limited_cards: { [entries[1].code]: 4 }, points_limit: 100 }
    );
    assert.equal(rules.limited_cards[entries[1].code], 1);
    assert.equal(api.validateDeck(entries, cards, rules, true).valid, false);
    assert.ok(
        api
            .pendingFormatRules({
                rules_status: 'published',
                validation_rules: {
                    main_count: 50,
                    egg_max: 5,
                    copies: 4,
                    points_pending: [{ code: 'EX6', name: 'Pending', points: 2 }]
                }
            })
            .some((message) => message.includes('pontuação'))
    );
});
