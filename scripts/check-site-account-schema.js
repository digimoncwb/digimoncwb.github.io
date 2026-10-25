// Verify the deployed prerequisite schema without replaying non-idempotent migrations.
async function main() {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    const project = process.env.SUPABASE_PROJECT_ID;
    if (!token || !/^[a-z0-9]{20}$/.test(project || ''))
        throw Error('Configure SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_ID.');
    const query = `select to_regprocedure('public.start_site_integration_event(uuid,text,uuid,uuid)') is not null
        and to_regprocedure('public.site_account_erasure_target(uuid)') is not null
        and to_regprocedure('public.save_my_site_profile_legal(text,text,text,text,boolean,boolean,boolean)') is not null
        and to_regprocedure('public.admin_begin_audit_export(text,text,uuid,text,timestamptz,timestamptz,text,text)') is not null
        and to_regprocedure('public.admin_site_audit_health()') is not null
        and to_regprocedure('public.record_site_integration_event(uuid,text,uuid,integer,uuid,text)') is not null as ready`;
    const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: globalThis.AbortSignal.timeout(30000)
    });
    if (!response.ok)
        throw Error(`Não foi possível verificar o esquema de contas: HTTP ${response.status}.`);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows[0]?.ready !== true)
        throw Error(
            'Aplique as migrações de contas até 20261025090000 antes de publicar as funções.'
        );
    console.log('Esquema de contas e auditoria verificado. Nenhuma migração reaplicada.');
}
if (require.main === module)
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
module.exports = { main };
