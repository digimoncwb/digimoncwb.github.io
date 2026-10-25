// Run only in a trusted runner. Never print client secrets or provider responses.
function googlePatch(clientId, clientSecret) {
    if (
        !/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId || '') ||
        typeof clientSecret !== 'string' ||
        clientSecret.length < 20 ||
        clientSecret.length > 512
    )
        throw Error('Credenciais OAuth do Google ausentes ou inválidas.');
    return {
        external_google_enabled: true,
        external_google_client_id: clientId,
        external_google_secret: clientSecret,
        external_google_email_optional: false,
        external_google_skip_nonce_check: false
    };
}
async function main() {
    const { SUPABASE_ACCESS_TOKEN: token, SUPABASE_PROJECT_ID: project } = process.env;
    const action = process.env.GOOGLE_OAUTH_ACTION || 'inspect';
    if (
        !token ||
        !/^[a-z0-9]{20}$/.test(project || '') ||
        !['inspect', 'configure'].includes(action)
    )
        throw Error('Configuração de execução inválida.');
    const endpoint = `https://api.supabase.com/v1/projects/${project}/config/auth`;
    async function request(method = 'GET', body) {
        const response = await fetch(endpoint, {
            method,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(30000)
        });
        if (!response.ok) throw Error(`Configuração OAuth recusada: HTTP ${response.status}.`);
        return response.json();
    }
    const before = await request();
    if (action === 'configure') {
        const patch = googlePatch(
            process.env.GOOGLE_OAUTH_CLIENT_ID,
            process.env.GOOGLE_OAUTH_CLIENT_SECRET
        );
        await request('PATCH', patch);
    }
    const after = action === 'configure' ? await request() : before;
    if (
        action === 'configure' &&
        (after.external_google_enabled !== true ||
            after.external_google_client_id !== process.env.GOOGLE_OAUTH_CLIENT_ID ||
            after.external_google_email_optional !== false ||
            after.external_google_skip_nonce_check !== false)
    )
        throw Error('O provedor não confirmou a configuração esperada.');
    for (const field of [
        'site_url',
        'uri_allow_list',
        'external_email_enabled',
        'mailer_autoconfirm',
        'smtp_host',
        'smtp_port',
        'smtp_user',
        'smtp_admin_email',
        'password_min_length'
    ])
        if (before[field] !== after[field])
            throw Error('Uma configuração fora do Google foi alterada. Confira o painel.');
    console.log(
        JSON.stringify({
            action,
            google_enabled: after.external_google_enabled === true,
            client_id_configured: !!after.external_google_client_id,
            email_required: after.external_google_email_optional === false,
            nonce_check_enabled: after.external_google_skip_nonce_check !== true,
            existing_auth_settings_preserved: true,
            callback_url: `https://${project}.supabase.co/auth/v1/callback`,
            real_user_login_tested: false
        })
    );
}
if (require.main === module)
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
module.exports = { main, googlePatch };
