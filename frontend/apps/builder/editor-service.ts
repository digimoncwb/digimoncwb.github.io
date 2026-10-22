import type { Format, MicroContext } from '../../contracts';
import { readRows, request } from '../workspace/catalog-service';
import {
    aggregate,
    cardCode,
    mergeCatalog,
    normalizeCard,
    parseImport,
    sortEntries,
    type Card,
    type Entry,
    type FormatRules
} from './editor-model';

export async function orderListCards<
    T extends { card_code: string; qty: number; position?: number }
>(items: T[], signal?: AbortSignal): Promise<T[]> {
    if (!items.length) return [];
    const codes = [...new Set(items.map((item) => cardCode(item.card_code)).filter(Boolean))];
    const metadata: Record<string, unknown>[] = [];
    for (let offset = 0; offset < codes.length; offset += 100) {
        metadata.push(
            ...(await readRows<Record<string, unknown>>(
                `/rest/v1/decklist_card_metadata?card_code=in.(${codes.slice(offset, offset + 100).join(',')})&select=card_code,name,card_type,card_level,is_digi_egg,color,card_payload&order=card_code.asc`,
                signal
            ))
        );
    }
    const cards = new Map(mergeCatalog(metadata).map((card) => [card.code, card]));
    const ordered = sortEntries(
        items.map((item) => ({ code: item.card_code, qty: item.qty })),
        cards,
        'level'
    );
    const ranks = new Map(ordered.map((entry, index) => [entry.code, index]));
    return items
        .map((item, index) => ({ item, index }))
        .sort(
            (a, b) =>
                ranks.get(a.item.card_code)! - ranks.get(b.item.card_code)! || a.index - b.index
        )
        .map(({ item }, index) => ({ ...item, position: index + 1 }));
}

export interface DeckRecord {
    id: string | number | null;
    name: string;
    deck_format_id: string | number | null;
    draft_cards: Entry[] | null;
    draft_revision: number;
    tournament_result_id?: string | null;
    archetype_id?: string | null;
    creator_player_id?: string | null;
    creator?: { name: string } | null;
}
let assetBoot: Promise<void> | null = null;
export async function loadAssets(context: MicroContext) {
    assetBoot ||= context.loadScript('torneios/decklist-builder/script.js').catch((error) => {
        assetBoot = null;
        throw error;
    });
    await assetBoot;
    return window.digistatsBuilderAssets;
}
export async function loadCatalog(context: MicroContext, signal: AbortSignal) {
    const rows = await readRows<Record<string, unknown>>(
        '/rest/v1/decklist_card_metadata?select=card_code,name,card_type,card_level,is_digi_egg,color,card_payload&order=card_code.asc',
        signal
    );
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const candidates = mergeCatalog(rows);
    const cards = candidates.filter((card) => card.known);
    if (!cards.length) throw new Error('Não foi possível carregar o catálogo de cartas.');
    return {
        cards,
        warning: candidates.some((card) => !card.known)
            ? 'Há cadastros incompletos aguardando sincronização no catálogo.'
            : ''
    };
}
export async function loadRules(signal: AbortSignal, assets: Window['digistatsBuilderAssets']) {
    const rows = await readRows<{ card_code: string; restriction: string }>(
        '/rest/v1/ban_list?select=card_code,restriction&order=card_code.asc',
        signal
    );
    const rules: FormatRules = assets.systemRules();
    rules.banned_codes = [
        ...new Set([
            ...(rules.banned_codes || []),
            ...rows.filter((r) => r.restriction === 'banned').map((r) => r.card_code)
        ])
    ];
    rules.limited_cards = {
        ...rules.limited_cards,
        ...Object.fromEntries(
            rows.filter((r) => r.restriction === 'limited').map((r) => [r.card_code, 1])
        )
    };
    return rules;
}
export function loadFormats(signal: AbortSignal) {
    return readRows<Format>(
        '/rest/v1/deck_formats?select=id,code,name,is_active,is_default,created_at,description,rules_text,rules_url,is_community_highlight,validation_rules,rules_revision,rules_status,updated_at,change_note&order=created_at.desc,id.desc',
        signal
    );
}
export async function loadDeck(
    context: MicroContext,
    signal: AbortSignal
): Promise<{ deck: DeckRecord; entries: Entry[]; result: Record<string, unknown> | null }> {
    const p = context.route.params;
    const resultId = p.get('resultId') || p.get('result_id');
    const id = p.get('decklistId');
    let result: Record<string, unknown> | null = null;
    if (resultId) {
        result = (
            await request<Record<string, unknown>[]>(
                `/rest/v1/tournament_results?id=eq.${encodeURIComponent(resultId)}&select=id,tournament_id,store_id,tournament_date,decklist,deck_id,player:players(name),deck:decks(name),store:stores(name)`,
                { signal }
            )
        )[0];
        if (!result) throw new Error('Participação não encontrada ou sem permissão.');
        const eventPath = result.tournament_id
            ? `id=eq.${encodeURIComponent(String(result.tournament_id))}`
            : `store_id=eq.${encodeURIComponent(String(result.store_id))}&tournament_date=eq.${encodeURIComponent(String(result.tournament_date))}`;
        const events = await request<Record<string, unknown>[]>(
            `/rest/v1/tournament?${eventPath}&select=id,tournament_name,tournament_date,deck_format_id,collection:formats(code,name)`,
            { signal }
        );
        if (events.length !== 1)
            throw new Error(
                'Não foi possível identificar um único torneio para esta participação.'
            );
        result.event = events[0];
    }
    const rows =
        resultId || id
            ? await request<DeckRecord[]>(
                  `/rest/v1/decklists?${resultId ? `tournament_result_id=eq.${encodeURIComponent(resultId)}` : `id=eq.${encodeURIComponent(id!)}&tournament_result_id=is.null`}&select=id,name,deck_format_id,draft_cards,draft_revision,tournament_result_id,archetype_id,creator_player_id,creator:players(name)`,
                  { signal }
              )
            : [];
    if (id && !resultId && !rows[0])
        throw new Error('Deck não encontrado. Volte à biblioteca e tente novamente.');
    const deck = rows[0] || {
        id: null,
        name: p.get('deck') || 'Meu deck Digimon',
        deck_format_id: p.get('formatId') || null,
        draft_cards: null,
        draft_revision: 0,
        tournament_result_id: resultId,
        archetype_id: p.get('archetypeId'),
        creator_player_id: p.get('creatorPlayerId') || null,
        creator: p.get('creatorPlayerName') ? { name: p.get('creatorPlayerName')! } : null
    };
    if (!deck.name)
        deck.name = String(
            (result?.deck as { name?: string })?.name || p.get('deck') || 'Meu deck Digimon'
        );
    if (deck.draft_cards != null) return { deck, entries: aggregate(deck.draft_cards), result };
    if (deck.id) {
        const cards = await readRows<{ card_code: string; qty: number }>(
            `/rest/v1/decklist_cards?decklist_id=eq.${encodeURIComponent(deck.id)}&select=card_code,qty&order=position.asc`,
            signal
        );
        if (cards.length)
            return { deck, entries: cards.map((c) => ({ code: c.card_code, qty: c.qty })), result };
    }
    const legacy = parseImport(String(result?.decklist || ''));
    return { deck, entries: legacy.entries, result };
}
export async function saveDraft(input: {
    id: string | number | null;
    resultId: string | null;
    name: string;
    formatId: string;
    entries: Entry[];
    revision: number;
    archetypeId?: string | null;
    creatorPlayerId?: string | null;
}) {
    const response = await fetch(window.APP_CONFIG.SUPABASE_URL + '/rest/v1/rpc/save_deck_draft', {
        method: 'POST',
        headers: window.createSupabaseHeaders(),
        body: JSON.stringify({
            p_decklist_id: input.id,
            p_result_id: input.resultId,
            p_name: input.name,
            p_deck_format_id: input.formatId,
            p_cards: input.entries,
            p_expected_revision: input.revision,
            p_archetype_id: input.archetypeId || null,
            p_creator_player_id: input.creatorPlayerId || null
        })
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
            error.code === '40001'
                ? 'Este deck foi atualizado por outra pessoa. Suas alterações continuam aqui; reabra a lista em outra aba para comparar antes de substituir.'
                : error.code === '42501'
                  ? 'Você não tem permissão para salvar esta lista.'
                  : error.message || 'Falha ao salvar. Suas alterações foram preservadas.'
        );
    }
    return response.json() as Promise<{
        id: number;
        draft_revision: number;
        rules_revision: number;
    }>;
}
export async function resolveDetails(context: MicroContext, code: string): Promise<Card> {
    const rows = await request<Record<string, unknown>[]>(
        `/rest/v1/decklist_card_metadata?card_code=eq.${encodeURIComponent(code)}&select=*`
    );
    return normalizeCard(rows[0] || { card_code: code });
}
