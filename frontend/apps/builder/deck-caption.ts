import { postEventTitle } from '../../../shared/posts/renderer.js';

export function buildDeckCaption(metadata: {
    name: string;
    player: string;
    placement?: number;
    tournament: string;
    store: string;
    date: string;
    collection?: string;
    format: string;
}) {
    const placement = Number(metadata.placement);
    const medal = { 1: '🥇', 2: '🥈', 3: '🥉' }[placement as 1 | 2 | 3] || '';
    const lastTwo = placement % 100;
    const suffix =
        lastTwo >= 11 && lastTwo <= 13
            ? 'th'
            : { 1: 'st', 2: 'nd', 3: 'rd' }[placement % 10] || 'th';
    const result =
        Number.isInteger(placement) && placement > 0
            ? ` — ${placement}${suffix} place decklist`
            : ' — decklist';
    const format = /^(padrão|standard)$/i.test(metadata.format) ? '' : metadata.format;
    const event = [postEventTitle({ title: metadata.tournament }), metadata.store]
        .filter(Boolean)
        .join(' · ');
    const date = metadata.date.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, (_, day, month, year) => {
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
        return `${day} ${months[Number(month) - 1]} ${year}`;
    });
    const details = [date, metadata.collection, format].filter(Boolean).join(' · ');
    return [
        `${medal ? `${medal} ` : ''}${metadata.name}${result}`,
        ...(metadata.player ? [`by ${metadata.player}.`] : []),
        ...(event || details ? ['', ...[event, details].filter(Boolean)] : [])
    ].join('\n');
}
