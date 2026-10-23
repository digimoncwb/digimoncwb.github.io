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
            '\n({normalizeCard,normalizeRarity,effectiveRules,validateDeck,cardEligibility,pendingFormatRules})'
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
