// Generates reviewed, credential-free templates. It never updates the remote
// project or sends an email. Copy templates through Supabase Authentication.
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, 'supabase', 'templates');
const support = 'dulopes1997@gmail.com';
const escape = (value) =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
const definitions = [
    {
        name: 'confirmation',
        subject: 'Confirme seu e-mail — DIGIMON CWB',
        title: 'Confirme seu e-mail',
        message:
            'Recebemos uma solicitação para criar sua conta no DIGIMON CWB. Confirme este endereço para continuar.',
        button: 'Confirmar e-mail',
        ignore: 'Se você não solicitou esta conta, ignore a mensagem. Nenhuma ação é necessária.'
    },
    {
        name: 'recovery',
        subject: 'Redefina sua senha — DIGIMON CWB',
        title: 'Recuperação de acesso',
        message:
            'Recebemos uma solicitação para redefinir a senha da sua conta no DIGIMON CWB. Use o botão abaixo para escolher uma nova senha.',
        button: 'Definir nova senha',
        ignore: 'Se você não pediu a redefinição, ignore esta mensagem. Este e-mail, por si só, não altera sua senha.'
    },
    {
        name: 'email_change',
        subject: 'Confirme a alteração de e-mail — DIGIMON CWB',
        title: 'Alteração do e-mail de acesso',
        message:
            'Foi solicitada uma alteração do endereço de e-mail de uma conta no DIGIMON CWB. Confirme somente se você iniciou essa alteração. Dependendo da configuração, a confirmação é exigida nos dois endereços.',
        button: 'Confirmar alteração',
        ignore: 'Se você não solicitou esta alteração, não confirme e entre em contato com o suporte.'
    },
    {
        name: 'invite',
        subject: 'Convite para o DIGIMON CWB',
        title: 'Convite para participar',
        message:
            'Você recebeu um convite para acessar o DIGIMON CWB. Use o botão para concluir o acesso à sua conta.',
        button: 'Aceitar convite',
        ignore: 'Se você não reconhece este convite, ignore a mensagem.'
    },
    {
        name: 'magic_link',
        subject: 'Seu link de acesso — DIGIMON CWB',
        title: 'Acesso à sua conta',
        message:
            'Use o botão abaixo para acessar sua conta no DIGIMON CWB. Este modelo só será utilizado se o fluxo de acesso por link for habilitado.',
        button: 'Acessar conta',
        ignore: 'Se você não solicitou este acesso, ignore a mensagem.'
    },
    {
        name: 'reauthentication',
        subject: 'Confirme sua identidade — DIGIMON CWB',
        title: 'Confirmação de identidade',
        message:
            'Uma operação na sua conta do DIGIMON CWB exige confirmação de identidade. Use o código abaixo somente no fluxo que você iniciou.',
        token: true,
        ignore: 'Não compartilhe este código. Se você não iniciou a operação, ignore a mensagem e procure o suporte.'
    }
];
const patch = {};
await fs.mkdir(directory, { recursive: true });
for (const definition of definitions) {
    const action = definition.token
        ? '<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>'
        : `<p style="margin:28px 0"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#286bc0;color:#fff;padding:14px 22px;border-radius:6px;text-decoration:none;font-weight:bold">${escape(definition.button)}</a></p><p>Se o botão não funcionar, copie este endereço para o navegador:</p><p style="overflow-wrap:anywhere;word-break:break-all"><a href="{{ .ConfirmationURL }}">{{ .ConfirmationURL }}</a></p>`;
    const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(definition.subject)}</title></head>
<body style="margin:0;background:#eef1f5;color:#20252b;font-family:Arial,Helvetica,sans-serif;line-height:1.6">
<table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:28px 16px"><table role="presentation" style="width:100%;max-width:600px;margin:auto;background:#fff;border-collapse:collapse"><tr><td style="padding:28px">
<p style="font-weight:bold;color:#286bc0;margin:0 0 20px">DIGIMON CWB</p>
<h1 style="font-size:25px;line-height:1.3">${escape(definition.title)}</h1><p>${escape(definition.message)}</p>
${action}
<p>${escape(definition.ignore)}</p><p>Por segurança, não compartilhe este e-mail nem seus links ou códigos de acesso. Não pedimos sua senha por e-mail.</p>
<hr style="border:0;border-top:1px solid #dce2e8"><p style="font-size:13px">Comunidade Digimon CWB<br>Contas e privacidade: <a href="mailto:${support}">${support}</a></p>
</td></tr></table></td></tr></table></body></html>
`;
    await fs.writeFile(path.join(directory, `${definition.name}.html`), html);
    patch[`mailer_subjects_${definition.name}`] = definition.subject;
    patch[`mailer_templates_${definition.name}_content`] = html;
}
await fs.writeFile(
    path.join(directory, 'email-templates.patch.json'),
    JSON.stringify(patch, null, 2) + '\n'
);
console.log(
    'Six Portuguese email templates generated in supabase/templates. No remote changes or emails sent.'
);
