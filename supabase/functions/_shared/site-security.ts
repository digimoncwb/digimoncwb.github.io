async function serverRpc(name: string, body: Record<string, unknown>) {
    const base = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!base || !key) return { ok: false, missing: true, data: null };
    const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000)
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    return { ok: response.ok, missing: data?.code === 'PGRST202' || data?.code === '42883', data };
}
export async function siteActorAllowed(_client: unknown, userId: string) {
    try {
        const result = await serverRpc('site_actor_authorized', {
            p_user_id: userId,
            p_require_admin: true
        });
        return result.ok && result.data === true;
    } catch {
        return false;
    }
}
export async function siteAccountsEnabled() {
    const result = await serverRpc('site_accounts_enabled', {});
    if (result.missing) return false;
    if (!result.ok) throw new Error('Não foi possível verificar o controle de contas.');
    return result.data === true;
}
export function siteServiceHeaders(request: Request) {
    return {
        'x-site-operation-id': request.headers.get('x-site-operation-id') || '',
        'x-site-actor-id': request.headers.get('x-site-actor-id') || ''
    };
}
export function withSiteAudit(handler: (request: Request) => Promise<Response>) {
    return async (request: Request): Promise<Response> => {
        if (request.method === 'OPTIONS') return handler(request);
        const execution = crypto.randomUUID();
        let actor: string | null = null;
        const base = Deno.env.get('SUPABASE_URL');
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
        const trustedService = !!key && token === key;
        const operator = [
            ['x-digilab-verify-token', 'DIGILAB_VERIFY_TOKEN'],
            ['x-digilab-background-token', 'DIGILAB_BACKGROUND_SYNC_TOKEN']
        ].some(([header, name]) => {
            const supplied = request.headers.get(header);
            const configured = Deno.env.get(name);
            return !!supplied && !!configured && supplied === configured;
        });
        const validId = (value: string | null) =>
            value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
        const parent = trustedService ? validId(request.headers.get('x-site-operation-id')) : null;
        if (trustedService) actor = validId(request.headers.get('x-site-actor-id'));
        if (base && key && token && token !== key) {
            try {
                const response = await fetch(`${base}/auth/v1/user`, {
                    headers: { apikey: key, Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(8000)
                });
                const user = response.ok ? await response.json() : null;
                actor = typeof user?.id === 'string' ? user.id : null;
            } catch {
                /* A failed identity lookup never produces a trusted actor. */
            }
        }
        const headers = new Headers(request.headers);
        // Ignore actor/correlation headers supplied by the caller.
        headers.set('x-site-operation-id', execution);
        headers.set('x-site-actor-id', actor || '');
        headers.delete('x-site-parent-operation-id');
        if (parent) headers.set('x-site-parent-operation-id', parent);
        const operation =
            new URL(request.url).pathname.split('/').filter(Boolean).pop() || 'unknown';
        try {
            const started = await serverRpc('start_site_integration_event', {
                p_execution_id: execution,
                p_operation: operation,
                p_actor_user_id: actor,
                p_parent_operation_id: parent
            });
            if (!started.ok)
                console.error(
                    JSON.stringify({
                        event: 'site_audit_delivery_failed',
                        phase: 'start',
                        operation_id: execution
                    })
                );
        } catch {
            console.error(
                JSON.stringify({
                    event: 'site_audit_delivery_failed',
                    phase: 'start',
                    operation_id: execution
                })
            );
        }
        let response: Response;
        try {
            response = await handler(new Request(request, { headers }));
        } catch {
            response = new Response(
                JSON.stringify({ error: 'Não foi possível concluir a operação.' }),
                {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                }
            );
        }
        try {
            const result = await serverRpc('record_site_integration_event', {
                p_actor_user_id: actor,
                p_operation: operation,
                p_execution_id: execution,
                p_status: response.status,
                p_parent_operation_id: parent,
                p_actor_kind: actor ? 'user' : trustedService || operator ? 'service' : 'anonymous'
            });
            if (!result.ok)
                console.error(
                    JSON.stringify({
                        event: 'site_audit_delivery_failed',
                        operation_id: execution,
                        status: response.status
                    })
                );
        } catch {
            console.error(
                JSON.stringify({ event: 'site_audit_delivery_failed', operation_id: execution })
            );
        }
        const outputHeaders = new Headers(response.headers);
        outputHeaders.set('x-site-operation-id', execution);
        outputHeaders.set(
            'Access-Control-Expose-Headers',
            [outputHeaders.get('Access-Control-Expose-Headers'), 'x-site-operation-id']
                .filter(Boolean)
                .join(', ')
        );
        return new Response(response.body, { status: response.status, headers: outputHeaders });
    };
}
