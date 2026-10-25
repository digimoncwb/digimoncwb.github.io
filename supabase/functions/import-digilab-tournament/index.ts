import { withSiteAudit, siteActorAllowed, siteServiceHeaders } from '../_shared/site-security.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type, x-digilab-verify-token'
};
const DIGILAB_API_URL = 'https://api.digilab.cards';
const DIGILAB_SCENE = 'curitiba';
type JsonRecord = Record<string, any>;

Deno.serve(
    withSiteAudit(async (req) => {
        if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
        if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

        const apiKey = Deno.env.get('DIGILAB_API_KEY');
        const verifyToken = Deno.env.get('DIGILAB_VERIFY_TOKEN') || '';
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!apiKey || !supabaseUrl || !serviceRoleKey) {
            return json({ error: 'Integração DigiLab não configurada.' }, 500);
        }
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: siteServiceHeaders(req) }
        });
        if (!(await authorizeRequest(req, supabase, verifyToken))) {
            return json({ error: 'Não autorizado.' }, 401);
        }

        let input: JsonRecord;
        try {
            input = await req.json();
        } catch {
            return json({ error: 'JSON inválido.' }, 400);
        }
        const externalId = Number(input.digilab_tournament_id);
        if (!Number.isSafeInteger(externalId) || externalId <= 0) {
            return json({ error: 'digilab_tournament_id deve ser um inteiro positivo.' }, 400);
        }
        const targetTournamentId = input.target_tournament_id
            ? Number(input.target_tournament_id)
            : null;
        if (
            targetTournamentId !== null &&
            (!Number.isSafeInteger(targetTournamentId) || targetTournamentId <= 0)
        ) {
            return json({ error: 'target_tournament_id deve ser um inteiro positivo.' }, 400);
        }

        try {
            const detail = await digilabGet(apiKey, `/api/tournament/${externalId}`);
            const tournament = detail?.tournament || {};
            const standings = Array.isArray(detail?.standings) ? detail.standings : [];
            const dnfs = Array.isArray(detail?.dnfs) ? detail.dnfs : [];
            if (normalize(tournament.scene?.slug) !== normalize(DIGILAB_SCENE)) {
                return json({ error: 'O torneio não pertence à scene Curitiba.' }, 422);
            }
            if (dnfs.length) return json({ error: 'Torneios com DNF exigem revisão manual.' }, 422);
            if (!standings.length || Number(tournament.player_count) !== standings.length) {
                return json({ error: 'Standings incompletos para importação automática.' }, 422);
            }
            if (standings.some((row: JsonRecord) => !row.player?.slug)) {
                return json({ error: 'Jogador anônimo exige revisão manual.' }, 422);
            }

            const { data, error } = await supabase.rpc('sync_digilab_tournament_atomic', {
                p_external_id: externalId,
                p_tournament: {
                    ...tournament,
                    tournament_name: String(
                        input.tournament_name || mapDigilabTournamentName(tournament.event_type)
                    )
                        .trim()
                        .slice(0, 120)
                },
                p_standings: standings,
                p_player_mappings: Array.isArray(input.player_mappings)
                    ? input.player_mappings
                    : [],
                p_deck_mappings: Array.isArray(input.deck_mappings) ? input.deck_mappings : [],
                p_target_id: targetTournamentId
            });
            if (error) {
                const review = [
                    '22023',
                    '22P02',
                    '23502',
                    '23503',
                    '23505',
                    '23514',
                    'P0002'
                ].includes(error.code);
                return json({ error: error.message }, review ? 422 : 500);
            }
            return json({ ok: true, request_count: 1, ...data });
        } catch (error) {
            if (error instanceof DigilabHttpError) {
                return json(
                    {
                        error: 'Não foi possível consultar o DigiLab.',
                        digilab_status: error.status,
                        retry_after: error.retryAfter
                    },
                    error.status === 429 ? 429 : 502,
                    error.retryAfter ? { 'Retry-After': error.retryAfter } : undefined
                );
            }
            return json(
                { error: error instanceof Error ? error.message : 'Falha na importação.' },
                500
            );
        }
    })
);

function mapDigilabTournamentName(eventType: unknown) {
    const raw = String(eventType || '').trim();
    const normalized = raw.toLocaleLowerCase('en-US').replace(/[\s-]+/g, '_');
    const names: Record<string, string> = {
        locals: 'Semanal',
        evo_cup: 'Evo Cup'
    };
    return names[normalized] || 'Semanal';
}

class DigilabHttpError extends Error {
    status: number;
    retryAfter: string | null;
    constructor(status: number, message: string, retryAfter: string | null) {
        super(message);
        this.status = status;
        this.retryAfter = retryAfter;
    }
}

async function digilabGet(apiKey: string, path: string) {
    const response = await fetch(`${DIGILAB_API_URL}${path}`, {
        headers: { 'X-API-Key': apiKey }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new DigilabHttpError(
            response.status,
            typeof body?.error === 'string' ? body.error : 'Erro DigiLab.',
            response.headers.get('retry-after')
        );
    }
    return body;
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

function normalize(value: unknown) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, ...extraHeaders, 'Content-Type': 'application/json' }
    });
}
