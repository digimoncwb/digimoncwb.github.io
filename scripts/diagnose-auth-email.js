// Read-only diagnostics. Never print raw logs, addresses, SMTP credentials,
// session tokens or provider response bodies.
function summarizeAuthEmailLogs(rows) {
    if (!Array.isArray(rows)) throw Error('Formato de logs não reconhecido.');
    const events = [];
    for (const row of rows) {
        const raw = JSON.stringify(row);
        if (!/mail|smtp|recover|resend|signup|invite/i.test(raw)) continue;
        const categories = [];
        if (
            /\b(?:535|534)\b|badcredentials|authentication.{0,30}fail|username.{0,30}password.{0,30}not accepted/i.test(
                raw
            )
        )
            categories.push('smtp_authentication_failed');
        if (/rate.?limit|too many|\b454\b/i.test(raw)) categories.push('send_rate_limit');
        if (/\b(?:550|553|554)\b|recipient.{0,30}reject|mailbox.{0,30}unavailable/i.test(raw))
            categories.push('delivery_rejected');
        if (/connection refused|dial tcp|timed? out|tls.{0,30}(?:fail|error)/i.test(raw))
            categories.push('smtp_connection_failed');
        if (/hook.{0,40}(?:fail|error)/i.test(raw)) categories.push('email_hook_failed');
        if (/mail\.send|email[_. ]sent|sent.{0,15}(?:email|mail)/i.test(raw))
            categories.push('mail_send_logged');
        if (/user_recovery_requested/i.test(raw)) categories.push('recovery_requested');
        if (/request completed/i.test(raw)) categories.push('request_completed');
        if (/error|fail/i.test(raw) && !categories.some((c) => /failed|rejected|limit/.test(c)))
            categories.push('other_email_error');
        if (!categories.length) categories.push('email_activity');
        // Only controlled enums and timestamps are emitted, even if a provider
        // embeds private addresses or tokens in an error message.
        const timestamp = row.timestamp;
        events.push({
            timestamp:
                typeof timestamp === 'number' ||
                (typeof timestamp === 'string' &&
                    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(timestamp))
                    ? timestamp
                    : null,
            categories
        });
    }
    return { inspected_rows: rows.length, email_events: events };
}

async function main() {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    const project = process.env.SUPABASE_PROJECT_ID;
    if (!token || !/^[a-z0-9]{20}$/.test(project || ''))
        throw Error('Configuração de diagnóstico ausente.');
    const base = `https://api.supabase.com/v1/projects/${project}`;
    async function get(path) {
        const response = await fetch(base + path, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(30000)
        });
        if (!response.ok)
            throw Error(`Consulta de diagnóstico indisponível: HTTP ${response.status}.`);
        return response.json();
    }
    const config = await get('/config/auth');
    console.log(
        JSON.stringify({
            event: 'email_delivery_configuration',
            smtp_configured: !!(config.smtp_host && config.smtp_user && config.smtp_admin_email),
            custom_email_hook_enabled: config.hook_send_email_enabled === true,
            email_provider_enabled: config.external_email_enabled === true,
            send_limit_per_hour:
                typeof config.rate_limit_email_sent === 'number'
                    ? config.rate_limit_email_sent
                    : null,
            minimum_send_interval_seconds:
                typeof config.smtp_max_frequency === 'number' ? config.smtp_max_frequency : null,
            messages_sent_by_diagnostic: 0
        })
    );
    const end = new Date();
    const start = new Date(end.getTime() - 6 * 60 * 60 * 1000);
    const query = new URLSearchParams({
        sql: "select timestamp,event_message,log_attributes from logs where source='auth_logs' order by timestamp desc limit 300",
        iso_timestamp_start: start.toISOString(),
        iso_timestamp_end: end.toISOString()
    });
    const logs = await get(`/analytics/endpoints/logs?${query}`);
    if (logs.error) throw Error('O provedor não conseguiu consultar os logs de autenticação.');
    console.log(
        JSON.stringify({ event: 'email_delivery_logs', ...summarizeAuthEmailLogs(logs.result) })
    );
}
if (require.main === module)
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
module.exports = { main, summarizeAuthEmailLogs };
