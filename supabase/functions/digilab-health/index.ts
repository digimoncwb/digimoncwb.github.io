import { withSiteAudit, siteActorAllowed, siteServiceHeaders } from '../_shared/site-security.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type, x-digilab-verify-token'
};

const DIGILAB_HEALTH_URL = 'https://api.digilab.cards/api/tournaments?per_page=1';

Deno.serve(
    withSiteAudit(async (req) => {
        if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
        if (req.method !== 'GET' && req.method !== 'POST') {
            return json({ ok: false, error: 'Método não permitido.' }, 405);
        }

        const apiKey = Deno.env.get('DIGILAB_API_KEY');
        const verifyToken = Deno.env.get('DIGILAB_VERIFY_TOKEN') || '';
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!apiKey || !supabaseUrl || !serviceRoleKey) {
            return json(
                { ok: false, configured: false, error: 'Integração DigiLab não configurada.' },
                500
            );
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: siteServiceHeaders(req) }
        });
        if (!(await authorizeRequest(req, supabase, verifyToken))) {
            return json({ ok: false, error: 'Não autorizado.' }, 401);
        }

        try {
            const response = await fetch(DIGILAB_HEALTH_URL, {
                headers: { 'X-API-Key': apiKey }
            });
            const body = await response.json().catch(() => null);

            if (!response.ok) {
                return json(
                    {
                        ok: false,
                        configured: true,
                        digilab_status: response.status,
                        retry_after: response.headers.get('retry-after'),
                        error:
                            typeof body?.error === 'string'
                                ? body.error
                                : 'Erro retornado pelo DigiLab.'
                    },
                    502
                );
            }

            return json({
                ok: true,
                configured: true,
                digilab_status: response.status,
                returned_items: Array.isArray(body?.data) ? body.data.length : null,
                pagination_received: Boolean(body?.pagination)
            });
        } catch {
            return json(
                {
                    ok: false,
                    configured: true,
                    error: 'Não foi possível conectar ao DigiLab.'
                },
                502
            );
        }
    })
);

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
    const [providedHash, expectedHash] = await Promise.all([
        crypto.subtle.digest('SHA-256', encoder.encode(provided)),
        crypto.subtle.digest('SHA-256', encoder.encode(expected))
    ]);
    const left = new Uint8Array(providedHash);
    const right = new Uint8Array(expectedHash);
    let difference = left.length ^ right.length;
    for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    return difference === 0;
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' }
    });
}
