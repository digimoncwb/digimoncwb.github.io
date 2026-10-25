import { withSiteAudit, siteActorAllowed, siteServiceHeaders } from '../_shared/site-security.ts';
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
        'authorization, apikey, content-type, x-digilab-background-token'
};

const MAX_IMPORTS_PER_RUN = 8;
const REQUEST_DELAY_MS = 1300;
const REVIEW_RETRY_HOURS = 6;
const ERROR_RETRY_MINUTES = 30;
type JsonRecord = Record<string, any>;

Deno.serve(
    withSiteAudit(async (req) => {
        if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
        if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

        const backgroundToken = Deno.env.get('DIGILAB_BACKGROUND_SYNC_TOKEN') || '';
        const providedToken = req.headers.get('x-digilab-background-token') || '';
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const verifyToken = Deno.env.get('DIGILAB_VERIFY_TOKEN') || '';
        if (!supabaseUrl || !serviceRoleKey || !verifyToken) {
            return json({ error: 'Sincronização em background não configurada.' }, 500);
        }

        const backgroundAuthorized = Boolean(
            backgroundToken && (await secretsMatch(providedToken, backgroundToken))
        );
        if (!backgroundAuthorized && !(await isAuthorizedAdmin(req, supabaseUrl, serviceRoleKey))) {
            return json({ error: 'Não autorizado.' }, 401);
        }

        let input: JsonRecord = {};
        try {
            const rawBody = await req.text();
            if (rawBody.trim()) input = JSON.parse(rawBody);
        } catch {
            return json({ error: 'Corpo da requisicao invalido.' }, 400);
        }

        const rpc = async (name: string, body: JsonRecord) =>
            (
                await restRequest(supabaseUrl, serviceRoleKey, `rpc/${name}`, {
                    method: 'POST',
                    body,
                    headers: siteServiceHeaders(req)
                })
            ).data;
        const call = (name: string, body: JsonRecord) =>
            callFunction(
                supabaseUrl,
                serviceRoleKey,
                verifyToken,
                name,
                body,
                siteServiceHeaders(req)
            );
        const rest = (path: string, options: JsonRecord = {}) =>
            restRequest(supabaseUrl, serviceRoleKey, path, {
                ...options,
                headers: { ...options.headers, ...siteServiceHeaders(req) }
            });
        const action = input.action || 'run';
        if (!['run', 'history', 'retry'].includes(action))
            return json({ error: 'Acao invalida.' }, 400);
        if (backgroundAuthorized && action !== 'run')
            return json({ error: 'Acao exclusiva do administrador.' }, 403);
        if (action === 'history') {
            try {
                const [runs, events, pending] = await Promise.all([
                    rest('digilab_sync_runs?select=*&order=started_at.desc&limit=20'),
                    rest('digilab_sync_events?select=*&order=id.desc&limit=80'),
                    rest(
                        'digilab_background_imports?select=digilab_tournament_id,status,last_error,next_attempt_at,attempt_count&status=in.(needs_review,retry,processing)&order=next_attempt_at&limit=100'
                    )
                ]);
                return json({
                    ok: true,
                    runs: runs.data,
                    events: events.data,
                    pending: pending.data
                });
            } catch (error) {
                return json(
                    {
                        error:
                            error instanceof Error ? error.message : 'Falha ao carregar historico.'
                    },
                    500
                );
            }
        }
        const retryId = action === 'retry' ? Number(input.digilab_tournament_id) : null;
        if (action === 'retry' && !positiveInteger(retryId))
            return json({ error: 'ID DigiLab invalido.' }, 400);
        const summary: JsonRecord = {
            discovered: 0,
            attempted: 0,
            imported: 0,
            updated: 0,
            players_created: 0,
            decks_created: 0,
            needs_review: 0,
            failed: 0,
            skipped: 0,
            pages_scanned: 0
        };
        let runId: string | null = null;
        const deadline = Date.now() + 60000;
        try {
            const run = await rpc('start_digilab_sync_run', {
                p_source: backgroundAuthorized ? 'scheduled' : 'admin'
            });
            if (run.busy) return json({ ok: true, busy: true, run_id: run.run_id });
            runId = run.run_id;
            if (retryId) {
                await rest(
                    `digilab_background_imports?digilab_tournament_id=eq.${retryId}&status=in.(needs_review,retry,imported,pending)`,
                    {
                        method: 'PATCH',
                        body: { next_attempt_at: new Date().toISOString() }
                    }
                );
            } else {
                if (!backgroundAuthorized && input.retry_review_now === true) {
                    await rest('digilab_background_imports?status=in.(needs_review,retry)', {
                        method: 'PATCH',
                        body: { next_attempt_at: new Date().toISOString() }
                    });
                }
                // Always scan the newest page, then resume historical discovery.
                const pages = [1, Math.max(2, Number(run.next_page) || 2)];
                for (const page of pages) {
                    if (Date.now() >= deadline) break;
                    const inventory = await call('preview-digilab-import', { page, per_page: 100 });
                    summary.pages_scanned += 1;
                    const rows = (inventory.data || []).filter(
                        (row: JsonRecord) =>
                            positiveInteger(row.digilab_tournament_id) &&
                            (row.mapping_status === 'new_import' ||
                                (row.linked_tournament_id && isRecent(row.event_date)))
                    );
                    if (rows.length) {
                        const inserted = await rest(
                            'digilab_background_imports?on_conflict=digilab_tournament_id',
                            {
                                method: 'POST',
                                headers: {
                                    Prefer: 'resolution=ignore-duplicates,return=representation'
                                },
                                body: rows.map((row: JsonRecord) => ({
                                    digilab_tournament_id: Number(row.digilab_tournament_id),
                                    tournament_id: row.linked_tournament_id || null,
                                    status: 'pending',
                                    event_date: row.event_date || null,
                                    store_name: row.store_name || null,
                                    format: row.format || null,
                                    player_count: row.player_count ?? null,
                                    next_attempt_at: new Date().toISOString()
                                }))
                            }
                        );
                        summary.discovered += inserted.data?.length || 0;
                        // Bring legacy imported rows (previously parked forever) into the review window.
                        const recentIds = rows
                            .filter(
                                (row: JsonRecord) =>
                                    row.linked_tournament_id && isRecent(row.event_date)
                            )
                            .map((row: JsonRecord) => Number(row.digilab_tournament_id));
                        if (recentIds.length)
                            await rest(
                                `digilab_background_imports?digilab_tournament_id=in.(${recentIds.join(',')})&status=eq.imported&next_attempt_at=gt.${encodeURIComponent(addTime({ hours: 6 }))}`,
                                {
                                    method: 'PATCH',
                                    body: { next_attempt_at: new Date().toISOString() }
                                }
                            );
                    }
                    const lastPage = Number(
                        inventory.pagination?.last_page || inventory.pagination?.total_pages
                    );
                    if (page > 1) {
                        const end =
                            (lastPage > 0 && page >= lastPage) ||
                            (inventory.data || []).length < 100;
                        await rest(`digilab_sync_state?id=eq.true&run_id=eq.${runId}`, {
                            method: 'PATCH',
                            body: { next_page: end ? 2 : page + 1 }
                        });
                    }
                    await delay(REQUEST_DELAY_MS);
                    if (page === 1 && lastPage === 1) break;
                }
            }
            for (
                let index = 0;
                index < (retryId ? 1 : MAX_IMPORTS_PER_RUN) && Date.now() < deadline;
                index += 1
            ) {
                const claimed = await rpc('claim_digilab_sync_item', {
                    p_run_id: runId,
                    p_external_id: retryId
                });
                const row = claimed?.[0];
                if (!row) break;
                const externalId = Number(row.digilab_tournament_id);
                summary.attempted += 1;
                let outcome = 'retry';
                let details: JsonRecord = {};
                let tournamentId = row.tournament_id || null;
                let nextAttempt = addTime({ minutes: ERROR_RETRY_MINUTES });
                let stop = false;
                try {
                    const preview = await call('preview-digilab-import', {
                        digilab_tournament_id: externalId
                    });
                    if (!preview.already_linked && !preview.can_auto_import) {
                        outcome = 'needs_review';
                        details = { error: describeReviewReasons(preview) };
                        summary.needs_review += 1;
                        nextAttempt = addTime({ hours: REVIEW_RETRY_HOURS });
                    } else {
                        await delay(REQUEST_DELAY_MS);
                        // The importer validates structure and resolves registrations transactionally for both paths.
                        const imported = await call('import-digilab-tournament', {
                            digilab_tournament_id: externalId
                        });
                        if (!positiveInteger(imported.tournament_id))
                            throw new Error('Importacao sem vinculo confirmado.');
                        tournamentId = Number(imported.tournament_id);
                        outcome = imported.reused
                            ? Number(imported.results_updated) > 0 ||
                              Number(imported.results_added) > 0 ||
                              imported.tournament_updated
                                ? 'updated'
                                : 'unchanged'
                            : 'imported';
                        summary[outcome === 'unchanged' ? 'skipped' : outcome] += 1;
                        summary.players_created += Number(imported.players_created) || 0;
                        summary.decks_created += Number(imported.decks_created) || 0;
                        details = imported;
                        nextAttempt = isRecent(preview.tournament?.date || row.event_date)
                            ? addTime({ hours: 6 })
                            : farFuture();
                    }
                } catch (error) {
                    const httpError = error instanceof FunctionHttpError ? error : null;
                    const review = httpError?.status === 422;
                    outcome = review ? 'needs_review' : 'retry';
                    summary[review ? 'needs_review' : 'failed'] += 1;
                    details = {
                        error:
                            error instanceof Error
                                ? error.message.slice(0, 1000)
                                : 'Falha desconhecida.'
                    };
                    nextAttempt = review
                        ? addTime({ hours: REVIEW_RETRY_HOURS })
                        : addTime({
                              seconds: retryDelaySeconds(httpError?.retryAfter, row.attempt_count)
                          });
                    stop = httpError?.status === 429;
                }
                await rpc('finish_digilab_sync_item', {
                    p_run_id: runId,
                    p_external_id: externalId,
                    p_outcome: outcome,
                    p_details: details,
                    p_next_attempt: nextAttempt,
                    p_tournament_id: tournamentId
                });
                if (stop) break;
                await delay(REQUEST_DELAY_MS);
            }
            await rpc('finish_digilab_sync_run', {
                p_run_id: runId,
                p_summary: summary,
                p_error: null
            });
            return json({ ok: true, run_id: runId, ...summary });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Falha na rotina.';
            if (runId) {
                try {
                    await rpc('finish_digilab_sync_run', {
                        p_run_id: runId,
                        p_summary: summary,
                        p_error: message
                    });
                } catch {
                    /* The lease recovers interrupted runs even when the database is unavailable. */
                }
            }
            return json({ ok: false, run_id: runId, ...summary, error: message }, 500);
        }
    })
);

function isRecent(date: unknown) {
    const timestamp = Date.parse(String(date || ''));
    return Number.isFinite(timestamp) && timestamp >= Date.now() - 30 * 86400000;
}

function retryDelaySeconds(retryAfter: string | null | undefined, attempts: number) {
    const parsed = Number(retryAfter);
    const seconds =
        Number.isFinite(parsed) && parsed > 0
            ? parsed
            : Math.max(0, (Date.parse(String(retryAfter || '')) - Date.now()) / 1000);
    return Math.max(
        Number.isFinite(seconds) ? seconds : 0,
        Math.min(
            6 * 3600,
            ERROR_RETRY_MINUTES * 60 * 2 ** Math.min(4, Math.max(0, Number(attempts || 1) - 1))
        )
    );
}

class FunctionHttpError extends Error {
    status: number;
    retryAfter: string | null;

    constructor(status: number, message: string, retryAfter: string | null) {
        super(message);
        this.status = status;
        this.retryAfter = retryAfter;
    }
}

async function callFunction(
    supabaseUrl: string,
    serviceRoleKey: string,
    verifyToken: string,
    functionName: string,
    body: JsonRecord,
    auditHeaders: Record<string, string> = {}
) {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            'x-digilab-verify-token': verifyToken,
            ...auditHeaders
        },
        body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new FunctionHttpError(
            response.status,
            String(payload.error || `Falha na função ${functionName}.`),
            response.headers.get('retry-after')
        );
    }
    return payload;
}

async function restRequest(
    supabaseUrl: string,
    serviceRoleKey: string,
    path: string,
    options: JsonRecord = {}
) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        method: options.method || 'GET',
        signal: AbortSignal.timeout(8000),
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(String(data?.message || data?.error || `REST HTTP ${response.status}`));
    }
    return { status: response.status, data };
}

function describeReviewReasons(preview: JsonRecord) {
    const reasons = [];
    const resolution = preview.import_resolution || {};
    if (!resolution.store?.store_id) reasons.push('loja sem de-para');
    if (!resolution.format?.format_id && resolution.format?.status !== 'auto_create')
        reasons.push('formato sem de-para');
    for (const kind of ['player', 'deck']) {
        const blocked = (resolution[`unresolved_${kind}s`] || []).filter(
            (row: JsonRecord) =>
                row.status !== 'unmatched' ||
                !row[`digilab_${kind}_slug`] ||
                !String(row[`digilab_${kind}_name`] || '').trim()
        );
        if (blocked.length) reasons.push(`${blocked.length} ${kind}(s) sem de-para`);
    }
    if (preview.local_candidates?.some((candidate: JsonRecord) => Number(candidate.score) > 0)) {
        reasons.push('possível torneio local na mesma data');
    }
    if (preview.warnings?.length) reasons.push(preview.warnings.join(', '));
    return (reasons.join(' · ') || 'revisão manual necessária').slice(0, 1000);
}

function positiveInteger(value: unknown) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0;
}

function addTime({ hours = 0, minutes = 0, seconds = 0 }) {
    return new Date(Date.now() + ((hours * 60 + minutes) * 60 + seconds) * 1000).toISOString();
}

function farFuture() {
    return '9999-12-31T23:59:59.999Z';
}

function delay(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function isAuthorizedAdmin(req: Request, supabaseUrl: string, serviceRoleKey: string) {
    const match = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
    if (!match) return false;

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${match[1]}` }
    });
    if (!userResponse.ok) return false;
    const user = await userResponse.json().catch(() => null);
    if (!user?.id) return false;

    const adminResponse = await fetch(
        `${supabaseUrl}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id&limit=1`,
        {
            headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`
            }
        }
    );
    if (!adminResponse.ok) return false;
    const admins = await adminResponse.json().catch(() => []);
    return Array.isArray(admins) && admins.length === 1 && (await siteActorAllowed(null, user.id));
}

async function secretsMatch(provided: string, expected: string) {
    if (!provided || !expected) return false;
    const encoder = new TextEncoder();
    const [leftHash, rightHash] = await Promise.all([
        crypto.subtle.digest('SHA-256', encoder.encode(provided)),
        crypto.subtle.digest('SHA-256', encoder.encode(expected))
    ]);
    const left = new Uint8Array(leftHash);
    const right = new Uint8Array(rightHash);
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    return difference === 0;
}

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, ...extraHeaders, 'Content-Type': 'application/json' }
    });
}
