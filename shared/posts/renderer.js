// Shared canvas renderer: the approved v2 design, independent of the editor UI.
export const POST_FORMAT = Object.freeze({
    width: 1080,
    height: 1350,
    ratio: '4:5',
    mime: 'image/png'
});
const imageCache = new Map();
export function postDeckName(name) {
    return String(name || '')
        .replace(/\bDATA\s+SQUAD\b/gi, 'DATS')
        .replace(/\bShineGreymon\b/gi, 'Shine');
}

export function postEventTitle(event) {
    const title = String(event?.title || '').trim();
    const key = title.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    const types = {
        locals: 'Locals',
        local: 'Locals',
        semanal: 'Locals',
        weekly: 'Locals',
        online: 'Online',
        'evo cup': 'Evo Cup',
        'store championship': 'Store Championship',
        'regulation battle': 'Regulation Battle',
        'release event': 'Release Event'
    };
    return types[key] || title;
}
const liveData = {
    displayDate: (date) => {
        const [, month, day] = date.split('-');
        const months = [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec'
        ];
        return `${day}/${months[Number(month) - 1]}`;
    },
    weekEnd: (start) => {
        const date = new Date(start + 'T12:00:00Z');
        date.setUTCDate(date.getUTCDate() + 6);
        return date.toISOString().slice(0, 10);
    }
};
function loadPostImage(src) {
    if (!src) return Promise.resolve(null);
    if (imageCache.has(src)) return imageCache.get(src);
    const promise = new Promise((resolve) => {
        const image = new Image();
        const timeout = setTimeout(() => {
            imageCache.delete(src);
            image.src = '';
            resolve(null);
        }, 15000);
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            clearTimeout(timeout);
            resolve(image);
        };
        image.onerror = () => {
            clearTimeout(timeout);
            imageCache.delete(src);
            resolve(null);
        };
        image.src = src;
    });
    imageCache.set(src, promise);
    return promise;
}

async function loadPostPortrait(src) {
    if (!src) return null;
    const code = String(src)
        .match(
            /\b((?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3})(?=[._/?#]|$)/i
        )?.[1]
        ?.toUpperCase();
    const storage = globalThis.window?.APP_CONFIG?.SUPABASE_URL;
    const candidates = [src];
    if (code) {
        if (storage)
            candidates.push(
                `${storage}/storage/v1/object/public/deck-images/${encodeURIComponent(code)}.webp`
            );
        candidates.push(
            `https://images.digimoncard.io/images/cards/${code}.webp`,
            `https://images.digimoncard.io/images/cards/${code}.jpg`,
            `https://deckbuilder.egmanevents.com/card_images/digimon/${code}.webp`
        );
    }
    for (const candidate of new Set(candidates)) {
        const image = await loadPostImage(candidate);
        if (image) return image;
    }
    return null;
}

function fitPostText(ctx, text, maxWidth, initialSize, weight = 800, minimum = 22) {
    let size = initialSize;
    do {
        ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
        if (ctx.measureText(text).width <= maxWidth || size <= minimum) break;
        size -= 2;
    } while (size > 0);
    return size;
}

function paintHazard(ctx, image, x, y, size, color, opacity = 1, crop = false) {
    if (!image) return;
    const tint = document.createElement('canvas');
    tint.width = 560;
    tint.height = 560;
    const buffer = tint.getContext('2d');
    buffer.drawImage(image, 0, 0, 560, 560);
    buffer.globalCompositeOperation = 'source-in';
    const gradient = buffer.createLinearGradient(0, 70, 0, 490);
    gradient.addColorStop(0, color.toLowerCase() === '#ef646b' ? '#ff8085' : color);
    gradient.addColorStop(1, color.toLowerCase() === '#ef646b' ? '#d23a4a' : color);
    buffer.fillStyle = gradient;
    buffer.fillRect(0, 0, 560, 560);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(x + size / 2, y + size / 2);
    if (opacity === 1) {
        ctx.shadowColor = color + '59';
        ctx.shadowBlur = size * 0.12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }
    if (crop && buffer.getImageData) {
        const pixels = buffer.getImageData(0, 0, 560, 560)?.data;
        let left = 560,
            top = 560,
            right = 0,
            bottom = 0;
        if (pixels) {
            for (let y = 0; y < 560; y++)
                for (let x = 0; x < 560; x++) {
                    if (pixels[(y * 560 + x) * 4 + 3] > 20) {
                        left = Math.min(left, x);
                        top = Math.min(top, y);
                        right = Math.max(right, x);
                        bottom = Math.max(bottom, y);
                    }
                }
        }
        if (right > left && bottom > top) {
            const width = (size * (right - left + 1)) / (bottom - top + 1);
            ctx.drawImage(
                tint,
                left,
                top,
                right - left + 1,
                bottom - top + 1,
                -width / 2,
                -size / 2,
                width,
                size
            );
        } else ctx.drawImage(tint, -size / 2, -size / 2, size, size);
    } else ctx.drawImage(tint, -size / 2, -size / 2, size, size);
    ctx.restore();
}

function paintPortrait(ctx, image, x, y, radius, color, initials) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#1d3027';
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    if (image) {
        // Match Decks: width: 100%, scale(2.3), transform-origin: center 20%.
        const setting = globalThis.window?.cardPortraits?.get(image.src);
        const zoom = setting?.zoom ?? 2.3;
        const baseScale = (radius * 2) / image.width;
        const baseHeight = image.height * baseScale;
        const width = radius * 2 * zoom,
            height = baseHeight * zoom;
        const top = y - radius - baseHeight * 0.2 * (zoom - 1) - height * (setting?.offset_y ?? 0);
        const centerX = setting?.center_x ?? 0.5;
        ctx.drawImage(image, x - width * centerX, top, width, height);
    } else {
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.font = `800 ${radius * 0.45}px Arial`;
        ctx.fillText(initials, x, y + radius * 0.15);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
}

const SOCIAL_PATHS = {
    instagram:
        'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
    x: 'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z'
};
function paintSocialIcon(ctx, name, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    ctx.fillStyle = '#e0e3e5';
    ctx.fill(new Path2D(SOCIAL_PATHS[name]));
    ctx.restore();
}

function postFooter(ctx, hazard, accent, dividerY = 1240) {
    const titleSize = 34;
    const subtitleBaseSize = 22;
    const brandGap = 8;
    const handleSize = 24;
    ctx.save();
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(64, dividerY);
    ctx.lineTo(1016, dividerY);
    ctx.stroke();
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${titleSize}px "Arial Black", Arial`;
    const brandWidth = ctx.measureText('DIGIMON CWB').width;
    const titleMetrics = ctx.measureText('DIGIMON CWB');
    ctx.font = `600 ${subtitleBaseSize}px Arial`;
    const subtitle = 'Digimon Card Game Community';
    const subtitleSize = Math.min(
        subtitleBaseSize,
        (subtitleBaseSize * brandWidth) / Math.max(1, ctx.measureText(subtitle).width)
    );
    ctx.font = `600 ${subtitleSize}px Arial`;
    const subtitleMetrics = ctx.measureText(subtitle);
    const titleAscent = titleMetrics.actualBoundingBoxAscent || titleSize * 0.75;
    const titleDescent = titleMetrics.actualBoundingBoxDescent || 1;
    const subtitleAscent = subtitleMetrics.actualBoundingBoxAscent || subtitleSize * 0.75;
    const subtitleDescent = subtitleMetrics.actualBoundingBoxDescent || subtitleSize * 0.2;
    const brandHeight = titleAscent + titleDescent + brandGap + subtitleAscent + subtitleDescent;
    const footerCenter = (dividerY + POST_FORMAT.height) / 2;
    const brandTop = footerCenter - brandHeight / 2;
    const brandIconSize = brandHeight;
    const brandTextLeft = 64 + brandIconSize + 18;
    paintHazard(ctx, hazard, 64, brandTop, brandIconSize, accent, 1, true);
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${titleSize}px "Arial Black", Arial`;
    ctx.fillText('DIGIMON CWB', brandTextLeft, brandTop + titleAscent, brandWidth);
    ctx.fillStyle = '#aab1b5';
    ctx.font = `600 ${subtitleSize}px Arial`;
    ctx.fillText(
        subtitle,
        brandTextLeft,
        brandTop + titleAscent + titleDescent + brandGap + subtitleAscent
    );
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${handleSize}px Arial`;
    const handles = ['@digimoncwb', '@digimon_cwb'];
    const iconSize = 22,
        gap = 12;
    const socialWidth =
        iconSize + gap + Math.max(...handles.map((handle) => ctx.measureText(handle).width));
    const socialLeft = 1012 - socialWidth;
    ctx.textAlign = 'left';
    ['instagram', 'x'].forEach((network, index) => {
        const spacing = 30;
        const baseline = footerCenter + (index - 0.5) * spacing;
        paintSocialIcon(ctx, network, socialLeft, baseline - iconSize / 2, iconSize);
        ctx.font = `700 ${handleSize}px Arial`;
        ctx.fillStyle = '#e0e3e5';
        ctx.fillText(handles[index], socialLeft + iconSize + gap, baseline);
    });
    ctx.restore();
}

function paintStoreLogo(ctx, image, x, y, width, height) {
    if (!image) return;
    const scale = Math.min(width / image.width, height / image.height);
    const drawWidth = image.width * scale,
        drawHeight = image.height * scale;
    ctx.drawImage(
        image,
        x + (width - drawWidth) / 2,
        y + (height - drawHeight) / 2,
        drawWidth,
        drawHeight
    );
}

function paintPodiumIdentity(ctx, player, portrait, isWinner) {
    const top = portrait.textY - 20;
    ctx.textAlign = 'center';
    ctx.fillStyle = portrait.color;
    const deckName = postDeckName(player.deck).toUpperCase();
    fitPostText(ctx, deckName, portrait.width, isWinner ? 36 : 29, 800);
    ctx.fillText(deckName, portrait.x, top + 38, portrait.width);
    ctx.fillStyle = '#e0e3e5';
    fitPostText(ctx, player.name, portrait.width, isWinner ? 29 : 27, 700, 20);
    ctx.fillText(player.name, portrait.x, top + 74, portrait.width);
}

function paintTeamPodium(ctx, event, images, english) {
    const rows = [
        {
            centerX: 540,
            labelY: 300,
            portraitY: 480,
            radius: 125,
            deckY: 665,
            width: 820,
            color: '#e2bb68'
        },
        {
            centerX: 225,
            labelY: 815,
            portraitY: 940,
            radius: 95,
            deckY: 1092,
            width: 390,
            color: '#c8ced5'
        },
        {
            centerX: 855,
            labelY: 815,
            portraitY: 940,
            radius: 95,
            deckY: 1092,
            width: 390,
            color: '#cb7b43'
        }
    ];
    rows.forEach((row, index) => {
        const members = event.podium[index]?.members || [];
        const label =
            index === 0
                ? english
                    ? 'WINNER'
                    : 'CAMPEÃO'
                : english
                  ? index === 1
                      ? '2nd'
                      : '3rd'
                  : `${index + 1}º`;
        ctx.textAlign = 'center';
        ctx.fillStyle = row.color;
        fitPostText(ctx, label, Math.min(row.width, 600), index === 0 ? 75 : 64, 900);
        ctx.fillText(label, row.centerX, row.labelY, Math.min(row.width, 600));
        const pair = [0, 1].map((memberIndex) => members[memberIndex] || { name: '—', deck: '—' });
        pair.forEach((member, memberIndex) =>
            paintPortrait(
                ctx,
                images[index]?.[memberIndex],
                row.centerX + (memberIndex ? row.radius + 2 : -row.radius - 2),
                row.portraitY,
                row.radius,
                row.color,
                member.deck.slice(0, 2)
            )
        );
        const decks = pair.map(
            (member, memberIndex) =>
                postDeckName(member.deck || '—') + (memberIndex === 0 ? ' &' : '')
        );
        const names = pair.map(
            (member, memberIndex) => (member.name.trim() || '—') + (memberIndex === 0 ? ' &' : '')
        );
        const deckSpacing = index === 0 ? 36 : 32;
        const nameY = row.deckY + deckSpacing + 38;
        const nameSpacing = index === 0 ? 32 : 30;
        ctx.textAlign = 'center';
        ctx.fillStyle = row.color;
        const deckSize = Math.min(
            ...decks.map((deck) =>
                fitPostText(ctx, deck, row.width, index === 0 ? 36 : 32, 800, 24)
            )
        );
        ctx.font = `800 ${deckSize}px Arial, Helvetica, sans-serif`;
        decks.forEach((deck, lineIndex) =>
            ctx.fillText(deck, row.centerX, row.deckY + lineIndex * deckSpacing, row.width)
        );
        ctx.fillStyle = '#c7cbd0';
        const nameSize = Math.min(
            ...names.map((name) =>
                fitPostText(ctx, name, row.width, index === 0 ? 29 : 28, 700, 20)
            )
        );
        ctx.font = `700 ${nameSize}px Arial, Helvetica, sans-serif`;
        names.forEach((name, lineIndex) =>
            ctx.fillText(name, row.centerX, nameY + lineIndex * nameSpacing, row.width)
        );
    });
}

function paintEventHeader(ctx, event, title, hazard, accent, storeLogo, english) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    const words = title.trim().toUpperCase().split(/\s+/);
    const lines = [];
    let current = '';
    ctx.font = '900 68px Arial';
    words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width > 510 && current) {
            lines.push(current);
            current = word;
        } else current = candidate;
    });
    if (current) lines.push(current);
    lines.slice(0, 3).forEach((line, index) => {
        fitPostText(ctx, line, 510, 68);
        if (index === 0) {
            const bounds = ctx.measureText(line);
            const titleCenterY =
                112 + (bounds.actualBoundingBoxDescent - bounds.actualBoundingBoxAscent) / 2;
            paintHazard(ctx, hazard, 52, titleCenterY - 39, 78, accent);
        }
        ctx.fillText(line, 158, 112 + index * 76, 510);
    });
    const metadataY = 112 + Math.min(lines.length, 3) * 76;
    ctx.font = '700 34px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(liveData.displayDate(event.isoDate), 66, metadataY);
    ctx.fillStyle = accent;
    fitPostText(
        ctx,
        `· ${event.players} ${english ? 'PLAYERS' : 'JOGADORES'} · ${event.format}`,
        610,
        32,
        700
    );
    ctx.fillText(
        `· ${event.players} ${english ? 'PLAYERS' : 'JOGADORES'} · ${event.format}`,
        190,
        metadataY,
        610
    );
    paintStoreLogo(ctx, storeLogo, 728, 50, 280, 144);
}

function paintPodium(
    ctx,
    event,
    title,
    images,
    hazard,
    accent,
    storeLogo,
    language,
    showBackgroundIcon = true,
    background = {}
) {
    const english = language === 'en';
    const winnerCenter = { x: 540, y: 665 };
    const watermarkCenter = winnerCenter;
    const watermarkSize = 1100 * (background.scale ?? 1);
    // Align the symbol's central ring (137, 128 in the 274-square viewBox),
    // rather than the center of its asymmetric overall bounding box.
    if (showBackgroundIcon)
        paintHazard(
            ctx,
            hazard,
            watermarkCenter.x + (background.offsetX ?? 0) - (watermarkSize * 137) / 274,
            watermarkCenter.y + (background.offsetY ?? 0) - (watermarkSize * 128) / 274,
            watermarkSize,
            accent,
            background.opacity ?? (event.team ? 0.08 : 0.16)
        );
    paintEventHeader(ctx, event, title, hazard, accent, storeLogo, english);
    if (event.team) {
        paintTeamPodium(ctx, event, images, english);
        postFooter(ctx, hazard, accent, 1240);
        return;
    }
    const portraits = [
        {
            ...winnerCenter,
            radius: 185,
            label: english ? 'WINNER' : 'CAMPEÃO',
            color: '#e2bb68',
            labelY: 425,
            textY: 888,
            width: 390
        },
        {
            x: 202,
            y: 868,
            radius: 125,
            label: english ? '2nd' : '2º',
            color: '#c8ced5',
            labelY: 693,
            textY: 1027,
            width: 300
        },
        {
            x: 878,
            y: 868,
            radius: 125,
            label: english ? '3rd' : '3º',
            color: '#cb7b43',
            labelY: 693,
            textY: 1027,
            width: 300
        }
    ];
    portraits.forEach((portrait, index) => {
        const player = event.podium[index] || { deck: '—', name: 'Resultado não registrado' };
        ctx.textAlign = 'center';
        ctx.fillStyle = portrait.color;
        ctx.font = `900 ${index === 0 ? 75 : 64}px Arial`;
        ctx.fillText(portrait.label, portrait.x, portrait.labelY);
        if (!event.deckless)
            paintPortrait(
                ctx,
                images[index]?.[0],
                portrait.x,
                portrait.y,
                portrait.radius,
                portrait.color,
                player.deck.slice(0, 2).toUpperCase()
            );
        if (event.deckless) {
            ctx.fillStyle = portrait.color;
            fitPostText(ctx, player.name, portrait.width, index === 0 ? 38 : 30, 800, 24);
            ctx.fillText(player.name, portrait.x, portrait.labelY + 85, portrait.width);
        } else paintPodiumIdentity(ctx, player, portrait, index === 0);
    });
    postFooter(ctx, hazard, accent);
}

export function teamStandings(event) {
    if (!event?.team) return [];
    const teams = new Map();
    for (const member of event.results || []) {
        if (!teams.has(member.placement)) teams.set(member.placement, []);
        teams.get(member.placement).push(member);
    }
    return [...teams.entries()]
        .sort(([a], [b]) => a - b)
        .map(([placement, members]) => ({ placement, members }));
}

export function teamStandingsPages(event) {
    const standings = teamStandings(event);
    return Array.from({ length: Math.ceil(standings.length / 9) }, (_, index) =>
        standings.slice(index * 9, index * 9 + 9)
    );
}

function paintTeamStandings(ctx, event, standings, images, hazard, accent, settings, pageCount) {
    const english = settings.language === 'en';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 68px Arial';
    const titleBounds = ctx.measureText('2V2');
    const titleCenterY =
        112 + (titleBounds.actualBoundingBoxDescent - titleBounds.actualBoundingBoxAscent) / 2;
    paintHazard(ctx, hazard, 52, titleCenterY - 39, 78, accent);
    ctx.fillText('2V2', 158, 112);
    ctx.textAlign = 'right';
    ctx.fillStyle = accent;
    ctx.font = '800 34px Arial';
    ctx.fillText(liveData.displayDate(event.isoDate), 1008, 88);
    ctx.fillStyle = '#c7cbd0';
    const metadata = `${event.format} · ${event.players} ${english ? 'PLAYERS' : 'JOGADORES'}`;
    fitPostText(ctx, metadata, 610, 28, 700);
    ctx.fillText(metadata, 1008, 134, 610);
    ctx.fillStyle = accent;
    ctx.font = '700 26px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(english ? 'PLACE' : 'POSIÇÃO', 110, 212);
    ctx.fillText(english ? 'DECKS / PLAYERS' : 'DECKS / JOGADORES', 600, 212);
    if (pageCount > 1) {
        ctx.textAlign = 'right';
        ctx.font = '700 24px Arial';
        ctx.fillText(
            `${english ? 'PAGE' : 'PÁGINA'} ${Number(settings.page || 0) + 1} / ${pageCount}`,
            1008,
            180
        );
    }
    standings.forEach((team, index) => {
        const y = 236 + index * 108;
        const podium = team.placement <= 3;
        const color = ['#e2bb68', '#c8ced5', '#cb7b43'][team.placement - 1] || '#b9bec5';
        ctx.fillStyle = '#1b1e21';
        ctx.beginPath();
        ctx.roundRect(52, y, 976, 100, 20);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        const rank = english
            ? `${team.placement}${team.placement % 100 >= 11 && team.placement % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[team.placement % 10] || 'th'}`
            : `${team.placement}º`;
        fitPostText(ctx, rank, 88, 36, podium ? 900 : 700, 28);
        ctx.fillText(rank, 110, y + 63, 88);
        team.members.forEach((member, memberIndex) => {
            const portraitX = 222 + memberIndex * 426;
            const textX = 280 + memberIndex * 426;
            paintPortrait(
                ctx,
                images[index]?.[memberIndex],
                portraitX,
                y + 50,
                40,
                color,
                member.deck.slice(0, 2)
            );
            ctx.textAlign = 'left';
            ctx.fillStyle = color;
            const deck = postDeckName(member.deck);
            fitPostText(ctx, deck, 290, 30, 800, 20);
            ctx.fillText(deck, textX, y + 42, 290);
            ctx.fillStyle = podium ? '#c7cbd0' : '#a4abb3';
            fitPostText(ctx, member.name, 290, 26, podium ? 700 : 600, 18);
            ctx.fillText(member.name, textX, y + 77, 290);
        });
        ctx.strokeStyle = '#ffffff0c';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(600, y + 18);
        ctx.lineTo(600, y + 82);
        ctx.stroke();
    });
    postFooter(ctx, hazard, accent, 1240);
}

export function weeklyPostPages(allEvents, week) {
    if (!week) return [];
    const events = allEvents
        .filter((event) => event.isoDate >= week && event.isoDate <= liveData.weekEnd(week))
        .sort((a, b) => a.isoDate.localeCompare(b.isoDate) || a.id.localeCompare(b.id));
    const pages = [];
    let page = [],
        usedRows = 0;
    events.forEach((event) => {
        const rows = event.team ? 2 : 1;
        if (usedRows + rows > 5) {
            pages.push(page);
            page = [];
            usedRows = 0;
        }
        page.push(event);
        usedRows += rows;
    });
    if (page.length) pages.push(page);
    return pages;
}

function paintWeekly(
    ctx,
    hazard,
    accent,
    images,
    storeLogos,
    events,
    weekEvents,
    settings,
    pageCount
) {
    const english = settings.language === 'en';
    paintHazard(ctx, hazard, 52, 64, 78, accent);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    fitPostText(ctx, 'WEEKLY RECAP', 540, 46, 900, 32);
    ctx.fillText('WEEKLY RECAP', 158, 120, 540);
    ctx.textAlign = 'right';
    ctx.fillStyle = accent;
    ctx.font = '800 36px Arial';
    const start = settings.week;
    ctx.fillText(
        `${liveData.displayDate(start)} — ${liveData.displayDate(liveData.weekEnd(start))}`,
        1008,
        112
    );
    ctx.font = '700 24px Arial';
    ctx.fillStyle = '#b9bec2';
    ctx.fillText('Curitiba/PR, Brazil', 1008, 153);
    const columns = [
        { label: english ? 'DAY' : 'DIA', x: 118, align: 'center' },
        { label: english ? 'DECK / PLAYER' : 'DECK / JOGADOR', x: 410, align: 'left' },
        { label: english ? 'TOURNAMENT / STORE' : 'TORNEIO / LOJA', x: 865, align: 'center' }
    ];
    ctx.fillStyle = accent;
    ctx.font = '700 26px Arial';
    columns.forEach(({ label, x, align }) => {
        ctx.textAlign = align;
        if (x === 865) fitPostText(ctx, label, 286, 26, 700, 22);
        ctx.fillText(label, x, 268, x === 865 ? 286 : undefined);
    });
    if (pageCount > 1) {
        ctx.font = '500 24px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(
            `${english ? 'PAGE' : 'PÁGINA'} ${Number(settings.page) + 1} / ${pageCount}`,
            1008,
            197
        );
    }
    let nextY = 300;
    events.forEach((event, index) => {
        const winner = event.winner || {
            deck: english ? 'Result not recorded' : 'Resultado não registrado',
            name: '',
            image: ''
        };
        const y = nextY;
        const height = event.team ? 268 : 126;
        const centerOffset = (height - 126) / 2;
        nextY += height + 16;
        ctx.fillStyle = '#1b1e21';
        ctx.beginPath();
        ctx.roundRect(52, y, 976, height, 24);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 32px Arial';
        ctx.fillText(
            english
                ? ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][
                      new Date(event.isoDate + 'T12:00:00Z').getUTCDay()
                  ]
                : event.day,
            118,
            y + 54 + centerOffset
        );
        ctx.fillStyle = '#b9bec2';
        ctx.font = '700 26px Arial';
        ctx.fillText(liveData.displayDate(event.isoDate), 118, y + 89 + centerOffset);
        if (!event.deckless && !event.team)
            paintPortrait(
                ctx,
                images[index]?.[0],
                320,
                y + 63,
                49,
                accent,
                winner.deck.slice(0, 2)
            );
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        if (event.team) {
            const members = (winner.members || []).slice(0, 2);
            members.forEach((member, memberIndex) => {
                paintPortrait(
                    ctx,
                    images[index]?.[memberIndex],
                    320,
                    y + 63 + memberIndex * 142,
                    49,
                    accent,
                    member.deck.slice(0, 2)
                );
                ctx.textAlign = 'left';
                ctx.fillStyle = '#ffffff';
                const deck = postDeckName(member.deck);
                fitPostText(ctx, deck, 288, 34, 800, 24);
                ctx.fillText(deck, 410, y + 54 + memberIndex * 142, 288);
                ctx.fillStyle = '#c7cbd0';
                fitPostText(ctx, member.name, 288, 29, 700, 24);
                ctx.fillText(member.name, 410, y + 92 + memberIndex * 142, 288);
            });
            ctx.strokeStyle = '#ffffff0c';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(265, y + 134);
            ctx.lineTo(698, y + 134);
            ctx.stroke();
        } else if (event.deckless) {
            fitPostText(ctx, winner.name, 433, 34, 800, 24);
            ctx.fillText(winner.name, 265, y + 72, 433);
        } else {
            const deck = postDeckName(winner.deck);
            fitPostText(ctx, deck, 288, 34, 800, 24);
            ctx.fillText(deck, 410, y + 54, 288);
            ctx.fillStyle = '#c7cbd0';
            fitPostText(ctx, winner.name, 288, 29, 700, 24);
            ctx.fillText(winner.name, 410, y + 92, 288);
        }
        ctx.textAlign = 'center';
        const title = postEventTitle(event);
        ctx.font = '800 28px Arial';
        const titleLines = [title];
        if (ctx.measureText(title).width > 166 && title.includes(' ')) {
            const words = title.split(' ');
            let split = 1;
            let bestWidth = Infinity;
            for (let wordIndex = 1; wordIndex < words.length; wordIndex++) {
                const width = Math.max(
                    ctx.measureText(words.slice(0, wordIndex).join(' ')).width,
                    ctx.measureText(words.slice(wordIndex).join(' ')).width
                );
                if (width < bestWidth) {
                    bestWidth = width;
                    split = wordIndex;
                }
            }
            titleLines.splice(0, 1, words.slice(0, split).join(' '), words.slice(split).join(' '));
        }
        ctx.fillStyle = accent;
        titleLines.forEach((line, lineIndex) => {
            fitPostText(ctx, line, 166, 28, 800, 22);
            ctx.fillText(
                line,
                805,
                y + centerOffset + (titleLines.length > 1 ? 38 : 54) + lineIndex * 30,
                166
            );
        });
        ctx.font = '700 24px Arial';
        ctx.fillStyle = '#b9bec2';
        ctx.fillText(
            `${event.players} ${event.players === 1 ? 'player' : 'players'}`,
            805,
            y + centerOffset + (titleLines.length > 1 ? 100 : 88),
            166
        );
        paintStoreLogo(ctx, storeLogos[index], 904, y + 15 + centerOffset, 104, 96);
        if (!storeLogos[index]) {
            ctx.fillStyle = accent;
            fitPostText(ctx, event.store.toUpperCase(), 104, 24, 800, 18);
            ctx.fillText(event.store.toUpperCase(), 956, y + 70 + centerOffset, 104);
        }
    });
    const totals = [
        { value: weekEvents.length, label: english ? 'TOURNAMENTS' : 'TORNEIOS' },
        {
            value: weekEvents.reduce((sum, event) => sum + event.players, 0),
            label: english ? 'ENTRIES' : 'PARTICIPAÇÕES'
        },
        {
            value: [...new Set(weekEvents.map((event) => event.format))].join(' / '),
            label: english ? 'FORMAT' : 'FORMATO'
        }
    ];
    totals.forEach(({ value, label }, index) => {
        const x = 214 + index * 326;
        ctx.textAlign = 'center';
        ctx.fillStyle = accent;
        fitPostText(ctx, String(value), 290, 42, 800, 24);
        ctx.fillText(String(value), x, 1188, 290);
        ctx.fillStyle = '#c0c5ca';
        ctx.font = '700 24px Arial';
        ctx.fillText(label, x, 1135);
    });
    postFooter(ctx, hazard, accent, 1240);
}

export async function renderPost(canvas, settings, allEvents, hazardUrl, isCurrent) {
    settings = { ...settings, language: 'en' };
    const event =
        allEvents.find((event) => event.id === settings.tournament) ||
        allEvents.find((event) => event.winner);
    const weeklyPages = weeklyPostPages(allEvents, settings.week);
    const weekEvents = weeklyPages.flat();
    const weeklyRows = weeklyPages[Number(settings.page) || 0] || [];
    const teamPages = teamStandingsPages(event);
    const teamRows = teamPages[Number(settings.page) || 0] || [];
    if (
        settings.template === 'teams'
            ? !teamRows.length
            : settings.template === 'weekly'
              ? !weeklyRows.length
              : !event?.winner
    )
        return { ready: false, message: 'Nenhum resultado disponível para este modelo.' };
    const events = settings.template === 'weekly' ? weeklyRows : [event];
    const standings =
        settings.template === 'teams'
            ? teamRows
            : settings.template === 'weekly'
              ? weeklyRows.map((event) => event.winner)
              : event.podium;
    const sources = standings.map((result) =>
        (result?.members || [result]).map((member) => member?.image || '')
    );
    const [hazard, images, logos] = await Promise.all([
        loadPostImage(hazardUrl),
        Promise.all(sources.map((members) => Promise.all(members.map(loadPostPortrait)))),
        settings.template === 'teams'
            ? []
            : Promise.all(events.map((event) => loadPostImage(event.logo)))
    ]);
    if (!isCurrent()) return { ready: false, message: '' };
    if (canvas.width !== POST_FORMAT.width) canvas.width = POST_FORMAT.width;
    if (canvas.height !== POST_FORMAT.height) canvas.height = POST_FORMAT.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, POST_FORMAT.width, POST_FORMAT.height);
    ctx.fillStyle = '#242629';
    ctx.fillRect(0, 0, POST_FORMAT.width, POST_FORMAT.height);
    ctx.textBaseline = 'alphabetic';
    if (settings.template === 'weekly')
        paintWeekly(
            ctx,
            hazard,
            settings.accent,
            images,
            logos,
            weeklyRows,
            weekEvents,
            settings,
            weeklyPages.length
        );
    else if (settings.template === 'teams')
        paintTeamStandings(
            ctx,
            event,
            teamRows,
            images,
            hazard,
            settings.accent,
            settings,
            teamPages.length
        );
    else
        paintPodium(
            ctx,
            event,
            settings.title || postEventTitle(event),
            images,
            hazard,
            settings.accent,
            logos[0],
            settings.language,
            settings.showBackgroundIcon !== false,
            settings.background
        );
    const missing =
        !hazard ||
        logos.some((image) => !image) ||
        images.some(
            (members, index) =>
                members.some((image) => !image) &&
                !(settings.template === 'weekly' ? weeklyRows[index].deckless : event.deckless)
        );
    return {
        ready: true,
        message: missing
            ? 'Algumas imagens não carregaram. Confira a prévia antes de baixar.'
            : 'Prévia pronta para exportar.'
    };
}
