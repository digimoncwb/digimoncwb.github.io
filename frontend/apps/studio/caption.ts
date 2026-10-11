import type { Result, Tournament } from '../../contracts';
import { postDeckName, teamStandings } from '../../../shared/posts/renderer.js';
const teamRules = '2v2 rules: First team to 3 wins takes the round.';

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
    const podium = event.podium
        .slice(0, 3)
        .flatMap((result, index) =>
            result
                ? [
                      `${medals[index]} ${event.team ? (result.members || [result]).map((member) => postDeckName(member.deck)).join(' & ') : event.deckless ? result.name : postDeckName(result.deck)}`
                  ]
                : []
        );
    const formatTag = event.format.replace(/[^a-z0-9]/gi, '');
    return [
        `🇧🇷 ${date.getUTCDate()} ${month} ${date.getUTCFullYear()} — ${event.store}`,
        `${event.format} · ${event.players} ${event.players === 1 ? 'player' : 'players'}`,
        ...(event.team ? [teamRules] : []),
        '',
        ...podium,
        ...(event.team ? ['', 'Full standings in the next image.'] : []),
        ...(standingsUrl && !event.team ? ['', 'Full standings:', standingsUrl] : []),
        '',
        ['#DigimonTCG', ...(formatTag ? [`#${formatTag}`] : []), '#DigimonCWB'].join(' ')
    ].join('\n');
}

export function buildTeamStandingsCaption(event: Tournament) {
    if (!event.team) return '';
    const header = buildPodiumCaption(event).split('\n').slice(0, 2);
    const formatTag = event.format.replace(/[^a-z0-9]/gi, '');
    return [
        ...header,
        teamRules,
        '',
        'Full standings:',
        ...teamStandings(event).map(
            (team) =>
                `${team.placement}º ${team.members.map((member: Result) => postDeckName(member.deck)).join(' & ')}`
        ),
        '',
        ['#DigimonTCG', ...(formatTag ? [`#${formatTag}`] : []), '#DigimonCWB'].join(' ')
    ].join('\n');
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
