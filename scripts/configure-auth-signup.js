// Run with SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID in a trusted environment.
// Updates signup policy and confirmation content; never creates users or sends test emails.
/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
async function main() {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    const project = process.env.SUPABASE_PROJECT_ID;
    if (!token || !/^[a-z0-9]{20}$/.test(project || ''))
        throw new Error('Configure SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_ID.');
    const url = `https://api.supabase.com/v1/projects/${project}/config/auth`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const templates = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, '../supabase/templates/email-templates.patch.json'),
            'utf8'
        )
    );
    const patch = {
        password_min_length: 6,
        password_required_characters: '',
        mailer_autoconfirm: false,
        mailer_subjects_confirmation: templates.mailer_subjects_confirmation,
        mailer_templates_confirmation_content: templates.mailer_templates_confirmation_content
    };
    const response = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
        signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Falha ao configurar senha: HTTP ${response.status}.`);
    const verification = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!verification.ok) throw new Error(`Falha ao verificar: HTTP ${verification.status}.`);
    const config = await verification.json();
    if (!Object.entries(patch).every(([key, value]) => config[key] === value))
        throw new Error('A política de senha retornada não corresponde à configuração solicitada.');
    console.log(
        'Cadastro atualizado: mínimo de 6 caracteres, sem composição obrigatória, e confirmação com nome e e-mail.'
    );
}
main().catch(() => {
    console.error(
        'Não foi possível atualizar a política de senha. Verifique as credenciais e a configuração do projeto.'
    );
    process.exitCode = 1;
});
