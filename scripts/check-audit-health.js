// Run outside Supabase (for example on GitHub Actions) so a provider outage also
// fails the check. Never print tokens, response bodies or private event payloads.
async function main() {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    const project = process.env.SUPABASE_PROJECT_ID;
    if (!token || !/^[a-z0-9]{20}$/.test(project || ''))
        throw Error('Configure SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_ID.');
    const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'select public.collect_site_audit_health() as health' }),
        signal: globalThis.AbortSignal.timeout(30000)
    });
    if (!response.ok) throw Error(`Serviço de auditoria indisponível: HTTP ${response.status}.`);
    const rows = await response.json();
    const health = Array.isArray(rows) ? rows[0]?.health : null;
    if (!health || !['ok', 'warning', 'critical'].includes(health.severity))
        throw Error('Resposta de diagnóstico inválida.');
    console.log(
        JSON.stringify({
            event: 'site_audit_health',
            severity: health.severity,
            missing_triggers: health.missing_triggers,
            failed_integrations_24h: health.failed_integrations_24h,
            stalled_integrations: health.stalled_integrations,
            retention_job_active: health.retention_job_active
        })
    );
    if (health.severity !== 'ok')
        throw Error(
            'A auditoria requer atenção. Consulte o painel administrativo e os logs do provedor.'
        );
}
if (require.main === module)
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
module.exports = { main };
