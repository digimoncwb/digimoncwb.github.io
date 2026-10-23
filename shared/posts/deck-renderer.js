import {
    POST_FORMAT,
    loadPostImage,
    loadPostCardImage,
    fitPostText,
    paintHazard,
    postFooter
} from './renderer.js';

export const DECK_IMAGE_PAGE_SIZE = 24;
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
    const [hazard, images] = await Promise.all([
        loadPostImage(hazardUrl),
        (async () => {
            const loaded = [];
            for (let offset = 0; offset < visible.length; offset += 4) {
                if (!isCurrent()) return loaded;
                loaded.push(
                    ...(await Promise.all(
                        visible
                            .slice(offset, offset + 4)
                            .map((card) => loadPostCardImage(card.code, card.image))
                    ))
                );
            }
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
    if (settings.showBackgroundIcon !== false)
        paintHazard(ctx, hazard, 240, 330, 740, accent, Number(settings.opacity ?? 0.08));
    ctx.textAlign = 'left';
    ctx.fillStyle = accent;
    ctx.font = '700 22px Arial';
    ctx.fillText('DECKLIST · DIGIMON CARD GAME', 64, 68);
    ctx.fillStyle = '#ffffff';
    fitPostText(ctx, metadata.name, 952, 52, 800, 26);
    ctx.fillText(metadata.name, 64, 128, 952);
    ctx.fillStyle = '#d2d7dc';
    fitPostText(
        ctx,
        [metadata.player, metadata.store].filter(Boolean).join(' · '),
        952,
        26,
        600,
        20
    );
    ctx.fillText([metadata.player, metadata.store].filter(Boolean).join(' · '), 64, 174, 952);
    ctx.font = '500 23px Arial';
    ctx.fillStyle = '#aeb8c2';
    const formatKey = String(metadata.format || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
    ctx.fillText(
        [
            metadata.date,
            ['padrao', 'standard'].includes(formatKey) ? '' : metadata.format,
            metadata.tournament,
            settings.pointsLimit != null
                ? `${cards.reduce((sum, card) => sum + card.qty * (card.points || 0), 0)} / ${settings.pointsLimit} pontos`
                : ''
        ]
            .filter(Boolean)
            .join(' · '),
        64,
        212,
        952
    );
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
        const quantityX = scored ? x : x + width - 45;
        ctx.fillStyle = '#101519';
        ctx.fillRect(quantityX, y + height - 38, 45, 38);
        ctx.fillStyle = '#fff';
        ctx.font = '800 25px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`×${card.qty}`, quantityX + 23, y + height - 10, 41);
        ctx.textAlign = 'left';
        if (scored) {
            ctx.fillStyle = '#050505';
            ctx.beginPath();
            ctx.arc(x + width - 32, y + height - 32, 28, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#f02732';
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.fillStyle = '#ffe52f';
            ctx.font = '900 32px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(card.points), x + width - 32, y + height - 32, 48);
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
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
