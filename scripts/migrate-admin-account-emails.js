// Run manually in Actions. The private migration plan and service key never enter logs or Git.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validatePlan(plan) {
    if (!Array.isArray(plan) || !plan.length || plan.length > 20) throw Error('Plano inválido.');
    for (const item of plan) {
        if (
            !uuid.test(item.user_id) ||
            !uuid.test(item.player_id) ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email) ||
            item.email.endsWith('@admin.digistats.local') ||
            typeof item.display_name !== 'string' ||
            !item.display_name.trim()
        )
            throw Error('Plano inválido.');
    }
    for (const key of ['user_id', 'email', 'player_id'])
        if (new Set(plan.map((item) => item[key].toLowerCase())).size !== plan.length)
            throw Error('Plano contém duplicidade.');
    return plan;
}
function authPatch(item) {
    // Never include password, email_confirm, roles or metadata supplied by an untrusted client.
    return { email: item.email.toLowerCase() };
}
async function main() {
    const plan = validatePlan(JSON.parse(process.env.ADMIN_ACCOUNT_MIGRATION || 'null'));
    const project = process.env.SUPABASE_PROJECT_ID;
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    if (
        !token ||
        !/^[a-z0-9]{20}$/.test(project || '') ||
        process.env.APPLY_ADMIN_ACCOUNT_MIGRATION !== 'true'
    )
        throw Error('Migração não autorizada.');
    const api = `https://api.supabase.com/v1/projects/${project}`;
    async function management(route, body) {
        const response = await fetch(api + route, {
            method: body ? 'POST' : 'GET',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: globalThis.AbortSignal.timeout(30000)
        });
        if (!response.ok) throw Error(`Management API: HTTP ${response.status}.`);
        return response.json();
    }
    const query = (sql) => management('/database/query', { query: sql });
    const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
    const payload = quote(JSON.stringify(plan));
    const cte = `with plan as (select * from jsonb_to_recordset(${payload}::jsonb)
        as p(user_id uuid,player_id uuid,email text,display_name text))`;
    const preflight = await query(`${cte} select
        (select not accounts_enabled from public.site_security_config where singleton) as pilot,
        count(*)=${plan.length} and bool_and(u.id is not null and a.user_id is not null and p.status='active'
            and u.email_confirmed_at is not null and coalesce(u.encrypted_password,'')<>''
            and pl.id is not null and (p.player_id is null or p.player_id=plan.player_id)
            and not exists(select 1 from auth.users other where lower(other.email)=lower(plan.email) and other.id<>plan.user_id)
            and not exists(select 1 from public.user_profiles other where other.player_id=plan.player_id and other.user_id<>plan.user_id)) as ready
        from plan left join auth.users u on u.id=plan.user_id
        left join public.admin_users a on a.user_id=u.id left join public.user_profiles p on p.user_id=u.id
        left join public.players pl on pl.id=plan.player_id`);
    if (preflight?.[0]?.pilot !== true || preflight?.[0]?.ready !== true)
        throw Error('Pré-verificação recusada. Nenhuma conta alterada.');
    const ids = plan.map((item) => quote(item.user_id)).join(',');
    // Fingerprints remain in process memory only; no password hashes are logged or exported.
    const before = await query(
        `select id,md5(encrypted_password) as fingerprint from auth.users where id in (${ids}) order by id`
    );
    const keys = await management('/api-keys?reveal=true');
    const serviceKey = keys.find((item) => item.name === 'service_role')?.api_key;
    if (!serviceKey) throw Error('Chave de serviço indisponível.');
    let updated = 0;
    for (const item of plan) {
        const response = await fetch(
            `https://${project}.supabase.co/auth/v1/admin/users/${item.user_id}`,
            {
                method: 'PUT',
                headers: {
                    apikey: serviceKey,
                    Authorization: `Bearer ${serviceKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(authPatch(item)),
                signal: globalThis.AbortSignal.timeout(30000)
            }
        );
        if (!response.ok)
            throw Error(
                `Atualização Auth: HTTP ${response.status}; ${updated} contas atualizadas. Não reenviado.`
            );
        updated++;
    }
    const after = await query(
        `select id,md5(encrypted_password) as fingerprint from auth.users where id in (${ids}) order by id`
    );
    if (JSON.stringify(before) !== JSON.stringify(after))
        throw Error('Verificação de preservação de senha falhou.');
    // Link only explicitly reviewed identities. No account is deleted and no admin is revoked.
    await query(`begin; select pg_advisory_xact_lock(868601);
        ${cte} update public.user_profiles p set player_id=plan.player_id,display_name=plan.display_name,updated_at=now()
            from plan where p.user_id=plan.user_id;
        ${cte} update public.admin_users a set display_name=plan.display_name from plan where a.user_id=plan.user_id;
        select site_audit.record('account.admin_email_migrated','user_profiles',null,
            jsonb_build_object('count',${plan.length},'passwords_preserved',true,'source','authorized_maintenance'));
        commit;`);
    const verify = await query(`${cte} select count(*)=${plan.length} and bool_and(
        lower(u.email)=lower(plan.email) and u.email_confirmed_at is not null and p.player_id=plan.player_id
        and exists(select 1 from public.admin_users a where a.user_id=u.id)) as ready
        from plan join auth.users u on u.id=plan.user_id join public.user_profiles p on p.user_id=u.id`);
    if (verify?.[0]?.ready !== true)
        throw Error('Migração aplicada; verificação final requer revisão.');
    console.log(
        JSON.stringify({
            migrated: updated,
            passwords_preserved: true,
            player_links_verified: true,
            accounts_enabled: false
        })
    );
}
if (require.main === module)
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
module.exports = { validatePlan, authPatch };
