import type { Tournament } from '../../contracts';
import { normalizeSearch, readRows, request, type BuilderResultRecord } from './catalog-service';

export interface LibraryDeck {
    id: string | number;
    name: string;
    deck_format_id: string | number;
    updated_at: string;
    archetype_id?: string | null;
    creator_player_id?: string | null;
    archetype?: { name: string; deck_images?: { image_url: string }[] } | null;
    creator?: { name: string } | null;
}
export interface ListCard {
    card_code: string;
    qty: number;
    position: number;
}
export interface Participation {
    row: BuilderResultRecord;
    event: Tournament;
    hasList: boolean;
}
export interface LibraryFilters {
    query: string;
    store: string;
    format: string;
    date: string;
    tournament: string;
    tournamentId: string;
    status: string;
    sort: string;
}
export function participationRows(
    rows: BuilderResultRecord[],
    events: Tournament[]
): Participation[] {
    return rows.flatMap((row) => {
        const matches = events.filter((event) =>
            row.tournament_id
                ? event.id === String(row.tournament_id)
                : event.storeId === String(row.store_id) && event.isoDate === row.tournament_date
        );
        return matches.length === 1
            ? [
                  {
                      row,
                      event: matches[0],
                      hasList: Boolean(row.decklists?.length || row.decklist?.trim())
                  }
              ]
            : [];
    });
}
export function filterParticipations(rows: Participation[], filters: LibraryFilters) {
    const base = rows.filter(
        ({ row, event }) =>
            (!filters.store || event.store === filters.store) &&
            (!filters.format || (event.deckFormatId || event.format) === filters.format) &&
            (!filters.date || event.isoDate === filters.date) &&
            (!filters.tournamentId || event.id === filters.tournamentId) &&
            normalizeSearch(
                [
                    row.player?.name,
                    row.player?.bandai_id,
                    row.player?.digilab_name,
                    row.deck?.name,
                    event.title,
                    event.store,
                    event.isoDate,
                    event.date,
                    event.format,
                    event.deckFormat
                ].join(' ')
            ).includes(normalizeSearch(filters.query)) &&
            normalizeSearch(
                [event.title, event.store, event.isoDate, event.date, event.format].join(' ')
            ).includes(normalizeSearch(filters.tournament))
    );
    const withList = base.filter((item) => item.hasList).length;
    const items = base.filter(
        ({ hasList }) => !filters.status || (filters.status === 'existing' ? hasList : !hasList)
    );
    const placement = (item: Participation) =>
        Number.isFinite(Number(item.row.placement)) && Number(item.row.placement) > 0
            ? Number(item.row.placement)
            : Number.MAX_SAFE_INTEGER;
    items.sort((a, b) => {
        const oldest = filters.sort === 'oldest';
        return (
            (filters.sort === 'player'
                ? (a.row.player?.name || '').localeCompare(b.row.player?.name || '', 'pt-BR')
                : 0) ||
            (oldest
                ? a.event.isoDate.localeCompare(b.event.isoDate)
                : b.event.isoDate.localeCompare(a.event.isoDate)) ||
            (oldest
                ? a.event.id.localeCompare(b.event.id, undefined, { numeric: true })
                : b.event.id.localeCompare(a.event.id, undefined, { numeric: true })) ||
            placement(a) - placement(b) ||
            (Number(a.row.team_member) || 1) - (Number(b.row.team_member) || 1) ||
            String(a.row.id).localeCompare(String(b.row.id))
        );
    });
    return { items, total: base.length, withList, withoutList: base.length - withList };
}
export function loadLibraryDecks(signal?: AbortSignal) {
    return readRows<LibraryDeck>(
        '/rest/v1/decklists?tournament_result_id=is.null&select=id,name,deck_format_id,updated_at,archetype_id,creator_player_id,archetype:decks(name,deck_images(image_url)),creator:players(name)&order=updated_at.desc,id.desc',
        signal
    );
}
export async function createLibraryDeck(name: string, formatId: string) {
    const rows = await request<LibraryDeck[]>('/rest/v1/decklists', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
            name: name.trim(),
            deck_format_id: formatId,
            tournament_result_id: null,
            source: 'builder'
        })
    });
    if (!rows?.[0]) throw new Error('Não foi possível criar o deck.');
    return rows[0];
}
export async function loadListCards(id: string | number, signal?: AbortSignal) {
    const rows = await request<{ draft_cards: { code: string; qty: number }[] | null }[]>(
        `/rest/v1/decklists?id=eq.${encodeURIComponent(id)}&select=draft_cards`,
        { signal }
    );
    if (rows[0]?.draft_cards !== null && rows[0]?.draft_cards !== undefined)
        return rows[0].draft_cards.map((card, index) => ({
            card_code: card.code,
            qty: card.qty,
            position: index + 1
        }));
    return readRows<ListCard>(
        `/rest/v1/decklist_cards?decklist_id=eq.${encodeURIComponent(id)}&select=card_code,qty,position&order=position.asc`,
        signal
    );
}
export function copyLibraryDeck(sourceId: string, resultId: string, replace: boolean) {
    return request<number>('/rest/v1/rpc/copy_free_deck_to_result', {
        method: 'POST',
        body: JSON.stringify({ p_source_id: sourceId, p_result_id: resultId, p_replace: replace })
    });
}
export function legacyCards(text: string): ListCard[] {
    return text.split(/\r?\n/).flatMap((line, index) => {
        const match = line
            .trim()
            .match(
                /^(\d+)\s*[x×]?\s*((?:BT\d+|EX\d+|ST\d+|RB\d+|AD\d+|LM|P)-\d+)(?:_[A-Z0-9]+)?\s*$/i
            );
        return match
            ? [{ qty: Number(match[1]), card_code: match[2].toUpperCase(), position: index + 1 }]
            : [];
    });
}
