import {
    POST_FORMAT,
    loadPostImage,
    loadPostCardImage,
    fitPostText,
    paintHazard,
    postFooter
} from './renderer.js';

export const DECK_IMAGE_PAGE_SIZE = 24;
export function deckPointsColor(points, limit) {
    return points < limit
        ? '#79adff'
        : points === limit
          ? '#42d392'
          : points < limit * 1.3
            ? '#f6c541'
            : '#ff747b';
}
export function deckLevelDistribution(cards) {
    const groups = new Map();
    for (const card of cards) {
        if (!Number.isInteger(card.qty) || card.qty <= 0) continue;
        const level = card.level || (card.type === 'digi-egg' ? 2 : null);
        const key = ['tamer', 'option'].includes(card.type)
            ? card.type
            : Number.isInteger(level) && level > 0
              ? `level-${level}`
              : 'unknown';
        if (!groups.has(key))
            groups.set(key, {
                key,
                label: key.startsWith('level-')
                    ? `Lv.${level}`
                    : { tamer: 'Tamer', option: 'Option', unknown: 'LV.-' }[key],
                total: 0,
                segments: []
            });
        const group = groups.get(key);
        group.total += card.qty;
        group.segments.push({ qty: card.qty, colors: card.colors || [] });
    }
    const rank = (key) =>
        key.startsWith('level-')
            ? Number(key.slice(6))
            : { tamer: 100, option: 101, unknown: 0 }[key];
    return [...groups.values()].sort((a, b) => rank(a.key) - rank(b.key));
}
export function paintDeckDistribution(ctx, groups, accent) {
    const palette = {
        red: '#e60012',
        blue: '#328bd6',
        yellow: '#f1cc5b',
        green: '#4edb9b',
        purple: '#834bd1',
        black: '#78838f',
        white: '#e2e8ee',
        multi: '#ed3b98'
    };
    const colorOrder = ['red', 'blue', 'yellow', 'green', 'black', 'purple', 'white', 'multi'];
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = accent;
    ctx.font = '700 17px Arial';
    const titleX = 724 - ctx.measureText('OPTION').width / 2;
    ctx.fillText('DISTRIBUIÇÃO POR LEVEL', titleX, 65, 320);
    const max = Math.max(1, ...groups.map((group) => group.total));
    const step = Math.min(21, 152 / Math.max(1, groups.length));
    const tile = Math.min(12, 194 / max - 2);
    groups.forEach((group, index) => {
        const y = 80 + index * step;
        ctx.font = '700 17px Arial';
        ctx.fillStyle = '#b4c1d2';
        ctx.textAlign = 'center';
        ctx.fillText(group.label.toUpperCase(), 724, y + 11, 72);
        ctx.textAlign = 'left';
        let offset = 0;
        const segments = group.segments
            .map((segment) => {
                const colors = [...new Set(segment.colors)];
                const key = colors.length > 1 ? 'multi' : colors[0];
                const rank = colorOrder.indexOf(key);
                return {
                    ...segment,
                    color: palette[key] || '#78838f',
                    rank: rank < 0 ? colorOrder.length : rank
                };
            })
            .sort((a, b) => a.rank - b.rank);
        for (const segment of segments) {
            const color = segment.color;
            if (tile >= 3) {
                for (let copy = 0; copy < segment.qty; copy++) {
                    const x = 780 + offset * (tile + 2);
                    ctx.save();
                    ctx.beginPath();
                    ctx.roundRect(x, y, tile, 12, 2);
                    ctx.clip();
                    ctx.fillStyle = color;
                    ctx.fillRect(x, y, tile, 12);
                    ctx.restore();
                    offset++;
                }
            } else {
                const x = 780 + (offset * 194) / max;
                ctx.fillStyle = color;
                ctx.fillRect(x, y, (segment.qty * 194) / max, 12);
                offset += segment.qty;
            }
        }
        ctx.fillStyle = '#c0c9d1';
        ctx.font = '700 17px Arial';
        const end = tile >= 3 ? 780 + group.total * (tile + 2) : 780 + (group.total * 194) / max;
        ctx.fillText(String(group.total), end + 6, y + 11, 32);
    });
    ctx.restore();
}
export function paintDeckPoints(ctx, points, x, y) {
    const text = String(points);
    ctx.save();
    ctx.fillStyle = '#050505';
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f02732';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#ffe52f';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    fitPostText(ctx, text, 40, 32, 900, 12);
    const metrics = ctx.measureText(text);
    // Center the visible glyphs rather than the font's line box.
    ctx.fillText(
        text,
        x + (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2,
        y + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2
    );
    ctx.restore();
}
export function deckImagePages(cards) {
    const pages = [];
    for (let i = 0; i < cards.length; i += DECK_IMAGE_PAGE_SIZE)
        pages.push(cards.slice(i, i + DECK_IMAGE_PAGE_SIZE));
    return pages;
}

export async function renderDeckPost(
    canvas,
    cards,
    metadata,
    settings,
    hazardUrl,
    isCurrent = () => true
) {
    const pages = deckImagePages(cards);
    const page = Math.max(0, Math.min(pages.length - 1, Number(settings.page) || 0));
    const visible = pages[page] || [];
    if (!visible.length) return { ready: false, message: 'Adicione cartas para gerar a imagem.' };
    if (!isCurrent()) return { ready: false, message: '' };
    const [hazard, images] = await Promise.all([
        loadPostImage(hazardUrl),
        (async () => {
            const loaded = new Array(visible.length);
            let next = 0,
                completed = 0;
            await Promise.all(
                Array.from({ length: Math.min(8, visible.length) }, async () => {
                    while (isCurrent()) {
                        const index = next++;
                        if (index >= visible.length) return;
                        const card = visible[index];
                        loaded[index] = await loadPostCardImage(card.code, card.image);
                        completed++;
                        if (isCurrent()) settings.onProgress?.(completed, visible.length);
                    }
                })
            );
            return loaded;
        })()
    ]);
    if (!isCurrent()) return { ready: false, message: '' };
    canvas.width = POST_FORMAT.width;
    canvas.height = POST_FORMAT.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível criar a prévia.');
    ctx.fillStyle = '#242629';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const accent = settings.accent || '#ef646b';
    if (settings.showBackgroundIcon !== false) {
        const contentTop = 244,
            contentBottom = 1240,
            size = Math.min(canvas.width - 128, contentBottom - contentTop) * 0.94;
        // Center the symbol's ring (137, 128 in its 274-square viewBox)
        // in the space between the header and footer.
        paintHazard(
            ctx,
            hazard,
            canvas.width / 2 - (size * 137) / 274,
            (contentTop + contentBottom) / 2 - (size * 128) / 274,
            size,
            accent,
            Number(settings.opacity ?? 0.08)
        );
    }
    ctx.textAlign = 'left';
    ctx.font = '700 17px Arial';
    const showDistribution = settings.showLevelDistribution !== false;
    const titleWidth = showDistribution ? 604 : 892;
    const formatKey = String(metadata.format || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
    const format = ['padrao', 'standard'].includes(formatKey) ? '' : metadata.format;
    const total = cards.reduce((sum, card) => sum + card.qty * (card.points || 0), 0);
    const pointsLabel = settings.pointsLimit != null ? `${total}pts` : '';
    const gameLabel = ['DECKLIST', metadata.collection].filter(Boolean).join(' · ');
    const gameWidth = ctx.measureText(gameLabel).width;
    const formatLabel = String(format || '').toUpperCase();
    const prefixWidth = ctx.measureText('FORMATO ').width;
    const separatorWidth = ctx.measureText(' · ').width;
    const badgeWidth = format ? prefixWidth + ctx.measureText(formatLabel).width : 0;
    const formatEnd = gameWidth + (format ? separatorWidth + badgeWidth : 0);
    const headingWidth =
        formatEnd + (pointsLabel ? separatorWidth + ctx.measureText(pointsLabel).width : 0);
    ctx.save();
    ctx.translate(64, 65);
    ctx.scale(Math.min(1, titleWidth / (headingWidth || 1)), 1);
    ctx.font = '700 17px Arial';
    ctx.fillStyle = '#b4c1d2';
    ctx.fillText(gameLabel, 0, 0);
    if (format) {
        const badgeX = gameWidth + separatorWidth;
        ctx.font = '700 17px Arial';
        ctx.fillStyle = '#b4c1d2';
        ctx.fillText(' · ', gameWidth, 0);
        ctx.fillText('FORMATO ', badgeX, 0);
        ctx.fillStyle = accent;
        ctx.fillText(formatLabel, badgeX + prefixWidth, 0);
    }
    if (pointsLabel) {
        ctx.fillStyle = '#b4c1d2';
        ctx.fillText(' · ', formatEnd, 0);
        ctx.fillStyle = deckPointsColor(total, settings.pointsLimit);
        ctx.fillText(pointsLabel, formatEnd + separatorWidth, 0);
    }
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    fitPostText(ctx, metadata.name, titleWidth, 64, 800, 26);
    ctx.fillText(metadata.name, 64, 131, titleWidth);
    ctx.fillStyle = '#c0c9d1';
    const byline = [metadata.player ? `by ${metadata.player}` : '', metadata.store]
        .filter(Boolean)
        .join(' · ');
    fitPostText(ctx, byline, titleWidth, 30, 500, 20);
    ctx.fillText(byline, 64, 175, titleWidth);
    ctx.font = '500 21px Arial';
    ctx.fillStyle = '#aeb8c2';
    const details = metadata.tournament || '';
    ctx.fillText([metadata.date, details].filter(Boolean).join(' · '), 64, 204, titleWidth);
    if (showDistribution) paintDeckDistribution(ctx, deckLevelDistribution(cards), accent);
    ctx.fillStyle = accent;
    ctx.fillRect(64, 242, 952, 2);
    const columns = 6,
        gap = 16,
        width = (952 - gap * (columns - 1)) / columns;
    const height = (width * 88) / 63;
    const rowHeight = height + 30;
    visible.forEach((card, index) => {
        const x = 64 + (index % columns) * (width + gap),
            y = 273 + Math.floor(index / columns) * rowHeight;
        ctx.fillStyle = '#151a1f';
        ctx.fillRect(x, y, width, height);
        if (images[index]) {
            const image = images[index],
                scale = Math.min(width / image.width, height / image.height);
            ctx.drawImage(
                image,
                x + (width - image.width * scale) / 2,
                y + (height - image.height * scale) / 2,
                image.width * scale,
                image.height * scale
            );
        } else {
            ctx.fillStyle = '#d2d7dc';
            ctx.font = '600 17px Arial';
            ctx.fillText(card.code, x + 8, y + height / 2, width - 16);
        }
        const scored = Number.isInteger(card.points) && card.points >= 0;
        const quantityX = x + width - 45;
        ctx.fillStyle = '#101519';
        ctx.fillRect(quantityX, y + height - 38, 45, 38);
        ctx.fillStyle = '#fff';
        ctx.font = '800 25px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`×${card.qty}`, quantityX + 23, y + height - 10, 41);
        ctx.textAlign = 'left';
        if (scored) {
            paintDeckPoints(ctx, card.points, x + width - 32, y + 32);
        }
        if (settings.showCodes !== false) {
            ctx.fillStyle = '#c0c9d1';
            ctx.font = '500 17px Arial';
            ctx.fillText(card.code, x, y + height + 21, width);
        }
    });
    postFooter(ctx, hazard, accent);
    const missing = images.filter((image) => !image).length;
    return {
        ready: missing === 0,
        message: missing
            ? `${missing} imagens não carregaram. Tente novamente antes de baixar.`
            : 'Prévia pronta para baixar.'
    };
}
