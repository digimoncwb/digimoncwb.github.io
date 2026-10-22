import type { MicroContext, Tournament } from '../../contracts';

export interface PlayerRecord {
    id: string | number;
    name: string;
    bandai_id?: string | null;
    bandai_nick?: string | null;
    digilab_name?: string | null;
    is_active?: boolean;
}
export interface DeckRecord {
    id: string | number;
    name: string;
    colors?: string;
    family_id?: string | null;
    image: string;
    code: string;
    formats: string[];
    hasDecklist: boolean;
}
export interface HistoryRecord {
    id: string | number;
    tournament_id: string | number;
    tournament_date: string;
    placement: number;
    decklist?: string;
    decklist_link?: string;
    store?: { name: string };
    deck?: { name: string };
    player?: { name: string };
    decklists?: {
        id: string;
        draft_cards?: { code: string; qty: number }[] | null;
        decklist_cards?: { card_code: string; qty: number; position: number }[];
    }[];
}
export interface TournamentResultRecord {
    id: string;
    placement: number;
    team_member?: number;
    match_points?: number;
    player?: { name: string; bandai_id?: string; digilab_name?: string };
    deck?: { name: string };
}
export interface BuilderResultRecord extends TournamentResultRecord {
    deck?: { name: string; deck_images?: { image_url: string }[] };
    tournament_id: string | number | null;
    tournament_date: string;
    store_id: string | number;
    decklists?: { id: string }[];
    decklist?: string | null;
}
export function loadBuilderResults(signal?: AbortSignal) {
    return readRows<BuilderResultRecord>(
        '/rest/v1/tournament_results?select=id,tournament_id,tournament_date,store_id,placement,decklist,player:players(name,bandai_id,digilab_name),deck:decks(name,deck_images(image_url)),decklists(id)&order=tournament_date.desc,placement.asc,id.asc',
        signal
    );
}
export async function loadTournamentResults(
    event: Tournament,
    events: Tournament[],
    signal?: AbortSignal
) {
    const fields =
        '&select=id,placement,team_member,match_points,player:players(name,bandai_id,digilab_name),deck:decks(name)&order=placement.asc,team_member.asc';
    const requests = [
        request<TournamentResultRecord[]>(
            `/rest/v1/tournament_results?tournament_id=eq.${encodeURIComponent(event.id)}` + fields,
            { signal }
        )
    ];
    if (
        events.filter((row) => row.storeId === event.storeId && row.isoDate === event.isoDate)
            .length === 1
    ) {
        requests.push(
            request<TournamentResultRecord[]>(
                `/rest/v1/tournament_results?tournament_id=is.null&store_id=eq.${encodeURIComponent(event.storeId)}&tournament_date=eq.${encodeURIComponent(event.isoDate)}` +
                    fields,
                { signal }
            )
        );
    }
    const rows = (await Promise.all(requests)).flat();
    return [...new Map(rows.map((row) => [String(row.id), row])).values()].sort(
        (a, b) => a.placement - b.placement || (a.team_member || 1) - (b.team_member || 1)
    );
}
export const deckColors = [
    { code: 'r', label: 'Vermelho', color: '#e66069' },
    { code: 'u', label: 'Azul', color: '#648be8' },
    { code: 'b', label: 'Preto', color: '#525967' },
    { code: 'w', label: 'Branco', color: '#e7e9ee' },
    { code: 'g', label: 'Verde', color: '#51b979' },
    { code: 'y', label: 'Amarelo', color: '#e3c54c' },
    { code: 'p', label: 'Roxo', color: '#b074d9' }
];
export function orderedDeckColors(colors: string) {
    return [...new Set(colors.split(',').map((code) => code.trim().toLowerCase()))]
        .map((code) => deckColors.find((color) => color.code === code))
        .filter((color) => color !== undefined);
}
export function normalizeSearch(value: unknown) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .trim();
}
export function cardCode(image: string) {
    return (
        decodeURIComponent(image || '')
            .match(/(?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3}/i)?.[0]
            .toUpperCase() || ''
    );
}
export function paginate<T>(items: T[], page: number, size: number) {
    const totalPages = Math.max(1, Math.ceil(items.length / size));
    const current = Math.max(1, Math.min(page, totalPages));
    return {
        page: current,
        totalPages,
        items: items.slice((current - 1) * size, current * size),
        start: items.length ? (current - 1) * size + 1 : 0,
        end: Math.min(current * size, items.length)
    };
}
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(window.APP_CONFIG.SUPABASE_URL + path, {
        ...options,
        headers: window.createSupabaseHeaders({
            'Content-Type': 'application/json',
            ...((options.headers as Record<string, string>) || {})
        })
    });
    if (!response.ok) {
        const message =
            response.status === 401 || response.status === 403
                ? 'Você não tem permissão para esta ação. Entre com uma conta autorizada.'
                : response.status === 409
                  ? 'Já existe um registro com esses dados.'
                  : 'Não foi possível concluir a operação. Tente novamente.';
        throw new Error(message);
    }
    if (response.status === 204 || response.headers.get('content-length') === '0')
        return undefined as T;
    const text = await response.text();
    return text ? JSON.parse(text) : (undefined as T);
}
export async function readRows<T>(path: string, signal?: AbortSignal): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 500) {
        const page = await request<T[]>(`${path}&limit=500&offset=${offset}`, { signal });
        if (!Array.isArray(page)) throw new Error('Não foi possível ler a lista. Tente novamente.');
        rows.push(...page);
        if (page.length < 500) return rows;
    }
}
export function loadPlayers(signal?: AbortSignal) {
    return readRows<PlayerRecord>('/rest/v1/players?select=*&order=name.asc', signal);
}
export async function savePlayer(player: Partial<PlayerRecord>) {
    const name = String(player.name || '').trim();
    if (name.length < 2) throw new Error('Informe um nome com pelo menos dois caracteres.');
    const payload = {
        name,
        bandai_id: player.bandai_id?.trim() || null,
        bandai_nick: player.bandai_nick?.trim() || null,
        digilab_name: player.digilab_name?.trim() || null
    };
    await request(
        '/rest/v1/players' + (player.id ? `?id=eq.${encodeURIComponent(player.id)}` : ''),
        {
            method: player.id ? 'PATCH' : 'POST',
            body: JSON.stringify(payload)
        }
    );
}
export function setActivity(kind: 'players' | 'decks', id: string | number, active: boolean) {
    return request(`/rest/v1/${kind}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: active })
    });
}
export async function loadDecks(
    context: MicroContext,
    signal?: AbortSignal
): Promise<DeckRecord[]> {
    const [decks, images] = await Promise.all([
        readRows<Omit<DeckRecord, 'image' | 'code' | 'formats' | 'hasDecklist'>>(
            '/rest/v1/decks?is_active=eq.true&select=*&order=name.asc',
            signal
        ),
        readRows<{ deck_id: string | number; image_url: string }>(
            '/rest/v1/deck_images?select=deck_id,image_url',
            signal
        )
    ]);
    const imageMap = new Map(images.map((image) => [String(image.deck_id), image.image_url]));
    const data = context.data.getSnapshot().data;
    const orderedFormats = [...(data.formats || [])]
        .sort(
            (a, b) =>
                Number(!!b.is_default) - Number(!!a.is_default) ||
                (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)
        )
        .map((format) => format.code);
    const eventFormats = [...data.events]
        .sort((a, b) => b.isoDate.localeCompare(a.isoDate))
        .map((event) => event.format);
    const ranks = new Map(
        [...new Set([...orderedFormats, ...eventFormats])].map((format, index) => [format, index])
    );
    const rank = (formats: string[]) =>
        Math.min(...formats.map((format) => ranks.get(format) ?? Infinity));
    return decks
        .map((deck) => {
            const image = imageMap.get(String(deck.id)) || '';
            const formats = [
                ...new Set(
                    data.events
                        .filter((event) =>
                            event.results.some(
                                (result) =>
                                    normalizeSearch(result.deck) === normalizeSearch(deck.name)
                            )
                        )
                        .map((event) => event.format)
                )
            ];
            formats.sort((a, b) => (ranks.get(a) ?? Infinity) - (ranks.get(b) ?? Infinity));
            return { ...deck, image, code: cardCode(image), formats, hasDecklist: false };
        })
        .sort((a, b) => rank(a.formats) - rank(b.formats) || a.name.localeCompare(b.name, 'pt-BR'));
}
export async function loadDecklistIds(signal?: AbortSignal) {
    const results = await Promise.allSettled([
        readRows<{ deck_id: string | number }>(
            '/rest/v1/tournament_results?select=deck_id,decklists!inner(id)',
            signal
        ),
        readRows<{ deck_id: string | number }>(
            '/rest/v1/tournament_results?select=deck_id&decklist=not.is.null',
            signal
        )
    ]);
    const successful = results.filter(
        (result): result is PromiseFulfilledResult<{ deck_id: string | number }[]> =>
            result.status === 'fulfilled'
    );
    if (!successful.length)
        throw new Error('Não foi possível consultar os decks com decklist. Tente novamente.');
    return new Set(successful.flatMap((result) => result.value).map((row) => String(row.deck_id)));
}
export async function loadHistory(
    kind: 'players' | 'decks',
    id: string | number,
    signal?: AbortSignal
) {
    const field = kind === 'players' ? 'player_id' : 'deck_id';
    const path = `/rest/v1/tournament_results?${field}=eq.${encodeURIComponent(id)}&select=*,store:stores(name),deck:decks(name),player:players(name),decklists(id)`;
    return readRows<HistoryRecord>(
        path + '&order=tournament_date.desc,placement.asc,id.asc',
        signal
    );
}
export async function loadHistoryDecklists(resultId: string | number, signal?: AbortSignal) {
    const rows = await request<NonNullable<HistoryRecord['decklists']>>(
        `/rest/v1/decklists?tournament_result_id=eq.${encodeURIComponent(resultId)}&select=id,draft_cards,decklist_cards(card_code,qty,position)`,
        { signal }
    );
    return rows.map((row) =>
        row.draft_cards != null
            ? {
                  ...row,
                  decklist_cards: row.draft_cards.map((card, index) => ({
                      card_code: card.code,
                      qty: card.qty,
                      position: index + 1
                  }))
              }
            : row
    );
}
export async function saveDeck(
    context: MicroContext,
    deck: {
        id?: string | number;
        name: string;
        code: string;
        colors: string;
        family_id?: string | null;
    },
    includeFamily: boolean
) {
    const name = deck.name.trim(),
        code = deck.code.trim().toUpperCase();
    if (name.length < 2) throw new Error('Informe um nome com pelo menos dois caracteres.');
    if (!/^(?:BT\d{1,2}|EX\d{1,2}|ST\d{1,2}|RB\d{1,2}|AD\d{1,2}|LM|P)-\d{1,3}$/.test(code))
        throw new Error('Informe um código de carta válido, como BT26-001.');
    const duplicate = await request<{ id: string | number }[]>(
        `/rest/v1/decks?name=eq.${encodeURIComponent(name)}&select=id${deck.id ? `&id=neq.${encodeURIComponent(deck.id)}` : ''}`
    );
    if (duplicate.length) throw new Error('Já existe um deck com esse nome.');
    await context.loadScript(deck.id ? 'decks/edit-deck/modal.js' : 'decks/create-deck/modal.js');
    const headers = window.createSupabaseHeaders();
    if (deck.id)
        await window.digistatsDeckMutations.update(
            window.APP_CONFIG.SUPABASE_URL,
            headers,
            deck.id,
            name,
            code,
            deck.colors,
            deck.family_id || null,
            includeFamily
        );
    else
        await window.digistatsDeckMutations.create(
            window.APP_CONFIG.SUPABASE_URL,
            headers,
            name,
            code,
            deck.colors
        );
}
