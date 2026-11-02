import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildPairings } from '../_shared/community-engine.mjs';
import { withSiteAudit } from '../_shared/site-security.ts';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Content-Type': 'application/json'
};
Deno.serve(
    withSiteAudit(async (request) => {
        if (request.method === 'OPTIONS') return new Response('ok', { headers });
        if (request.method !== 'POST') return new Response('{}', { status: 405, headers });
        try {
            const authorization = request.headers.get('authorization') || '';
            const client = createClient(
                Deno.env.get('SUPABASE_URL')!,
                Deno.env.get('SUPABASE_ANON_KEY')!,
                {
                    global: { headers: { Authorization: authorization } },
                    auth: { persistSession: false }
                }
            );
            const { data: user, error: authError } = await client.auth.getUser();
            if (authError || !user.user)
                return new Response('{"error":"Entre como administrador."}', {
                    status: 401,
                    headers
                });
            // This RPC checks active identity and admin membership even when legacy accounts are disabled.
            const { error: denied } = await client.rpc('community_list', { p_admin: true });
            if (denied)
                return new Response('{"error":"Acesso administrativo necessário."}', {
                    status: 403,
                    headers
                });
            const body = await request.json();
            const { data: snapshot, error } = await client.rpc('community_snapshot', {
                p_event: body.event_id
            });
            if (error) throw error;
            if (snapshot.event.revision !== body.revision)
                throw new Error('O torneio mudou. Atualize e tente novamente.');
            const seed = crypto.randomUUID();
            const pairs = buildPairings(snapshot.standings, snapshot.matches, seed);
            const result = await client.rpc('community_command', {
                p_event: body.event_id,
                p_action: 'pair',
                p_revision: body.revision,
                p_data: { seed, pairs }
            });
            if (result.error) throw result.error;
            return new Response(JSON.stringify(result.data), { headers });
        } catch (error) {
            return new Response(
                JSON.stringify({
                    error:
                        error instanceof Error
                            ? error.message
                            : (error as { message?: string }).message ||
                              'Falha ao gerar pareamentos.'
                }),
                { status: 400, headers }
            );
        }
    })
);
