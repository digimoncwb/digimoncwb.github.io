import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUBJECTS: Record<string, string> = {
    bug: '[DigiStats - Bug Report]',
    suggestion: '[DigiStats - Sugestão]',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Supabase não configurado.' }, 500);
    const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json({ error: 'Entre com sua conta para enviar uma mensagem.' }, 401);
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Entre com sua conta para enviar uma mensagem.' }, 401);

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Conteúdo inválido.' }, 400);
    }

    // Honeypot fields receive a fake success so bots do not learn how to bypass it.
    if (String(body.website || '').trim()) return json({ ok: true });

    const feedbackType = String(body.feedback_type || '');
    const subject = SUBJECTS[feedbackType];
    const message = String(body.message || '').trim();
    const requestId = String(body.request_id || '');
    const contactEmail = user.email?.trim() || null;
    const openedAt = Number(body.opened_at || 0);

    if (!subject || !/^[0-9a-f-]{36}$/i.test(requestId)) {
        return json({ error: 'Tipo de feedback inválido.' }, 400);
    }
    if (message.length < 10 || message.length > 5000) {
        return json({ error: 'A mensagem deve ter entre 10 e 5000 caracteres.' }, 400);
    }
    if (contactEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || contactEmail.length > 254)) {
        return json({ error: 'E-mail de contato inválido.' }, 400);
    }
    if (!openedAt || Date.now() - openedAt < 1200) {
        return json({ error: 'Envio rápido demais. Revise a mensagem e tente novamente.' }, 429);
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const recipient = Deno.env.get('FEEDBACK_RECIPIENT_EMAIL');
    const fromEmail = Deno.env.get('FEEDBACK_FROM_EMAIL');
    const { data: existingSubmission } = await supabase
        .from('feedback_submissions')
        .select('id,email_sent_at')
        .eq('request_id', requestId)
        .maybeSingle();
    if (existingSubmission?.email_sent_at) return json({ ok: true });

    const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const clientHash = await sha256(`${forwardedFor}:${serviceRoleKey.slice(-24)}`);
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await supabase
        .from('feedback_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('client_hash', clientHash)
        .gte('created_at', fifteenMinutesAgo);
    if ((count || 0) >= 5) {
        return json({ error: 'Muitas mensagens em pouco tempo. Tente novamente mais tarde.' }, 429);
    }

    const row = {
        request_id: requestId,
        feedback_type: feedbackType,
        subject,
        message,
        contact_email: contactEmail,
        page_url: limited(body.page_url, 1000),
        app_version: limited(body.app_version, 100),
        user_agent: limited(body.user_agent, 1000),
        client_hash: clientHash,
        status: 'new',
        email_error: null,
    };
    const { data: submission, error: insertError } = await supabase
        .from('feedback_submissions')
        .upsert(row, { onConflict: 'request_id' })
        .select('id,email_sent_at')
        .single();
    if (insertError) return json({ error: 'Não foi possível registrar a mensagem.' }, 500);
    if (submission.email_sent_at) return json({ ok: true });

    if (!resendApiKey || !recipient || !fromEmail) {
        await markFailed(supabase, submission.id, 'Secrets de e-mail não configurados.');
        return json({ error: 'O envio de e-mail ainda não está configurado.' }, 503);
    }

    const text = buildText({ subject, message, contactEmail, row });
    const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `digistats-feedback-${requestId}`,
        },
        body: JSON.stringify({
            from: fromEmail,
            to: [recipient],
            subject,
            text,
            html: `<div style="font-family:Arial,sans-serif;line-height:1.5">${escapeHtml(text).replaceAll('\n', '<br>')}</div>`,
            ...(contactEmail ? { reply_to: contactEmail } : {}),
        }),
    });
    const resendBody = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
        const error = String(resendBody.message || `Resend HTTP ${resendResponse.status}`).slice(0, 1000);
        await markFailed(supabase, submission.id, error);
        return json({ error: 'A mensagem foi registrada, mas o e-mail não pôde ser enviado.' }, 502);
    }

    await supabase.from('feedback_submissions').update({
        status: 'sent',
        provider_message_id: String(resendBody.id || '') || null,
        email_sent_at: new Date().toISOString(),
        email_error: null,
    }).eq('id', submission.id);

    return json({ ok: true });
});

function buildText({ subject, message, contactEmail, row }: Record<string, any>) {
    return [
        subject,
        '',
        message,
        '',
        `Contato: ${contactEmail || 'Não informado'}`,
        `Página: ${row.page_url || 'Não informada'}`,
        `Versão: ${row.app_version || 'Não informada'}`,
        `Navegador: ${row.user_agent || 'Não informado'}`,
    ].join('\n');
}

async function markFailed(supabase: any, id: number, error: string) {
    await supabase.from('feedback_submissions').update({
        status: 'failed', email_error: error.slice(0, 1000),
    }).eq('id', id);
}

async function sha256(value: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function limited(value: unknown, max: number) {
    const text = String(value || '').trim();
    return text ? text.slice(0, max) : null;
}

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    }[char] || char));
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}
