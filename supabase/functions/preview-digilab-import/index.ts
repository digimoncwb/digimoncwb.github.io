import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type, x-digilab-verify-token'
};

const DIGILAB_API_URL = 'https://api.digilab.cards';
const DIGILAB_SCENE = 'curitiba';

type JsonRecord = Record<string, any>;

class DigilabHttpError extends Error {
    status: number;
    retryAfter: string | null;

    constructor(status: number, message: string, retryAfter: string | null = null) {
        super(message);
        this.status = status;
        this.retryAfter = retryAfter;
    }
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

    const apiKey = Deno.env.get('DIGILAB_API_KEY');
    const verifyToken = Deno.env.get('DIGILAB_VERIFY_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!apiKey || !supabaseUrl || !serviceRoleKey) {
        return json({ error: 'Integração DigiLab não configurada.' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    let body: JsonRecord = {};
    try {
        const rawBody = await req.text();
        if (rawBody.trim()) body = JSON.parse(rawBody);
    } catch {
        return json({ error: 'JSON inválido.' }, 400);
    }

    const rawRequestedId = body.digilab_tournament_id;
    const requestedId =
        rawRequestedId == null || rawRequestedId === '' || Number(rawRequestedId) === 0
            ? null
            : Number(rawRequestedId);
    if (requestedId !== null && (!Number.isSafeInteger(requestedId) || requestedId <= 0)) {
        return json({ error: 'digilab_tournament_id deve ser um inteiro positivo.' }, 400);
    }

    const publicSingleTournamentRequest = Boolean(requestedId);
    if (
        !publicSingleTournamentRequest &&
        !(await authorizeRequest(req, supabase, verifyToken || ''))
    ) {
        return json({ error: 'Não autorizado.' }, 401);
    }

    try {
        if (requestedId) return await previewTournament(supabase, apiKey, requestedId);

        const page = positiveInteger(body.page, 1, 1, 1000);
        const perPage = positiveInteger(body.per_page, 100, 1, 100);
        return await listInventory(supabase, apiKey, page, perPage);
    } catch (error) {
        if (error instanceof DigilabHttpError) {
            const status = error.status === 429 ? 429 : 502;
            const headers = error.retryAfter ? { 'Retry-After': error.retryAfter } : undefined;
            return json(
                {
                    ok: false,
                    error: 'Não foi possível consultar o DigiLab.',
                    digilab_status: error.status || null,
                    retry_after: error.retryAfter
                },
                status,
                headers
            );
        }
        return json({ ok: false, error: 'Não foi possível montar a prévia.' }, 500);
    }
});

async function listInventory(supabase: any, apiKey: string, page: number, perPage: number) {
    const query = new URLSearchParams({
        scene: DIGILAB_SCENE,
        page: String(page),
        per_page: String(perPage),
        sort: 'date',
        sort_dir: 'desc'
    });
    const body = await digilabGet(apiKey, `/api/tournaments?${query}`);
    const externalRows = Array.isArray(body?.data) ? body.data : [];
    const ids = externalRows.map(getExternalId).filter(Boolean) as number[];
    const dates = externalRows
        .map((row: JsonRecord) => String(row.event_date || ''))
        .filter(Boolean);

    const [syncRows, localRows] = await Promise.all([
        loadSyncRows(supabase, ids),
        dates.length > 0
            ? loadLocalTournaments(supabase, dates.reduce(minDate), dates.reduce(maxDate))
            : Promise.resolve([])
    ]);
    const syncByExternalId = new Map(
        syncRows.map((row: JsonRecord) => [Number(row.digilab_tournament_id), row])
    );

    const data = externalRows.map((external: JsonRecord) => {
        const externalId = getExternalId(external);
        const candidates = rankLocalCandidates(external, localRows);
        const exactCandidates = candidates.filter((candidate) => candidate.exact);
        const sync = externalId ? syncByExternalId.get(externalId) : null;

        let mappingStatus = 'new_import';
        if (sync) mappingStatus = linkedDataStatus(sync);
        else if (exactCandidates.length === 1) mappingStatus = 'exact_local_candidate';
        else if (exactCandidates.length > 1) mappingStatus = 'ambiguous';
        else if (candidates.some((candidate) => candidate.score > 0)) {
            mappingStatus = 'possible_local_candidate';
        }

        return {
            digilab_tournament_id: externalId,
            event_date: external.event_date || null,
            player_count: external.player_count ?? null,
            store_name: external.store_name || null,
            store_slug: external.store_slug || null,
            format: external.format || null,
            mapping_status: mappingStatus,
            linked_tournament_id: sync?.tournament_id || null,
            local_candidates: candidates.slice(0, 5)
        };
    });

    return json({
        ok: true,
        scene: DIGILAB_SCENE,
        request_count: 1,
        data,
        pagination: body?.pagination || null
    });
}

async function previewTournament(supabase: any, apiKey: string, externalId: number) {
    const body = await digilabGet(apiKey, `/api/tournament/${externalId}`);
    const tournament = body?.tournament || {};
    const sceneSlug = String(tournament.scene?.slug || '');
    if (normalize(sceneSlug) !== normalize(DIGILAB_SCENE)) {
        return json(
            {
                ok: false,
                error: 'O torneio informado não pertence à scene Curitiba.',
                scene_slug: sceneSlug || null
            },
            422
        );
    }

    const [syncRows, localRows] = await Promise.all([
        loadSyncRows(supabase, [externalId]),
        tournament.date
            ? loadLocalTournaments(supabase, String(tournament.date), String(tournament.date))
            : Promise.resolve([])
    ]);
    const listingShape = {
        event_date: tournament.date,
        player_count: tournament.player_count,
        store_name: tournament.store?.name,
        format: tournament.format
    };
    const localCandidates = rankLocalCandidates(listingShape, localRows);
    const standings = Array.isArray(body?.standings) ? body.standings : [];
    const dnfs = Array.isArray(body?.dnfs) ? body.dnfs : [];
    const importResolution = await resolveImportContext(supabase, tournament, standings);
    const deckComparison = syncRows[0]?.tournament_id
        ? await compareLinkedDecks(
              supabase,
              Number(syncRows[0].tournament_id),
              standings,
              importResolution
          )
        : null;
    const warnings = [];
    if (standings.some((row: JsonRecord) => !row.player?.slug)) warnings.push('anonymous_player');
    if (dnfs.length > 0) warnings.push('dnfs_not_supported_by_local_model');
    if (!tournament.store?.slug) warnings.push('store_without_slug');
    if (!tournament.format) warnings.push('format_missing');

    return json({
        ok: true,
        scene: DIGILAB_SCENE,
        request_count: 1,
        already_linked: syncRows[0] || null,
        tournament: {
            digilab_tournament_id: externalId,
            date: tournament.date || null,
            event_type: tournament.event_type || null,
            format: tournament.format || null,
            player_count: tournament.player_count ?? null,
            rounds: tournament.rounds ?? null,
            store: tournament.store || null,
            scene: tournament.scene || null
        },
        standings: standings.map((row: JsonRecord, index: number) => ({
            ...sanitizeStanding(row),
            player_match: importResolution.player_matches[index],
            deck_match: importResolution.deck_matches[index]
        })),
        dnfs: dnfs.map(sanitizeDnf),
        local_candidates: localCandidates,
        import_resolution: {
            store: importResolution.store,
            format: importResolution.format,
            unresolved_players: importResolution.player_matches.filter(
                (match: JsonRecord) => !match.player_id
            ),
            player_options: importResolution.player_options,
            unresolved_decks: importResolution.deck_matches.filter(
                (match: JsonRecord) => match.digilab_deck_slug && !match.deck_id
            ),
            deck_options: importResolution.deck_options
        },
        deck_comparison: deckComparison,
        warnings,
        structurally_importable: syncRows.length === 0 && warnings.length === 0,
        can_auto_import:
            syncRows.length === 0 &&
            warnings.length === 0 &&
            localCandidates.every((candidate: JsonRecord) => candidate.score === 0) &&
            Boolean(importResolution.store?.store_id) &&
            Boolean(
                importResolution.format?.format_id ||
                importResolution.format?.status === 'auto_create'
            ) &&
            importResolution.player_matches.every(
                (match: JsonRecord) =>
                    match.player_id ||
                    (match.status === 'unmatched' &&
                        match.digilab_player_slug &&
                        normalize(match.digilab_player_name))
            ) &&
            importResolution.deck_matches.every(
                (match: JsonRecord) =>
                    !match.digilab_deck_slug ||
                    match.deck_id ||
                    (match.status === 'unmatched' && normalize(match.digilab_deck_name))
            ),
        next_step: 'confirm_player_mapping_and_import'
    });
}

async function resolveImportContext(
    supabase: any,
    tournament: JsonRecord,
    standings: JsonRecord[]
) {
    const slugs = standings
        .map((row: JsonRecord) => String(row.player?.slug || '').trim())
        .filter(Boolean);
    const deckSlugs = standings
        .map((row: JsonRecord) => String(row.deck?.slug || '').trim())
        .filter(Boolean);
    const [
        playersResult,
        mappingsResult,
        storesResult,
        formatsResult,
        decksResult,
        deckMappingsResult
    ] = await Promise.all([
        supabase.from('players').select('id,name,digilab_name').order('name'),
        slugs.length
            ? supabase
                  .from('digilab_player_sync')
                  .select('digilab_player_slug,player_id')
                  .in('digilab_player_slug', slugs)
            : Promise.resolve({ data: [], error: null }),
        supabase.from('stores').select('id,name'),
        supabase.from('formats').select('id,code,is_default,is_active'),
        supabase.from('decks').select('id,name').order('name'),
        deckSlugs.length
            ? supabase
                  .from('digilab_deck_sync')
                  .select('digilab_deck_slug,deck_id')
                  .in('digilab_deck_slug', deckSlugs)
            : Promise.resolve({ data: [], error: null })
    ]);
    if (
        playersResult.error ||
        mappingsResult.error ||
        storesResult.error ||
        formatsResult.error ||
        decksResult.error ||
        deckMappingsResult.error
    ) {
        throw new Error('Falha ao resolver o de-para da importação.');
    }

    const players = playersResult.data || [];
    const playersById = new Map(players.map((player: JsonRecord) => [player.id, player]));
    const mappings = new Map(
        (mappingsResult.data || []).map((row: JsonRecord) => [
            row.digilab_player_slug,
            row.player_id
        ])
    );
    const playerMatches = standings.map((standing: JsonRecord) => {
        const slug = String(standing.player?.slug || '').trim();
        const name = String(standing.player?.name || '').trim();
        const mappedPlayer = playersById.get(mappings.get(slug));
        if (mappedPlayer) {
            return {
                digilab_player_slug: slug,
                digilab_player_name: name,
                status: 'mapped',
                player_id: mappedPlayer.id,
                player_name: mappedPlayer.name
            };
        }
        const normalizedName = normalize(name);
        const exact = players.filter(
            (player: JsonRecord) =>
                normalize(player.digilab_name) === normalizedName ||
                normalize(player.name) === normalizedName
        );
        if (slug && normalizedName && exact.length === 1) {
            return {
                digilab_player_slug: slug,
                digilab_player_name: name,
                status: 'exact_name',
                player_id: exact[0].id,
                player_name: exact[0].name
            };
        }
        return {
            digilab_player_slug: slug || null,
            digilab_player_name: name || null,
            status: exact.length > 1 ? 'ambiguous' : 'unmatched',
            player_id: null,
            player_name: null,
            candidates: exact.slice(0, 10).map((player: JsonRecord) => ({
                player_id: player.id,
                player_name: player.name
            }))
        };
    });

    const decks = decksResult.data || [];
    const decksById = new Map(decks.map((deck: JsonRecord) => [deck.id, deck]));
    const deckMappings = new Map(
        (deckMappingsResult.data || []).map((row: JsonRecord) => [
            row.digilab_deck_slug,
            row.deck_id
        ])
    );
    const deckMatches = standings.map((standing: JsonRecord) => {
        const slug = String(standing.deck?.slug || '').trim();
        const name = String(standing.deck?.name || '').trim();
        if (!slug && !name) {
            return {
                digilab_deck_slug: null,
                digilab_deck_name: null,
                status: 'not_informed',
                deck_id: null,
                deck_name: null
            };
        }
        const mappedDeck = decksById.get(deckMappings.get(slug));
        if (mappedDeck) {
            return {
                digilab_deck_slug: slug,
                digilab_deck_name: name,
                status: 'mapped',
                deck_id: mappedDeck.id,
                deck_name: mappedDeck.name
            };
        }
        const exact = decks.filter((deck: JsonRecord) => normalize(deck.name) === normalize(name));
        return {
            digilab_deck_slug: slug || null,
            digilab_deck_name: name || null,
            status:
                exact.length === 1 ? 'exact_name' : exact.length > 1 ? 'ambiguous' : 'unmatched',
            deck_id: exact.length === 1 ? exact[0].id : null,
            deck_name: exact.length === 1 ? exact[0].name : null
        };
    });

    const stores = (storesResult.data || []).filter(
        (store: JsonRecord) => normalize(store.name) === normalize(tournament.store?.name)
    );
    const formats = formatsResult.data || [];
    const formatCode = String(tournament.format || '').trim();
    const digilabFormat = formats.find(
        (format: JsonRecord) => normalizeFormat(format.code) === normalizeFormat(formatCode)
    );
    const selectedFormat =
        digilabFormat ||
        (normalizeFormat(formatCode) ? { id: null, code: formatCode } : null) ||
        null;

    return {
        player_matches: playerMatches,
        player_options: players.map((player: JsonRecord) => ({
            player_id: player.id,
            player_name: player.name,
            digilab_name: player.digilab_name || null
        })),
        deck_matches: deckMatches,
        deck_options: decks.map((deck: JsonRecord) => ({
            deck_id: deck.id,
            deck_name: deck.name
        })),
        store:
            stores.length === 1
                ? { status: 'matched', store_id: stores[0].id, store_name: stores[0].name }
                : { status: stores.length > 1 ? 'ambiguous' : 'unmatched', store_id: null },
        format: selectedFormat
            ? {
                  status: digilabFormat
                      ? 'matched'
                      : normalizeFormat(formatCode)
                        ? 'auto_create'
                        : 'default_fallback',
                  format_id: selectedFormat.id,
                  format_code: selectedFormat.code
              }
            : { status: 'unmatched', format_id: null }
    };
}

async function loadSyncRows(supabase: any, externalIds: number[]) {
    if (externalIds.length === 0) return [];
    const { data, error } = await supabase
        .from('tournament_digilab_sync')
        .select(
            'tournament_id,digilab_tournament_id,digilab_url,status,verified_at,last_checked_at,comparison_summary'
        )
        .in('digilab_tournament_id', externalIds);
    if (error) throw new Error('Falha ao ler vínculos existentes.');
    return data || [];
}

function linkedDataStatus(sync: JsonRecord) {
    const source = String(sync?.comparison_summary?.source || '');
    return [
        'digilab_reverse_sync',
        'digilab_reverse_import',
        'admin_digilab_reconciliation'
    ].includes(source)
        ? 'linked_synced'
        : 'linked_needs_review';
}

async function compareLinkedDecks(
    supabase: any,
    tournamentId: number,
    standings: JsonRecord[],
    resolution: JsonRecord
) {
    const { data, error } = await supabase
        .from('tournament_results')
        .select('player_id,deck_id,deck:decks(name)')
        .eq('tournament_id', tournamentId);
    if (error) throw new Error('Falha ao comparar os decks do torneio vinculado.');
    const localByPlayer = new Map(
        (data || []).map((row: JsonRecord) => [String(row.player_id || ''), row])
    );
    const rows = standings.map((standing: JsonRecord, index: number) => {
        const playerMatch = resolution.player_matches[index] || {};
        const deckMatch = resolution.deck_matches[index] || {};
        const local = playerMatch.player_id
            ? localByPlayer.get(String(playerMatch.player_id))
            : null;
        let status = 'matched';
        if (!playerMatch.player_id || !local) status = 'result_missing';
        else if (!deckMatch.deck_id) status = 'external_unresolved';
        else if (!local.deck_id) status = 'local_missing';
        else if (String(local.deck_id) !== String(deckMatch.deck_id)) status = 'divergent';
        return {
            digilab_player_slug: standing.player?.slug || null,
            player_id: playerMatch.player_id || null,
            player_name: playerMatch.player_name || standing.player?.name || null,
            local_deck_id: local?.deck_id || null,
            local_deck_name: local?.deck?.name || null,
            digilab_deck_id: deckMatch.deck_id || null,
            digilab_deck_name: deckMatch.deck_name || standing.deck?.name || null,
            status
        };
    });
    return {
        tournament_id: tournamentId,
        rows,
        counts: rows.reduce(
            (counts: JsonRecord, row: JsonRecord) => {
                counts[row.status] = (counts[row.status] || 0) + 1;
                return counts;
            },
            {
                matched: 0,
                local_missing: 0,
                divergent: 0,
                result_missing: 0,
                external_unresolved: 0
            }
        )
    };
}

async function loadLocalTournaments(supabase: any, dateFrom: string, dateTo: string) {
    const { data: tournaments, error: tournamentError } = await supabase
        .from('tournament')
        .select('id,tournament_name,tournament_date,total_players,rounds,store_id,format_id')
        .gte('tournament_date', dateFrom)
        .lte('tournament_date', dateTo)
        .order('tournament_date', { ascending: false });
    if (tournamentError) throw new Error('Falha ao ler torneios locais.');
    if (!tournaments?.length) return [];

    const storeIds = [
        ...new Set(tournaments.map((row: JsonRecord) => row.store_id).filter(Boolean))
    ];
    const formatIds = [
        ...new Set(tournaments.map((row: JsonRecord) => row.format_id).filter(Boolean))
    ];
    const [storesResult, formatsResult] = await Promise.all([
        storeIds.length > 0
            ? supabase.from('stores').select('id,name').in('id', storeIds)
            : Promise.resolve({ data: [], error: null }),
        formatIds.length > 0
            ? supabase.from('formats').select('id,code').in('id', formatIds)
            : Promise.resolve({ data: [], error: null })
    ]);
    if (storesResult.error || formatsResult.error) {
        throw new Error('Falha ao ler lojas ou formatos locais.');
    }

    const stores = new Map(
        (storesResult.data || []).map((row: JsonRecord) => [row.id, String(row.name || '')])
    );
    const formats = new Map(
        (formatsResult.data || []).map((row: JsonRecord) => [row.id, String(row.code || '')])
    );
    return tournaments
        .filter(
            (row: JsonRecord) =>
                String(row.tournament_name || '')
                    .trim()
                    .toLowerCase() !== '2v2'
        )
        .map((row: JsonRecord) => ({
            tournament_id: Number(row.id),
            tournament_name: row.tournament_name || null,
            event_date: String(row.tournament_date || ''),
            player_count: Number(row.total_players),
            rounds: row.rounds == null ? null : Number(row.rounds),
            store_name: stores.get(row.store_id) || null,
            format: formats.get(row.format_id) || null
        }));
}

function rankLocalCandidates(external: JsonRecord, localRows: JsonRecord[]) {
    return localRows
        .filter((local) => String(local.event_date) === String(external.event_date || ''))
        .map((local) => {
            const playerCountMatch = Number(local.player_count) === Number(external.player_count);
            const storeMatch = normalize(local.store_name) === normalize(external.store_name);
            const formatMatch = normalizeFormat(local.format) === normalizeFormat(external.format);
            const score =
                Number(playerCountMatch) * 4 + Number(storeMatch) * 2 + Number(formatMatch);
            return {
                ...local,
                score,
                exact: playerCountMatch && storeMatch,
                matches: {
                    date: true,
                    player_count: playerCountMatch,
                    store: storeMatch,
                    format: formatMatch
                }
            };
        })
        .sort(
            (left, right) => right.score - left.score || right.tournament_id - left.tournament_id
        );
}

async function digilabGet(apiKey: string, path: string) {
    let response: Response;
    try {
        response = await fetch(`${DIGILAB_API_URL}${path}`, {
            headers: { 'X-API-Key': apiKey }
        });
    } catch {
        throw new DigilabHttpError(0, 'Falha de rede ao consultar o DigiLab.');
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new DigilabHttpError(
            response.status,
            typeof body?.error === 'string' ? body.error : `DigiLab HTTP ${response.status}`,
            response.headers.get('retry-after')
        );
    }
    return body;
}

function sanitizeStanding(row: JsonRecord) {
    return {
        placement: row.placement ?? null,
        player: row.player
            ? { name: row.player.name || null, slug: row.player.slug || null }
            : null,
        record: row.record || null,
        match_points: deriveMatchPoints(row.record),
        match_points_source: row.record ? 'derived_3_win_1_tie' : null,
        deck: row.deck ? { name: row.deck.name || null, slug: row.deck.slug || null } : null,
        has_decklist: Boolean(row.has_decklist),
        decklist_url: row.decklist_url || null
    };
}

function deriveMatchPoints(record: JsonRecord | null | undefined) {
    if (!record) return null;
    const wins = Number(record.wins);
    const ties = Number(record.ties);
    if (!Number.isSafeInteger(wins) || wins < 0 || !Number.isSafeInteger(ties) || ties < 0) {
        return null;
    }
    return wins * 3 + ties;
}

function sanitizeDnf(row: JsonRecord) {
    return {
        player: row.player
            ? { name: row.player.name || null, slug: row.player.slug || null }
            : null,
        deck: row.deck ? { name: row.deck.name || null, slug: row.deck.slug || null } : null,
        has_decklist: Boolean(row.has_decklist),
        decklist_url: row.decklist_url || null
    };
}

function getExternalId(row: JsonRecord) {
    const value = Number(row?.tournament_id ?? row?.id);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function positiveInteger(value: unknown, fallback: number, min: number, max: number) {
    const number = Number(value ?? fallback);
    return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

function minDate(left: string, right: string) {
    return left < right ? left : right;
}

function maxDate(left: string, right: string) {
    return left > right ? left : right;
}

function normalize(value: unknown) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function normalizeFormat(value: unknown) {
    return String(value || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}

async function authorizeRequest(req: Request, supabase: any, verifyToken: string) {
    const operatorToken = req.headers.get('x-digilab-verify-token') || '';
    if (verifyToken && (await secretsMatch(operatorToken, verifyToken))) return true;

    const match = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
    if (!match) return false;

    const { data, error } = await supabase.auth.getUser(match[1]);
    if (error || !data?.user?.id) return false;

    const { data: admin, error: adminError } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', data.user.id)
        .maybeSingle();
    return !adminError && Boolean(admin);
}

async function secretsMatch(provided: string, expected: string) {
    if (!provided || !expected) return false;
    const [providedHash, expectedHash] = await Promise.all([sha256(provided), sha256(expected)]);
    if (providedHash.length !== expectedHash.length) return false;
    let difference = 0;
    for (let index = 0; index < providedHash.length; index += 1) {
        difference |= providedHash[index] ^ expectedHash[index];
    }
    return difference === 0;
}

async function sha256(value: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return new Uint8Array(digest);
}

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, ...extraHeaders, 'Content-Type': 'application/json' }
    });
}
