import type { Result, Tournament } from '../../contracts';
import { eventStandings, postDeckName, teamStandings } from '../../../shared/posts/renderer.js';
const teamRules = '2v2 rules: First team to 3 wins takes the round.';
/** Post caption budget: X's 280 weighted characters. */
const CAPTION_LIMIT = 280;
/** Length as X counts it: links are 23, emoji 2, Latin text 1 and other scripts 2 per character. */
export function xLength(text: string) {
    const withoutLinks = text.replace(/https?:\/\/\S+/g, 'x'.repeat(23));
    // Intl.Segmenter is newer than the project's TypeScript lib; fall back to code points.
    const Segmenter = (
        Intl as unknown as {
            Segmenter?: new (
                locale: string,
                options: { granularity: 'grapheme' }
            ) => { segment(input: string): Iterable<{ segment: string }> };
        }
    ).Segmenter;
    const graphemes: string[] = Segmenter
        ? Array.from(
              new Segmenter('en', { granularity: 'grapheme' }).segment(withoutLinks),
              (part) => part.segment
          )
        : Array.from(withoutLinks);
    return graphemes.reduce((total: number, grapheme: string) => {
        if (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(grapheme)) return total + 2;
        return (
            total +
            Array.from(grapheme).reduce((sum: number, character: string) => {
                const code = character.codePointAt(0) || 0;
                const light =
                    code <= 4351 ||
                    (code >= 8192 && code <= 8205) ||
                    (code >= 8208 && code <= 8223) ||
                    (code >= 8242 && code <= 8247);
                return sum + (light ? 1 : 2);
            }, 0)
        );
    }, 0);
}

export function buildPodiumCaption(event: Tournament, standingsUrl = '') {
    const date = new Date(`${event.isoDate}T12:00:00Z`);
    const month = [
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
    ][date.getUTCMonth()];
    const medals = ['🥇', '🥈', '🥉'];
    const marker = (placement: number) => medals[placement - 1] || `${placement}º`;
    const deckOf = (result: Result) =>
        event.team
            ? (result.members || [result]).map((member) => postDeckName(member.deck)).join(' & ')
            : event.deckless
              ? result.name
              : postDeckName(result.deck);
    // Full placements, decks only; deckless events keep the podium names.
    const standings = event.deckless
        ? []
        : event.team
          ? teamStandings(event).map((team) => ({
                marker: marker(team.placement),
                label: team.members.map((member: Result) => postDeckName(member.deck)).join(' & ')
            }))
          : eventStandings(event).map(({ placement, members: [player] }) => ({
                // Ties reported by DigiLab share a place (two 🥇).
                marker: marker(player.rank ?? placement),
                label: postDeckName(player.deck)
            }));
    const podium = event.podium
        .slice(0, 3)
        .flatMap((result, index) =>
            result ? [{ marker: marker(result.rank ?? index + 1), label: deckOf(result) }] : []
        );
    const rows = standings.length ? standings : podium;
    const formatTag = event.format.replace(/[^a-z0-9]/gi, '');
    const shorten = (text: string, limit: number) => {
        const characters = Array.from(text);
        return characters.length > limit
            ? `${characters
                  .slice(0, limit - 1)
                  .join('')
                  .trimEnd()}…`
            : text;
    };
    const compose = ({
        shown = rows.length,
        tags = 2,
        rules = true,
        labelLimit = Infinity,
        storeLimit = Infinity
    }) =>
        [
            `🇧🇷 ${date.getUTCDate()} ${month} ${date.getUTCFullYear()} — ${shorten(event.store, storeLimit)}`,
            `${event.format} · ${event.players} ${event.players === 1 ? 'player' : 'players'}`,
            ...(event.team && rules ? [teamRules] : []),
            '',
            ...rows.slice(0, shown).map((row) => `${row.marker} ${shorten(row.label, labelLimit)}`),
            ...(shown < rows.length ? [`+${rows.length - shown} more`] : []),
            ...(event.team && !standings.length ? ['', 'Full standings in the next image.'] : []),
            ...(standingsUrl && !event.team ? ['', 'Full standings:', standingsUrl] : []),
            '',
            [
                '#DigimonTCG',
                ...(formatTag && tags >= 1 ? [`#${formatTag}`] : []),
                ...(tags >= 2 ? ['#DigimonCWB'] : [])
            ].join(' ')
        ].join('\n');
    const fits = (text: string) => xLength(text) <= CAPTION_LIMIT;
    // Posts are limited to 280 characters. Give up detail in order until the caption fits:
    // lower places, then optional hashtags, the 2v2 rule, long deck names and the store name.
    const minimum = Math.min(3, rows.length);
    const attempts: Parameters<typeof compose>[0][] = [];
    for (let shown = rows.length; shown >= minimum; shown--) attempts.push({ shown });
    const compact = { shown: minimum };
    attempts.push({ ...compact, tags: 1 }, { ...compact, tags: 0 });
    const bare = { ...compact, tags: 0, rules: false };
    attempts.push(bare);
    for (const labelLimit of [32, 26, 20, 16, 12]) attempts.push({ ...bare, labelLimit });
    for (const storeLimit of [28, 20, 14]) attempts.push({ ...bare, labelLimit: 12, storeLimit });
    for (const attempt of attempts) {
        const caption = compose(attempt);
        if (fits(caption)) return caption;
    }
    // Last resort: cut the text itself at the limit.
    let caption = Array.from(compose(attempts[attempts.length - 1]));
    while (caption.length && !fits(`${caption.join('')}…`)) caption.pop();
    return `${caption.join('').trimEnd()}…`;
}

/** The standings post shares the podium caption: every placement with decks only. */
export function buildTeamStandingsCaption(event: Tournament, standingsUrl = '') {
    return buildPodiumCaption(event, standingsUrl);
}

export async function loadStandingsUrl(tournamentId: string, signal: AbortSignal) {
    const params = new URLSearchParams({
        select: 'digilab_tournament_id',
        tournament_id: `eq.${tournamentId}`,
        limit: '1'
    });
    const response = await fetch(
        `${window.APP_CONFIG.SUPABASE_URL}/rest/v1/tournament_digilab_sync?${params}`,
        { headers: window.createSupabaseHeaders(), signal }
    );
    if (!response.ok) throw Error('Não foi possível consultar o link do DigiLab.');
    const rows: { digilab_tournament_id: number | string | null }[] = await response.json();
    const id = String(rows[0]?.digilab_tournament_id || '');
    return /^[1-9]\d*$/.test(id) ? `https://digimon.digilab.cards/tournament/${id}` : '';
}

export function buildWeeklyCaption(events: Tournament[], week: string) {
    if (!week) return '';
    const end = new Date(`${week}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    const endDate = end.toISOString().slice(0, 10);
    const rows = events
        .filter((event) => event.isoDate >= week && event.isoDate <= endDate)
        .sort((a, b) => a.isoDate.localeCompare(b.isoDate) || a.id.localeCompare(b.id));
    if (!rows.length) return '';
    const dateLabel = (date: string) =>
        new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC'
        });
    const body = [
        `🇧🇷 Weekly recap — ${dateLabel(week)} to ${dateLabel(endDate)}`,
        'Curitiba/PR, Brazil',
        '',
        `${rows.length} ${rows.length === 1 ? 'tournament' : 'tournaments'} · ${rows.reduce((sum, event) => sum + event.players, 0)} entries`,
        '',
        "This week's winners and decks in the images."
    ].join('\n');
    const tags = ['#DigimonTCG', '#DigimonCWB'];
    const formats = new Set(
        rows.map((event) => event.format.replace(/[^a-z0-9]/gi, '')).filter(Boolean)
    );
    for (const format of formats) {
        const candidate = [...tags.slice(0, -1), `#${format}`, tags[tags.length - 1]];
        if (body.length + 2 + candidate.join(' ').length <= 280)
            tags.splice(tags.length - 1, 0, `#${format}`);
    }
    return `${body}\n\n${tags.join(' ')}`;
}
