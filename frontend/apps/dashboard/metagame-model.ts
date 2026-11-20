import type { Tournament, Format } from '../../contracts';

export interface MetaResult {
    id: string;
    tournament_id: string | number | null;
    deck_id: string | null;
    player_id: string | null;
    placement: number;
    /** DigiLab shared place for ties (two 1st places); null otherwise. */
    reported_placement?: number | null;
    deck: {
        name: string;
        colors?: string | null;
        primary_color?: string | null;
        secondary_color?: string | null;
        display_card_id?: string | null;
        deck_images?: { image_url: string }[];
    } | null;
    player: { name: string } | null;
    decklists: { id: string }[];
}
/** Place shown and counted for titles/top 4: ties reported by DigiLab share the place. */
export const shownPlacement = (r: { placement: number; reported_placement?: number | null }) =>
    r.reported_placement ?? r.placement;
export function createMetaCache() {
    let stored: { version: number; records: MetaResult[] } | null = null;
    const pending = new Map<number, Promise<MetaResult[]>>();
    return {
        peek(version: number) {
            return stored?.version === version ? stored.records : null;
        },
        load(version: number, loader: () => Promise<MetaResult[]>) {
            if (stored?.version === version) return Promise.resolve(stored.records);
            const existing = pending.get(version);
            if (existing) return existing;
            const request = loader()
                .then((records) => {
                    if (!stored || version >= stored.version) stored = { version, records };
                    return records;
                })
                .finally(() => pending.delete(version));
            pending.set(version, request);
            return request;
        }
    };
}
export function currentFormat(formats: Format[], events: Tournament[]) {
    return (
        formats.find((f) => f.is_default && events.some((e) => e.format === f.code))?.code ||
        [...events].sort((a, b) => b.isoDate.localeCompare(a.isoDate))[0]?.format ||
        ''
    );
}
export function eventType(title: string) {
    const key = title.trim().toLowerCase().replace(/_/g, ' ');
    if (['semanal', 'quinzenal', 'locals', 'win-a-box'].includes(key)) return 'Locals';
    if (['pre-release', 'release event'].includes(key)) return 'Release Event';
    return (
        (
            {
                'evo cup': 'Evo Cup',
                'regulation battle': 'Regulation Battle',
                'store championship': 'Store Championship',
                online: 'Online'
            } as Record<string, string>
        )[key] || title
    );
}
export function overviewFourWeeks(events: Tournament[], format = '') {
    const selected = events
        .filter((e) => !format || e.format === format)
        .sort((a, b) => b.isoDate.localeCompare(a.isoDate));
    if (!selected.length) return { events: [], start: '', end: '' };
    const end = new Date(selected[0].isoDate + 'T12:00:00Z');
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 28);
    const from = start.toISOString().slice(0, 10),
        to = end.toISOString().slice(0, 10);
    return {
        events: selected.filter((e) => e.isoDate >= from && e.isoDate <= to),
        start: from,
        end: to
    };
}
export function analyzeMeta(events: Tournament[], records: MetaResult[]) {
    const ids = new Set(events.map((e) => e.id));
    const seen = new Set<string>();
    const results = records.filter((r) => {
        if (!ids.has(String(r.tournament_id)) || seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
    });
    const complete = new Set(
        events
            .filter((e) => {
                const rows = results.filter((r) => String(r.tournament_id) === e.id);
                const positions = new Set(rows.map((r) => r.placement));
                const players = rows.map((r) => r.player_id).filter(Boolean);
                return (
                    e.players > 0 &&
                    rows.length === e.players &&
                    positions.size === rows.length &&
                    rows.every((r) => r.placement >= 1 && r.placement <= e.players) &&
                    new Set(players).size === players.length
                );
            })
            .map((e) => e.id)
    );
    const eligibleTop = new Set(
        events.filter((e) => complete.has(e.id) && e.players >= 8).map((e) => e.id)
    );
    const deckEvents = new Set(
        events
            .filter((e) => !e.deckless && eventType(e.title || '') !== 'Release Event')
            .map((e) => e.id)
    );
    const known = results.filter(
        (r) => deckEvents.has(String(r.tournament_id)) && r.deck_id && r.deck
    );
    const decks = new Map<
        string,
        {
            id: string;
            name: string;
            count: number;
            players: Set<string>;
            titles: number;
            eligible: number;
            top4: number;
            topEligible: number;
            image: string;
            lists: number;
            colors: string;
            primaryColor: string;
            card: string;
        }
    >();
    for (const r of known) {
        const row = decks.get(r.deck_id!) || {
            id: r.deck_id!,
            name: r.deck!.name,
            count: 0,
            players: new Set<string>(),
            titles: 0,
            eligible: 0,
            top4: 0,
            topEligible: 0,
            lists: 0,
            colors: metaDeckColors(r.deck!),
            primaryColor: metaDeckColors(r.deck!).split(',')[0] || '',
            card: r.deck?.display_card_id || '',
            image:
                r.deck?.deck_images?.[0]?.image_url ||
                events.flatMap((e) => e.results).find((p) => p.deck === r.deck!.name)?.image ||
                ''
        };
        row.count++;
        row.lists += r.decklists?.length || 0;
        if (r.player_id) row.players.add(r.player_id);
        if (complete.has(String(r.tournament_id))) {
            row.eligible++;
            if (shownPlacement(r) === 1) row.titles++;
        }
        if (eligibleTop.has(String(r.tournament_id))) {
            row.topEligible++;
            if (shownPlacement(r) <= 4) row.top4++;
        }
        decks.set(row.id, row);
    }
    const players = new Map<
        string,
        {
            id: string;
            name: string;
            count: number;
            titles: number;
            top4: number;
            topEligible: number;
            last: string;
            decks: Map<string, { id: string; name: string; count: number }>;
        }
    >();
    for (const r of results) {
        if (!r.player_id || !r.player) continue;
        const date = events.find((e) => e.id === String(r.tournament_id))!.isoDate;
        const row = players.get(r.player_id) || {
            id: r.player_id,
            name: r.player.name,
            count: 0,
            titles: 0,
            top4: 0,
            topEligible: 0,
            decks: new Map(),
            last: ''
        };
        row.count++;
        if (complete.has(String(r.tournament_id)) && shownPlacement(r) === 1) row.titles++;
        if (eligibleTop.has(String(r.tournament_id))) {
            row.topEligible++;
            if (shownPlacement(r) <= 4) row.top4++;
        }
        if (deckEvents.has(String(r.tournament_id)) && r.deck_id && r.deck) {
            const deck = row.decks.get(r.deck_id) || { id: r.deck_id, name: r.deck.name, count: 0 };
            deck.count++;
            row.decks.set(deck.id, deck);
        }
        if (date > row.last) row.last = date;
        players.set(row.id, row);
    }
    return {
        results,
        known,
        decks: [...decks.values()],
        players: [...players.values()],
        complete,
        expected: events.reduce((s, e) => s + e.players, 0),
        deckExpected: events.filter((e) => deckEvents.has(e.id)).reduce((s, e) => s + e.players, 0)
    };
}
export function metaDeckColors(deck: NonNullable<MetaResult['deck']>) {
    const codes: Record<string, string> = {
        red: 'r',
        blue: 'u',
        yellow: 'y',
        green: 'g',
        black: 'b',
        purple: 'p',
        white: 'w'
    };
    const saved = (deck.colors || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
    const source = deck.primary_color
        ? ([deck.primary_color, deck.secondary_color].filter(Boolean) as string[])
        : saved;
    return [
        ...new Set(
            source
                .map((value) => codes[value.toLowerCase()] || value.toLowerCase())
                .filter((value) => Object.values(codes).includes(value))
        )
    ].join(',');
}
export function communityActivity(events: Tournament[]) {
    const stores = new Map<
        string,
        { id: string; name: string; count: number; entries: number; last: string }
    >();
    const weeks = new Map<string, number>();
    for (const event of events) {
        const row = stores.get(event.storeId) || {
            id: event.storeId,
            name: event.store,
            count: 0,
            entries: 0,
            last: ''
        };
        row.count++;
        row.entries += event.players;
        if (event.isoDate > row.last) row.last = event.isoDate;
        stores.set(row.id, row);
        const date = new Date(event.isoDate + 'T12:00:00Z');
        date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
        const week = date.toISOString().slice(0, 10);
        weeks.set(week, (weeks.get(week) || 0) + 1);
    }
    const ordered = [...weeks.keys()].sort();
    if (ordered.length) {
        const cursor = new Date(ordered[0] + 'T12:00:00Z');
        while (cursor.toISOString().slice(0, 10) <= ordered[ordered.length - 1]) {
            const key = cursor.toISOString().slice(0, 10);
            if (!weeks.has(key)) weeks.set(key, 0);
            cursor.setUTCDate(cursor.getUTCDate() + 7);
        }
    }
    return {
        stores: [...stores.values()],
        weeks: [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b))
    };
}
export async function readMeta(context: { asset(path: string): string }, signal: AbortSignal) {
    const rows: MetaResult[] = [];
    for (let offset = 0; ; offset += 500) {
        const query = new URLSearchParams({
            select: 'id,tournament_id,deck_id,player_id,placement,reported_placement,deck:decks(*,deck_images(image_url)),player:players(name),decklists(id)',
            order: 'id.asc',
            limit: '500',
            offset: String(offset)
        });
        const response = await fetch(
            window.APP_CONFIG.SUPABASE_URL + '/rest/v1/tournament_results?' + query,
            { headers: window.createSupabaseHeaders(), signal }
        );
        if (!response.ok) throw Error('Não foi possível carregar os resultados para análise.');
        const page = await response.json();
        if (!Array.isArray(page)) throw Error('Resposta de resultados inválida.');
        rows.push(...page);
        if (page.length < 500) return rows;
    }
}
