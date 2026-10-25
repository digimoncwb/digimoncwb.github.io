import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withSiteAudit, siteActorAllowed, siteServiceHeaders } from '../_shared/site-security.ts';

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type'
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' }
    });
Deno.serve(
    withSiteAudit(async (request) => {
        if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
        if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
        const url = Deno.env.get('SUPABASE_URL');
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!url || !key) return json({ error: 'Serviço indisponível.' }, 503);
        const client = createClient(url, key, { global: { headers: siteServiceHeaders(request) } });
        const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
        const { data: identity, error: authError } = await client.auth.getUser(token);
        if (authError || !identity.user)
            return json({ error: 'Entre com uma conta administrativa.' }, 401);
        const { data: membership } = await client
            .from('admin_users')
            .select('user_id')
            .eq('user_id', identity.user.id)
            .maybeSingle();
        if (!membership || !(await siteActorAllowed(client, identity.user.id)))
            return json({ error: 'Acesso administrativo necessário.' }, 403);
        const input = await request.json().catch(() => null);
        if (
            !input ||
            !/^[0-9a-f-]{36}$/i.test(input.job_id || '') ||
            input.confirm_delete_credentials !== true
        )
            return json({ error: 'Confirme o procedimento e a remoção de credenciais.' }, 400);
        const { data: job, error: jobError } = await client.rpc('site_account_erasure_target', {
            p_job_id: input.job_id
        });
        if (jobError || !job)
            return json({ error: 'Procedimento não preparado ou não encontrado.' }, 409);
        if (job.user_id === identity.user.id)
            return json({ error: 'Outro administrador deve concluir este procedimento.' }, 409);
        if (job.stage === 'completed' || job.stage === 'auth_deleted')
            return json({ ok: true, stage: job.stage });
        const { error: deleteError } = await client.auth.admin.deleteUser(job.user_id, false);
        // Retrying after an ambiguous response is safe: a missing user is success.
        const { data: remaining, error: lookupError } = await client.auth.admin.getUserById(
            job.user_id
        );
        const absent =
            !remaining?.user &&
            (lookupError?.status === 404 || lookupError?.code === 'user_not_found');
        const success = !deleteError || absent;
        const { error: finishError } = await client.rpc('finish_site_account_auth_erasure', {
            p_job_id: input.job_id,
            p_success: success
        });
        if (!success || finishError)
            return json(
                {
                    error: 'A remoção não foi confirmada. Revise arquivos pertencentes à conta e retome o procedimento.',
                    job_id: input.job_id
                },
                409
            );
        return json({ ok: true, stage: 'auth_deleted', external_review_required: true });
    })
);
