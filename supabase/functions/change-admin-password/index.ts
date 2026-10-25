import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
    withSiteAudit,
    siteActorAllowed,
    siteAccountsEnabled,
    siteServiceHeaders
} from '../_shared/site-security.ts';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(
    withSiteAudit(async (req) => {
        if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
        if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !anonKey || !serviceRoleKey) {
            return json({ error: 'Autenticação administrativa não configurada.' }, 500);
        }

        const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
        if (!token) return json({ error: 'Não autorizado.' }, 401);

        const service = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: siteServiceHeaders(req) }
        });
        const { data: userResult, error: userError } = await service.auth.getUser(token);
        const user = userResult?.user;
        if (userError || !user?.id || !user.email) return json({ error: 'Sessão inválida.' }, 401);

        const { data: profile, error: profileError } = await service
            .from('admin_users')
            .select('user_id')
            .eq('user_id', user.id)
            .maybeSingle();
        if (profileError || !profile) return json({ error: 'Administrador não autorizado.' }, 403);
        if (!(await siteActorAllowed(service, user.id)))
            return json({ error: 'Conta administrativa inativa.' }, 403);
        if (await siteAccountsEnabled() || !user.email.endsWith('@admin.digistats.local'))
            return json({ error: 'Use a recuperação da sua conta pessoal.' }, 409);

        let input: Record<string, unknown> = {};
        try {
            input = await req.json();
        } catch {
            return json({ error: 'JSON inválido.' }, 400);
        }
        const currentPassword = String(input.current_password || '');
        const newPassword = String(input.new_password || '');
        if (!currentPassword) return json({ error: 'Informe a senha atual.' }, 400);
        if (newPassword.length < 3 || newPassword.length > 72) {
            return json(
                {
                    error: 'A nova senha deve ter entre 3 e 72 caracteres.'
                },
                400
            );
        }
        if (currentPassword === newPassword) {
            return json({ error: 'A nova senha deve ser diferente da atual.' }, 400);
        }

        const verification = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { apikey: anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, password: currentPassword })
        });
        if (!verification.ok) return json({ error: 'Senha atual incorreta.' }, 401);

        const nextEmail = await deriveCredentialEmail(newPassword);
        const { error: updateError } = await service.auth.admin.updateUserById(user.id, {
            email: nextEmail,
            password: newPassword,
            email_confirm: true
        });
        if (updateError) {
            const duplicate = /already|registered|exists|unique/i.test(updateError.message);
            return json(
                {
                    error: duplicate
                        ? 'Essa senha já está sendo usada por outro administrador.'
                        : 'Não foi possível alterar a senha.'
                },
                duplicate ? 409 : 500
            );
        }

        return json({ ok: true });
    })
);

async function deriveCredentialEmail(password: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    const hash = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    return `p-${hash.slice(0, 40)}@${ADMIN_AUTH_DOMAIN}`;
}

function json(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' }
    });
}
