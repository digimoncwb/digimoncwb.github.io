const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function renderer(imagesAvailable = true) {
    const draws = [],
        labels = [];
    const ctx = new Proxy(
        { fillText: (text) => labels.push(text), drawImage: (...args) => draws.push(args) },
        { get: (target, key) => target[key] || (() => {}) }
    );
    const api = vm.runInNewContext(
        fs
            .readFileSync('shared/posts/deck-renderer.js', 'utf8')
            .replace(/import .*?from .*?;\s*/s, '')
            .replace(/export /g, '') + '\n({deckImagePages,renderDeckPost})',
        {
            POST_FORMAT: { width: 1080, height: 1350 },
            loadPostImage: async (src) => (src ? { width: 630, height: 880, src } : null),
            loadPostCardImage: async (code, src) =>
                imagesAvailable ? { width: 630, height: 880, src } : null,
            fitPostText() {},
            paintHazard() {},
            postFooter() {}
        }
    );
    return { api, draws, labels, canvas: { getContext: () => ctx } };
}

test('Deck exports stay unavailable while any card image is missing', async () => {
    const { api, canvas } = renderer(false);
    const result = await api.renderDeckPost(
        canvas,
        [{ code: 'BT25-001', qty: 4 }],
        { name: 'Deck' },
        {},
        ''
    );
    assert.equal(result.ready, false);
    assert.match(result.message, /1 imagens não carregaram/);
});
test('Deck image pages retain all cards and quantities beyond a single post', () => {
    const { api } = renderer();
    const cards = Array.from({ length: 54 }, (_, i) => ({ code: `P-${i + 1}`, qty: i + 1 }));
    const pages = api.deckImagePages(cards);
    assert.deepEqual(
        Array.from(pages, (page) => page.length),
        [24, 24, 6]
    );
    assert.deepEqual(Array.from(pages.flat()), cards);
});
test('Deck post uses full card images, feed dimensions and shared footer space', async () => {
    const { api, canvas, draws, labels } = renderer();
    const cards = Array.from({ length: 24 }, (_, i) => ({
        code: `P-${i + 1}`,
        qty: 4,
        image: 'https://example.com/card.png'
    }));
    const result = await api.renderDeckPost(
        canvas,
        cards,
        { name: 'Meu deck', player: 'Jogador', store: 'Loja', format: 'Padrão' },
        {},
        'hazard.svg'
    );
    assert.equal(result.ready, true);
    assert.equal(canvas.width, 1080);
    assert.equal(canvas.height, 1350);
    assert.equal(draws.length, 24);
    assert.equal(labels.filter((label) => label === '×4').length, 24);
    for (const [, x, y, width, height] of draws) {
        assert.ok(x >= 64 && x + width <= 1017);
        assert.ok(y >= 273 && y + height < 1210);
        assert.ok(Math.abs(width / height - 630 / 880) < 1e-9);
    }
});
test('A superseded image render never replaces the current preview', async () => {
    const { api, canvas, draws } = renderer();
    const result = await api.renderDeckPost(
        canvas,
        [{ code: 'P-001', qty: 1 }],
        { name: 'Antigo' },
        {},
        '',
        () => false
    );
    assert.equal(result.ready, false);
    assert.equal(draws.length, 0);
    assert.equal(canvas.width, undefined);
});
test('Deck images omit the default format and card/page footer but retain custom formats', async () => {
    const { api, canvas, labels } = renderer();
    const cards = [{ code: 'BT1-010', qty: 54, image: 'https://example.com/card.png' }];
    await api.renderDeckPost(
        canvas,
        cards,
        { name: 'Deck', date: '21/10/2026', format: 'Padrão', tournament: 'Semanal' },
        {},
        ''
    );
    assert.ok(labels.includes('21/10/2026 · Semanal'));
    assert.equal(
        labels.some((text) => /Padrão|^54 cartas|^1\/1$/.test(text)),
        false
    );
    await api.renderDeckPost(canvas, cards, { name: 'Deck', format: 'Custom' }, {}, '');
    assert.ok(labels.includes('Custom'));
});
