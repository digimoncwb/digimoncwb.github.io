const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function renderer(imagesAvailable = true, loadCardImage) {
    const draws = [],
        labels = [],
        backgrounds = [],
        styledLabels = [];
    const ctx = new Proxy(
        {
            fillText: (text, x, y) => {
                labels.push(text);
                styledLabels.push({
                    text,
                    color: ctx.fillStyle,
                    font: ctx.font,
                    align: ctx.textAlign,
                    x,
                    y
                });
            },
            measureText: (text) => ({
                width: text.length * 12,
                actualBoundingBoxLeft: 1,
                actualBoundingBoxRight: text.length * 12 - 2,
                actualBoundingBoxAscent: 17,
                actualBoundingBoxDescent: 2
            }),
            drawImage: (...args) => draws.push(args),
            createLinearGradient: () => ({ addColorStop() {} })
        },
        { get: (target, key) => target[key] || (() => {}) }
    );
    const api = vm.runInNewContext(
        fs
            .readFileSync('shared/posts/deck-renderer.js', 'utf8')
            .replace(/import .*?from .*?;\s*/s, '')
            .replace(/export /g, '') +
            '\n({deckImagePages,renderDeckPost,deckLevelDistribution,deckPointsColor,paintDeckDistribution})',
        {
            POST_FORMAT: { width: 1080, height: 1350 },
            loadPostImage: async (src) => (src ? { width: 630, height: 880, src } : null),
            loadPostCardImage:
                loadCardImage ||
                (async (code, src) => (imagesAvailable ? { width: 630, height: 880, src } : null)),
            fitPostText() {},
            paintHazard: (...args) => backgrounds.push(args),
            postFooter() {}
        }
    );
    return { api, draws, labels, styledLabels, backgrounds, canvas: { getContext: () => ctx } };
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

test('Scored formats export per-card circles and the total including every copy', async () => {
    const { api, canvas, labels } = renderer();
    await api.renderDeckPost(
        canvas,
        [
            { code: 'EX1-066', qty: 2, points: 20 },
            { code: 'BT9-098', qty: 4, points: 15 },
            { code: 'BT1-010', qty: 4 }
        ],
        { name: 'DigiCrest' },
        { pointsLimit: 100 },
        ''
    );
    assert.ok(labels.includes('100pts'));
    assert.equal(labels.includes('PONTUAÇÃO DO DECK'), false);
    assert.ok(labels.includes('20'));
    assert.ok(labels.includes('15'));
    assert.equal(labels.includes('0'), false);
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

test('Deck watermark centers its ring between header and footer and fits the content area', async () => {
    const { api, canvas, backgrounds } = renderer();
    await api.renderDeckPost(
        canvas,
        [{ code: 'EX14-012', qty: 4 }],
        { name: 'Deck' },
        { accent: '#66a7f5', opacity: 0.12 },
        'hazard.svg'
    );
    assert.equal(backgrounds.length, 1);
    const [, , x, y, size, accent, opacity] = backgrounds[0];
    assert.ok(Math.abs(x + (size * 137) / 274 - canvas.width / 2) < 1e-9);
    assert.ok(Math.abs(y + (size * 128) / 274 - (244 + 1240) / 2) < 1e-9);
    assert.ok(size > 850 && size < 952);
    assert.ok(x >= 64 && x + size <= canvas.width - 64);
    assert.ok(y >= 244 && y + size <= 1240);
    assert.equal(accent, '#66a7f5');
    assert.equal(opacity, 0.12);
    await api.renderDeckPost(
        canvas,
        [{ code: 'EX14-012', qty: 4 }],
        { name: 'Deck' },
        { showBackgroundIcon: false },
        'hazard.svg'
    );
    assert.equal(backgrounds.length, 1);
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
    assert.ok(labels.includes('CUSTOM'));
});

test('Deck format has a label and only its name uses the accent color', async () => {
    const { api, canvas, styledLabels } = renderer();
    await api.renderDeckPost(
        canvas,
        [{ code: 'BT1-001', qty: 4, points: 25 }],
        { name: 'Fenri', format: 'DigiCrest', collection: 'BT24' },
        { accent: '#66a7f5', pointsLimit: 100 },
        'hazard.svg'
    );
    assert.ok(styledLabels.some(({ text, color }) => text === 'FORMATO ' && color === '#b4c1d2'));
    assert.ok(styledLabels.some(({ text }) => text === 'DECKLIST · BT24'));
    assert.equal(
        styledLabels.some(({ text }) => text.includes('DIGIMON CARD GAME')),
        false
    );
    assert.ok(styledLabels.some(({ text, color }) => text === 'DIGICREST' && color === '#66a7f5'));
    const points = styledLabels.find(({ text }) => text === '100pts');
    const formatName = styledLabels.find(({ text }) => text === 'DIGICREST');
    assert.equal(points.color, '#42d392');
    assert.equal(points.y, formatName.y);
    assert.ok(points.x > formatName.x);
    const format = styledLabels.find(({ text }) => text === 'FORMATO ');
    assert.equal(
        styledLabels.find(({ text }) => text === 'LEVEL DISTRIBUTION').font,
        format.font
    );
});

test('Exported points use the deckbuilder color thresholds including the 130 percent boundary', () => {
    const { api } = renderer();
    for (const [points, color] of [
        [0, '#79adff'],
        [99, '#79adff'],
        [100, '#42d392'],
        [101, '#f6c541'],
        [129, '#f6c541'],
        [130, '#ff747b'],
        [150, '#ff747b']
    ]) {
        assert.equal(api.deckPointsColor(points, 100), color);
    }
});

test('Distribution descriptions share a centered column and have more vertical spacing', async () => {
    const { api, canvas, styledLabels } = renderer();
    await api.renderDeckPost(
        canvas,
        [
            { code: 'BT1-001', qty: 4, level: 2, type: 'digi-egg' },
            { code: 'BT1-002', qty: 3, type: 'tamer' },
            { code: 'BT1-003', qty: 2, type: 'option' }
        ],
        { name: 'Deck' },
        {},
        ''
    );
    const rows = ['LV.2', 'TAMER', 'OPTION'].map((text) =>
        styledLabels.find((label) => label.text === text)
    );
    for (const row of rows) {
        assert.equal(row.x, 724);
        assert.equal(row.align, 'center');
    }
    assert.equal(rows[1].y - rows[0].y, 21);
    assert.equal(rows[2].y - rows[1].y, 21);
});

test('Scored and unscored cards keep quantities at bottom right and points at top right', async () => {
    const { api, canvas, draws, styledLabels } = renderer();
    await api.renderDeckPost(
        canvas,
        [
            { code: 'BT1-001', qty: 4, points: 30 },
            { code: 'BT1-002', qty: 3 },
            { code: 'BT1-003', qty: 2, points: 0 }
        ],
        { name: 'Deck' },
        {},
        'hazard.svg'
    );
    for (const [index, quantity] of ['×4', '×3', '×2'].entries()) {
        const [, x, y, width, height] = draws[index];
        const label = styledLabels.find((label) => label.text === quantity);
        assert.ok(Math.abs(label.x - (x + width - 22)) < 1e-9);
        assert.ok(Math.abs(label.y - (y + height - 10)) < 1e-9);
    }
    for (const [index, points] of [
        [0, '30'],
        [2, '0']
    ]) {
        const [, x, y, width] = draws[index];
        const label = styledLabels.find((label) => label.text === points);
        const inkWidth = points.length * 12 - 1;
        assert.ok(Math.abs(label.x - 1 + inkWidth / 2 - (x + width - 32)) < 1e-9);
        assert.equal(label.y - 17 + (17 + 2) / 2, y + 32);
    }
});

test('Level distribution counts every copy, separates non-Digimon and preserves colors', () => {
    const { api } = renderer();
    const groups = api.deckLevelDistribution([
        { qty: 4, type: 'digimon', level: 3, colors: ['purple'] },
        { qty: 2, type: 'digimon', level: 3, colors: ['purple', 'red'] },
        { qty: 4, type: 'digi-egg', colors: ['blue'] },
        { qty: 3, type: 'tamer', colors: ['blue'] },
        { qty: 2, type: 'option', colors: ['white'] },
        { qty: 1, type: 'unknown', colors: [] },
        { qty: 0, type: 'digimon', level: 7 }
    ]);
    assert.deepEqual(
        Array.from(groups, (row) => [row.label, row.total]),
        [
            ['LV.-', 1],
            ['Lv.2', 4],
            ['Lv.3', 6],
            ['Tamer', 3],
            ['Option', 2]
        ]
    );
    assert.deepEqual(Array.from(groups[2].segments[1].colors), ['purple', 'red']);
});

test('Distribution uses the entire deck on every page and can be hidden', async () => {
    const cards = Array.from({ length: 25 }, (_, index) => ({
        code: `P-${index + 1}`,
        qty: 2,
        level: 3,
        type: 'digimon',
        colors: ['blue']
    }));
    const { api, canvas, labels } = renderer();
    await api.renderDeckPost(canvas, cards, { name: 'Deck' }, { page: 1 }, '');
    assert.ok(labels.includes('LEVEL DISTRIBUTION'));
    assert.ok(labels.includes('LV.3'));
    assert.ok(labels.includes('50'));
    const hidden = renderer();
    await hidden.api.renderDeckPost(
        hidden.canvas,
        cards,
        { name: 'Deck' },
        { showLevelDistribution: false },
        ''
    );
    assert.equal(hidden.labels.includes('LEVEL DISTRIBUTION'), false);
});

test('Dual cards count toward their Digimon level alongside regular Digimon', () => {
    const { api } = renderer();
    const groups = api.deckLevelDistribution([
        { name: 'Beelstarmon // Fly Bullet', type: 'dual', level: 6, qty: 3, colors: ['purple'] },
        { type: 'digimon', level: 6, qty: 4, colors: ['red'] },
        { type: 'dual', level: 4, qty: 2, colors: ['blue'] },
        { type: 'dual', level: null, qty: 1, colors: ['purple'] }
    ]);
    assert.deepEqual(
        Array.from(groups, (row) => [row.label, row.total]),
        [
            ['LV.-', 1],
            ['Lv.4', 2],
            ['Lv.6', 7]
        ]
    );
    assert.equal(
        groups.some((row) => row.key === 'dual'),
        false
    );
});

test('Distribution groups colors in the requested order for tiles and dense bars', () => {
    const { api } = renderer();
    const colors = [
        ['white'],
        ['purple', 'red'],
        ['purple'],
        ['red'],
        ['blue'],
        ['black'],
        ['red', 'red'],
        ['green'],
        ['yellow']
    ];
    for (const qty of [1, 100]) {
        const fills = [];
        const ctx = new Proxy(
            {
                fillRect: () => fills.push(ctx.fillStyle),
                measureText: (text) => ({ width: text.length * 12 })
            },
            {
                get: (target, key) => target[key] || (() => {})
            }
        );
        const groups = api.deckLevelDistribution(
            colors.map((colors) => ({ type: 'digimon', level: 3, qty, colors }))
        );
        api.paintDeckDistribution(ctx, groups, '#66a7f5');
        assert.deepEqual(fills, [
            '#e60012',
            '#e60012',
            '#328bd6',
            '#f1cc5b',
            '#4edb9b',
            '#78838f',
            '#834bd1',
            '#e2e8ee',
            '#ed3b98'
        ]);
        assert.deepEqual(Array.from(groups[0].segments[0].colors), ['white']);
    }
});

test('Preview loads eight cards concurrently and a slow card does not block later cards', async () => {
    const pending = new Map(),
        started = [],
        progress = [];
    const { api, canvas, draws } = renderer(true, (code, src) => {
        started.push(code);
        return new Promise((resolve) =>
            pending.set(code, () => resolve({ width: 630, height: 880, src }))
        );
    });
    const cards = Array.from({ length: 12 }, (_, index) => ({
        code: `P-${index + 1}`,
        qty: 4,
        image: `card-${index}`
    }));
    const rendering = api.renderDeckPost(
        canvas,
        cards,
        { name: 'Deck' },
        { onProgress: (done, total) => progress.push([done, total]) },
        ''
    );
    assert.equal(started.length, 8);
    for (const card of cards.slice(1, 8)) pending.get(card.code)();
    await new Promise(setImmediate);
    assert.equal(started.length, 12);
    for (const card of cards.slice(8)) pending.get(card.code)();
    pending.get(cards[0].code)();
    assert.equal((await rendering).ready, true);
    assert.deepEqual(
        draws.map(([image]) => image.src),
        cards.map((card) => card.image)
    );
    assert.equal(progress.length, 12);
    assert.deepEqual(progress.at(-1), [12, 12]);
});

test('Closing or changing the preview stops queued image requests and progress updates', async () => {
    const pending = [],
        progress = [];
    let current = true,
        requests = 0;
    const { api, canvas, draws } = renderer(true, () => {
        requests++;
        return new Promise((resolve) => pending.push(resolve));
    });
    const cards = Array.from({ length: 24 }, (_, index) => ({ code: `P-${index + 1}`, qty: 4 }));
    const rendering = api.renderDeckPost(
        canvas,
        cards,
        { name: 'Deck' },
        { onProgress: () => progress.push(1) },
        '',
        () => current
    );
    assert.equal(requests, 8);
    current = false;
    pending.forEach((resolve) => resolve(null));
    assert.equal((await rendering).ready, false);
    assert.equal(requests, 8);
    assert.equal(progress.length, 0);
    assert.equal(draws.length, 0);
});
