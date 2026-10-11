const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const renderer = vm.runInNewContext(
    fs.readFileSync('shared/posts/renderer.js', 'utf8').replace(/export /g, '') +
        '\n({ renderPost, POST_FORMAT, paintSocialIcon, postEventTitle, postFooter })',
    {
        Path2D: class {
            constructor(path) {
                this.path = path;
            }
        }
    }
);

test('compact footer leaves comfortable margins while retaining community and social handles', () => {
    for (const dividerY of [1164, 1240]) {
        const texts = [];
        const ctx = new Proxy(
            {
                measureText(text) {
                    const size = Number(this.font.match(/([\d.]+)px/)[1]);
                    return {
                        width: text.length * size * 0.55,
                        actualBoundingBoxAscent: size * 0.75,
                        actualBoundingBoxDescent: size * 0.2
                    };
                },
                fillText(text, x, y) {
                    const metrics = this.measureText(text);
                    const size = Number(this.font.match(/([\d.]+)px/)[1]);
                    texts.push({
                        text,
                        font: this.font,
                        x,
                        top:
                            y -
                            (this.textBaseline === 'middle'
                                ? size / 2
                                : metrics.actualBoundingBoxAscent),
                        bottom:
                            y +
                            (this.textBaseline === 'middle'
                                ? size / 2
                                : metrics.actualBoundingBoxDescent)
                    });
                }
            },
            { get: (target, key) => (key in target ? target[key] : () => {}) }
        );
        renderer.postFooter(ctx, null, '#66a7f5', dividerY);
        assert.ok(texts.some((row) => row.text === 'DIGIMON CWB'));
        assert.ok(texts.some((row) => row.text === 'Digimon Card Game Community'));
        assert.ok(texts.some((row) => row.text === '@digimoncwb'));
        assert.ok(texts.some((row) => row.text === '@digimon_cwb'));
        assert.ok(!texts.some((row) => row.text === 'Follow us:'));
        assert.match(texts.find((row) => row.text === 'DIGIMON CWB').font, /34px/);
        assert.ok(texts.every((row) => row.top >= dividerY + 20 && row.bottom <= 1350 - 20));
    }
});
test('post titles use the tournament type with canonical event names', () => {
    for (const title of [
        'Locals',
        'Online',
        'Evo Cup',
        'Store Championship',
        'Regulation Battle',
        'Release Event'
    ]) {
        assert.equal(renderer.postEventTitle({ title }), title);
    }
    assert.equal(renderer.postEventTitle({ title: 'Semanal' }), 'Locals');
    assert.equal(renderer.postEventTitle({ title: 'release_event' }), 'Release Event');
});

test('podium and weekly posts export at feed dimensions with aligned community and Instagram branding', async () => {
    const event = {
        id: '1',
        isoDate: '2026-10-02',
        date: '02/10/2026',
        day: 'SEX',
        title: 'Semanal',
        store: 'Loja',
        logo: '',
        format: 'BT26',
        players: 2,
        deckless: false,
        winner: { name: 'Ana', deck: 'Deck A', image: '' },
        podium: [
            { name: 'Ana', deck: 'Deck A', image: '' },
            { name: 'Bia', deck: 'Deck B', image: '' },
            null
        ],
        results: [
            { name: 'Ana', deck: 'Deck A' },
            { name: 'Bia', deck: 'Deck B' }
        ]
    };
    for (const template of ['podium', 'weekly']) {
        for (const language of ['pt-BR', 'en']) {
            const texts = [],
                backgrounds = [];
            const ctx = new Proxy(
                {
                    measureText: (text) => ({
                        width: String(text).length * 12,
                        actualBoundingBoxAscent: 20,
                        actualBoundingBoxDescent: 5
                    }),
                    fillText(text, x, y, maxWidth) {
                        texts.push({
                            text,
                            x,
                            y,
                            maxWidth,
                            align: this.textAlign,
                            font: this.font
                        });
                    },
                    fillRect(...args) {
                        backgrounds.push(args);
                    }
                },
                { get: (target, key) => (key in target ? target[key] : () => {}) }
            );
            const canvas = { width: 640, height: 480, getContext: () => ctx };
            const result = await renderer.renderPost(
                canvas,
                {
                    template,
                    tournament: '1',
                    title: 'Semanal',
                    accent: '#ef646b',
                    language,
                    week: '2026-09-28',
                    page: 0
                },
                [event],
                '',
                () => true
            );
            assert.equal(result.ready, true);
            assert.equal(canvas.width, 1080);
            assert.equal(canvas.height, 1350);
            assert.equal(canvas.width / canvas.height, 4 / 5);
            assert.ok(backgrounds.some((rect) => rect.join(',') === '0,0,1080,1350'));
            const name = texts.find((item) => item.text === 'DIGIMON CWB');
            const subtitle = texts.find((item) => item.text === 'Digimon Card Game Community');
            const social = texts.find((item) => item.text === '@digimoncwb');
            const xProfile = texts.find((item) => item.text === '@digimon_cwb');
            assert.equal(xProfile.align, 'left');
            assert.equal(xProfile.x, social.x);
            assert.equal(xProfile.font, social.font);
            assert.ok(!texts.some((item) => item.text === 'Follow us:'));
            const icons = [];
            renderer.paintSocialIcon(
                {
                    save() {},
                    restore() {},
                    translate() {},
                    scale() {},
                    fill(path) {
                        icons.push(path.path);
                    }
                },
                'instagram',
                0,
                0,
                26
            );
            renderer.paintSocialIcon(
                {
                    save() {},
                    restore() {},
                    translate() {},
                    scale() {},
                    fill(path) {
                        icons.push(path.path);
                    }
                },
                'x',
                0,
                0,
                26
            );
            assert.ok(icons.every((path) => path.length > 100));
            assert.ok(!texts.some((item) => item.text.startsWith('CURITIBA') && item.y > 1100));
            assert.equal(name.x, subtitle.x);
            assert.equal(name.align, 'left');
            assert.equal(subtitle.maxWidth, undefined);
            const brandCenter = (name.y - 20 + subtitle.y + 5) / 2;
            const socialCenter = (social.y + xProfile.y) / 2;
            assert.ok(Math.abs(brandCenter - socialCenter) < 3);
            assert.ok(texts.every((item) => item.y < canvas.height));
            assert.ok(texts.some((item) => item.text === '02/Oct'));
            if (template === 'podium') {
                assert.ok(texts.some((item) => item.text === 'WINNER'));
                assert.ok(texts.some((item) => item.text.includes('PLAYERS')));
            } else {
                assert.ok(texts.some((item) => item.text === 'WEEKLY RECAP'));
                assert.ok(texts.some((item) => item.text === 'TOURNAMENT / STORE'));
                assert.ok(texts.some((item) => item.text === '2 players' && item.x === 805));
                assert.ok(texts.some((item) => item.text === '28/Sep — 04/Oct'));
            }
        }
    }
    assert.equal(renderer.POST_FORMAT.mime, 'image/png');
});
