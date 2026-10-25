/* global __dirname */
// Run in a trusted server/Actions environment. No SMTP password is copied,
// patched, printed or saved; only a non-sensitive summary is emitted.
const fs = require('node:fs');
const path = require('node:path');

function makePatch(current, templates, smtp) {
    const allowed = new Set(
        [
            'confirmation',
            'recovery',
            'email_change',
            'invite',
            'magic_link',
            'reauthentication'
        ].flatMap((name) => [`mailer_subjects_${name}`, `mailer_templates_${name}_content`])
    );
    if (
        Object.keys(templates).length !== allowed.size ||
        Object.keys(templates).some((key) => !allowed.has(key))
    )
        throw Error('Payload de modelos inválido.');
    const redirects = new Set(
        String(current.uri_allow_list || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
    );
    for (const url of [
        'https://digimoncwb.github.io/',
        'https://digimoncwb.github.io/index.html',
        'https://digimoncwb.github.io/index.html#overview',
        'https://digimoncwb.github.io/demo-v2/index.html',
        'https://digimoncwb.github.io/demo-v2/index.html#overview'
    ])
        redirects.add(url);
    return {
        ...templates,
        smtp_host: smtp.smtp_host,
        smtp_port: smtp.smtp_port,
        smtp_user: smtp.smtp_user,
        smtp_admin_email: smtp.smtp_admin_email,
        smtp_sender_name: smtp.smtp_sender_name,
        site_url: 'https://digimoncwb.github.io/',
        uri_allow_list: [...redirects].join(','),
        mailer_autoconfirm: false,
        mailer_secure_email_change_enabled: true,
        password_min_length: Math.max(12, Number(current.password_min_length) || 0)
    };
}
function summarize(config, templates) {
    return {
        smtp_host: config.smtp_host,
        smtp_port: config.smtp_port,
        smtp_user: config.smtp_user,
        sender_email: config.smtp_admin_email,
        sender_name: config.smtp_sender_name,
        site_url: config.site_url,
        confirmation_required: config.mailer_autoconfirm === false,
        secure_email_change: config.mailer_secure_email_change_enabled === true,
        password_min_length: config.password_min_length,
        templates_match: Object.entries(templates).every(([key, value]) => config[key] === value),
        smtp_authentication_tested: false,
        emails_sent: 0
    };
}
async function main() {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    const project = process.env.SUPABASE_PROJECT_ID;
    const action = process.env.EMAIL_CONFIG_ACTION || 'inspect';
    if (!token || !/^[a-z0-9]{20}$/.test(project || '') || !['inspect', 'prepare'].includes(action))
        throw Error('Configuração de execução inválida.');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const api = `https://api.supabase.com/v1/projects/${project}`;
    async function request(route, options = {}) {
        const response = await fetch(api + route, {
            ...options,
            headers,
            signal: globalThis.AbortSignal.timeout(30000)
        });
        if (!response.ok)
            throw Error(`Operação de configuração recusada: HTTP ${response.status}.`);
        return response.status === 204 ? null : await response.json();
    }
    const templates = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, '../supabase/templates/email-templates.patch.json'),
            'utf8'
        )
    );
    const smtp = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, '../supabase/templates/smtp-public-settings.json'),
            'utf8'
        )
    );
    const before = await request('/config/auth');
    if (action === 'inspect') {
        console.log(JSON.stringify({ action, ...summarize(before, templates) }));
        return;
    }
    const rows = await request('/database/query', {
        method: 'POST',
        body: JSON.stringify({
            query: 'select accounts_enabled from public.site_security_config where singleton'
        })
    });
    if (!Array.isArray(rows) || rows[0]?.accounts_enabled !== false)
        throw Error('Mantenha o controle de contas desativado durante esta preparação.');
    const patch = makePatch(before, templates, smtp);
    if ('smtp_pass' in patch) throw Error('Credencial SMTP não pode entrar no patch.');
    await request('/config/auth', { method: 'PATCH', body: JSON.stringify(patch) });
    const after = await request('/config/auth');
    if (!Object.entries(patch).every(([key, value]) => after[key] === value))
        throw Error('A configuração salva diverge do patch. Confira o painel do Supabase.');
    console.log(JSON.stringify({ action, ...summarize(after, templates) }));
}
if (require.main === module)
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
module.exports = { main, makePatch, summarize };
