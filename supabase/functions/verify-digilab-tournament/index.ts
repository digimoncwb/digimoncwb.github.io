import { withSiteAudit, siteActorAllowed, siteServiceHeaders } from '../_shared/site-security.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type, x-digilab-verify-token'
};

const DIGILAB_API_URL = 'https://api.digilab.cards';
const DIGILAB_SITE_URL = 'https://digilab.cards';
const DIGILAB_SCENE = 'curitiba';
const COOLDOWN_MS = 15 * 60 * 1000;
const MAX_CANDIDATES = 10;

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

class SyncPersistenceError extends Error {}

Deno.serve(
    withSiteAudit(async (req) => {
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
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: siteServiceHeaders(req) }
        });
        if (!(await authorizeRequest(req, supabase, verifyToken || ''))) {
            return json({ error: 'Não autorizado.' }, 401);
        }

        let body: JsonRecord;
        try {
            body = await req.json();
        } catch {
            return json({ error: 'JSON inválido.' }, 400);
        }

        const tournamentId = Number(body.tournament_id);
        if (!Number.isSafeInteger(tournamentId) || tournamentId <= 0) {
            return json({ error: 'tournament_id deve ser um inteiro positivo.' }, 400);
        }

        const requestedDigilabId =
            body.digilab_tournament_id == null ? null : Number(body.digilab_tournament_id);
        const forceMatch = body.force_match === true;
        if (
            requestedDigilabId !== null &&
            (!Number.isSafeInteger(requestedDigilabId) || requestedDigilabId <= 0)
        ) {
            return json({ error: 'digilab_tournament_id deve ser um inteiro positivo.' }, 400);
        }

        const { data: previousSync, error: syncReadError } = await supabase
            .from('tournament_digilab_sync')
            .select(
                'tournament_id,digilab_tournament_id,digilab_url,status,verified_at,last_checked_at'
            )
            .eq('tournament_id', tournamentId)
            .maybeSingle();

        if (syncReadError)
            return json({ error: 'Não foi possível ler o estado da integração.' }, 500);

        if (previousSync?.status === 'matched') {
            return json({ ok: true, reused: true, sync: previousSync });
        }

        const retryAfterSeconds = forceMatch ? 0 : cooldownRemaining(previousSync?.last_checked_at);
        if (retryAfterSeconds > 0) {
            return json(
                {
                    ok: false,
                    error: 'Aguarde antes de verificar este torneio novamente.',
                    retry_after: retryAfterSeconds,
                    sync: previousSync
                },
                429,
                { 'Retry-After': String(retryAfterSeconds) }
            );
        }

        const local = await loadLocalTournament(supabase, tournamentId);
        if ('error' in local) return json({ error: local.error }, local.status);

        const checkedAt = new Date().toISOString();

        try {
            const discovery = requestedDigilabId
                ? { candidates: [{ tournament_id: requestedDigilabId }], requestCount: 0 }
                : await discoverCandidates(apiKey, local);
            const candidates = discovery.candidates.slice(0, MAX_CANDIDATES);

            if (discovery.candidates.length > MAX_CANDIDATES) {
                const summary = {
                    reason: 'candidate_limit_exceeded',
                    candidate_count: discovery.candidates.length,
                    request_count: discovery.requestCount
                };
                await saveSync(supabase, tournamentId, 'ambiguous', checkedAt, summary);
                return json({ ok: true, status: 'ambiguous', ...summary });
            }

            if (candidates.length === 0) {
                const summary = {
                    reason: 'no_candidates',
                    request_count: discovery.requestCount
                };
                await saveSync(supabase, tournamentId, 'not_found', checkedAt, summary);
                return json({ ok: true, status: 'not_found', ...summary });
            }

            const comparisons = [];
            let requestCount = discovery.requestCount;

            for (const candidate of candidates) {
                const externalId = getExternalId(candidate);
                if (!externalId) continue;

                const detail = await digilabGet(apiKey, `/api/tournament/${externalId}`);
                requestCount += 1;
                comparisons.push(compareTournament(local, externalId, detail));
            }

            const matches = comparisons.filter((item) => item.mismatches.length === 0);

            if (matches.length === 1) {
                const match = matches[0];
                const digilabUrl = `${DIGILAB_SITE_URL}/tournament/${match.digilab_tournament_id}`;
                const summary = {
                    request_count: requestCount,
                    compared_candidates: comparisons.length,
                    warnings: match.warnings
                };
                await saveSync(supabase, tournamentId, 'matched', checkedAt, summary, {
                    digilabTournamentId: match.digilab_tournament_id,
                    digilabUrl,
                    verifiedAt: checkedAt
                });
                return json({
                    ok: true,
                    status: 'matched',
                    digilab_tournament_id: match.digilab_tournament_id,
                    digilab_url: digilabUrl,
                    ...summary
                });
            }

            if (matches.length > 1) {
                const summary = {
                    reason: 'multiple_exact_matches',
                    request_count: requestCount,
                    candidate_ids: matches.map((item) => item.digilab_tournament_id)
                };
                await saveSync(supabase, tournamentId, 'ambiguous', checkedAt, summary);
                return json({ ok: true, status: 'ambiguous', ...summary });
            }

            if (forceMatch && requestedDigilabId && comparisons.length === 1) {
                const reviewed = comparisons[0];
                const digilabUrl = `${DIGILAB_SITE_URL}/tournament/${reviewed.digilab_tournament_id}`;
                const summary = {
                    source: 'admin_manual_override',
                    manual_override: true,
                    request_count: requestCount,
                    compared_candidates: 1,
                    accepted_mismatches: reviewed.mismatches,
                    warnings: reviewed.warnings
                };
                await saveSync(supabase, tournamentId, 'matched', checkedAt, summary, {
                    digilabTournamentId: reviewed.digilab_tournament_id,
                    digilabUrl,
                    verifiedAt: checkedAt
                });
                return json({
                    ok: true,
                    status: 'matched',
                    manual_override: true,
                    digilab_tournament_id: reviewed.digilab_tournament_id,
                    digilab_url: digilabUrl,
                    ...summary
                });
            }

            const summary = {
                reason: 'candidate_mismatch',
                request_count: requestCount,
                candidates: comparisons.map((item) => ({
                    digilab_tournament_id: item.digilab_tournament_id,
                    mismatches: item.mismatches,
                    warnings: item.warnings
                }))
            };
            await saveSync(supabase, tournamentId, 'mismatch', checkedAt, summary);
            return json({ ok: true, status: 'mismatch', ...summary });
        } catch (error) {
            if (error instanceof SyncPersistenceError) {
                return json({ error: 'Não foi possível salvar o estado da integração.' }, 500);
            }

            const isDigilabError = error instanceof DigilabHttpError;
            const externalStatus = isDigilabError ? error.status : null;
            const retryAfter = isDigilabError ? error.retryAfter : null;
            const errorCode = externalStatus
                ? `digilab_${externalStatus}`
                : 'digilab_network_error';

            try {
                await saveSync(
                    supabase,
                    tournamentId,
                    'api_error',
                    checkedAt,
                    { stage: 'digilab_request', external_status: externalStatus },
                    { errorCode }
                );
            } catch {
                return json({ error: 'Não foi possível salvar o estado da integração.' }, 500);
            }

            if (externalStatus === 429) {
                const headers = retryAfter ? { 'Retry-After': retryAfter } : undefined;
                return json(
                    {
                        ok: false,
                        status: 'api_error',
                        error: 'Limite do DigiLab atingido.',
                        retry_after: retryAfter
                    },
                    429,
                    headers
                );
            }

            return json(
                {
                    ok: false,
                    status: 'api_error',
                    error: 'Não foi possível consultar o DigiLab.',
                    digilab_status: externalStatus
                },
                502
            );
        }
    })
);

async function loadLocalTournament(supabase: any, tournamentId: number) {
    const { data: tournament, error: tournamentError } = await supabase
        .from('tournament')
        .select('id,tournament_name,tournament_date,total_players,rounds,store_id,format_id')
        .eq('id', tournamentId)
        .maybeSingle();

    if (tournamentError)
        return { error: 'Não foi possível carregar o torneio local.', status: 500 };
    if (!tournament) return { error: 'Torneio local não encontrado.', status: 404 };
    if (
        String(tournament.tournament_name || '')
            .trim()
            .toLowerCase() === '2v2'
    )
        return { error: 'O torneio 2v2 é exclusivamente local.', status: 422 };
    if (!tournament.tournament_date || !tournament.store_id || !tournament.total_players) {
        return { error: 'Torneio local sem data, loja ou quantidade de jogadores.', status: 422 };
    }

    const [storeResult, formatResult, resultsResult] = await Promise.all([
        supabase.from('stores').select('name').eq('id', tournament.store_id).maybeSingle(),
        supabase.from('formats').select('code').eq('id', tournament.format_id).maybeSingle(),
        supabase
            .from('tournament_results')
            .select('placement,player_id')
            .eq('tournament_id', tournamentId)
            .order('placement', { ascending: true })
    ]);

    if (storeResult.error || formatResult.error || resultsResult.error) {
        return {
            error: 'Não foi possível carregar os dados relacionados ao torneio.',
            status: 500
        };
    }
    if (!storeResult.data?.name || !formatResult.data?.code) {
        return { error: 'Loja ou formato local não encontrado.', status: 422 };
    }

    const rows = resultsResult.data || [];
    const playerIds = [...new Set(rows.map((row: JsonRecord) => row.player_id).filter(Boolean))];
    if (rows.length === 0 || playerIds.length !== rows.length) {
        return { error: 'Todos os resultados precisam possuir um jogador.', status: 422 };
    }

    const { data: players, error: playersError } = await supabase
        .from('players')
        .select('id,name,digilab_name')
        .in('id', playerIds);
    if (playersError) return { error: 'Não foi possível carregar os jogadores.', status: 500 };

    const playersById = new Map((players || []).map((player: JsonRecord) => [player.id, player]));
    const standings = rows.map((row: JsonRecord) => {
        const player = playersById.get(row.player_id) as JsonRecord | undefined;
        return {
            placement: Number(row.placement),
            playerName: String(player?.digilab_name || player?.name || '').trim()
        };
    });

    if (standings.some((row: JsonRecord) => !row.playerName)) {
        return { error: 'Todos os resultados precisam possuir um nome DigiLab.', status: 422 };
    }

    return {
        id: tournament.id,
        date: String(tournament.tournament_date),
        playerCount: Number(tournament.total_players),
        rounds: tournament.rounds == null ? null : Number(tournament.rounds),
        storeName: String(storeResult.data.name),
        format: String(formatResult.data.code),
        standings
    };
}

async function discoverCandidates(apiKey: string, local: JsonRecord) {
    let requestCount = 0;
    const commonParams = {
        date_from: local.date,
        date_to: local.date,
        scene: DIGILAB_SCENE,
        per_page: '100'
    };

    const searched = await listTournaments(apiKey, { ...commonParams, search: local.storeName });
    requestCount += 1;
    let candidates = filterListingCandidates(searched.data, local);

    if (candidates.length === 0) {
        const unfiltered = await listTournaments(apiKey, commonParams);
        requestCount += 1;
        candidates = filterListingCandidates(unfiltered.data, local);
    }

    return { candidates, requestCount };
}

async function listTournaments(apiKey: string, params: Record<string, string>) {
    const query = new URLSearchParams(params);
    const body = await digilabGet(apiKey, `/api/tournaments?${query}`);
    return { data: Array.isArray(body?.data) ? body.data : [] };
}

function filterListingCandidates(rows: JsonRecord[], local: JsonRecord) {
    return rows.filter((row) => {
        return (
            String(row.event_date || '') === local.date &&
            Number(row.player_count) === local.playerCount &&
            Boolean(getExternalId(row))
        );
    });
}

function compareTournament(local: JsonRecord, externalId: number, detail: JsonRecord) {
    const tournament = detail?.tournament || {};
    const externalStandings = Array.isArray(detail?.standings) ? detail.standings : [];
    const dnfs = Array.isArray(detail?.dnfs) ? detail.dnfs : [];
    const mismatches: string[] = [];
    const warnings: string[] = [];

    if (String(tournament.date || '') !== local.date) mismatches.push('date');
    if (Number(tournament.player_count) !== local.playerCount) mismatches.push('player_count');
    if (normalize(tournament.store?.name) !== normalize(local.storeName)) mismatches.push('store');
    if (normalize(tournament.scene?.slug) !== normalize(DIGILAB_SCENE)) mismatches.push('scene');
    if (normalizeFormat(tournament.format) !== normalizeFormat(local.format))
        warnings.push('format');
    if (dnfs.length > 0) mismatches.push('dnfs');
    if (externalStandings.length !== local.standings.length) mismatches.push('standings_count');

    const hasTiedPlacements =
        new Set(externalStandings.map((row: JsonRecord) => Number(row.placement))).size !==
        externalStandings.length;

    if (hasTiedPlacements) {
        const localPlayers = local.standings
            .map((row: JsonRecord) => normalize(row.playerName))
            .sort();
        const externalPlayers = externalStandings
            .map((row: JsonRecord) => normalize(row.player?.name))
            .sort();
        if (
            localPlayers.length !== externalPlayers.length ||
            localPlayers.some((name: string, index: number) => name !== externalPlayers[index])
        ) {
            mismatches.push('standings_players');
        } else {
            warnings.push('tied_placements');
        }
    } else {
        const externalByPlacement = new Map(
            externalStandings.map((row: JsonRecord) => [Number(row.placement), row])
        );
        for (const localRow of local.standings) {
            const externalRow = externalByPlacement.get(localRow.placement) as
                | JsonRecord
                | undefined;
            if (
                !externalRow ||
                normalize(externalRow.player?.name) !== normalize(localRow.playerName)
            ) {
                mismatches.push(`standing_${localRow.placement}`);
            }
        }
    }

    return {
        digilab_tournament_id: externalId,
        mismatches: [...new Set(mismatches)],
        warnings: [...new Set(warnings)]
    };
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

async function saveSync(
    supabase: any,
    tournamentId: number,
    status: string,
    checkedAt: string,
    summary: JsonRecord,
    options: JsonRecord = {}
) {
    const { error } = await supabase.from('tournament_digilab_sync').upsert(
        {
            tournament_id: tournamentId,
            digilab_tournament_id: options.digilabTournamentId || null,
            digilab_url: options.digilabUrl || null,
            status,
            verified_at: options.verifiedAt || null,
            last_checked_at: checkedAt,
            last_error_code: options.errorCode || null,
            comparison_summary: summary
        },
        { onConflict: 'tournament_id' }
    );
    if (error) throw new SyncPersistenceError('Falha ao persistir sincronização.');
}

function getExternalId(row: JsonRecord) {
    const value = Number(row?.tournament_id ?? row?.id);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function cooldownRemaining(lastCheckedAt: string | null | undefined) {
    if (!lastCheckedAt) return 0;
    const elapsed = Date.now() - new Date(lastCheckedAt).getTime();
    if (!Number.isFinite(elapsed) || elapsed >= COOLDOWN_MS) return 0;
    return Math.ceil((COOLDOWN_MS - elapsed) / 1000);
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
    return !adminError && Boolean(admin) && (await siteActorAllowed(supabase, data.user.id));
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
