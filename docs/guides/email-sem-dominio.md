# E-mails de contas sem domínio próprio

Preparação em 25/10/2026. O usuário informou que ainda não há SMTP e que prefere iniciar sem comprar domínio. **SMTP ainda não configurado nem testado; contas permanecem desativadas.** Os modelos HTML estão prontos, mas não foram enviados ao projeto hospedado.

Decisão confirmada: usar uma **conta Gmail dedicada à comunidade**, ainda a ser criada ou informada. O contato de privacidade permanece `dulopes1997@gmail.com`; a conta pessoal não foi vinculada como remetente.

## Caminho inicial proposto: Gmail SMTP

Uma conta Gmail compatível pode autenticar o envio SMTP com senha de app quando a verificação em duas etapas está habilitada. A senha de app é uma credencial sensível da conta Google, não a senha normal. A opção não está disponível em todas as contas; se não aparecer, não desative a proteção da conta para contornar isso.

Use preferencialmente uma conta dedicada à comunidade. O contato `dulopes1997@gmail.com` continua sendo o canal de privacidade informado; ele não precisa ser a conta remetente. **Não vincule a conta pessoal de Eduardo como remetente sem sua escolha explícita.** A mesma conta Gmail deverá ser informada como usuário SMTP e endereço remetente, salvo aliases autorizados e testados.

1. Escolha a conta Gmail da comunidade e ative a verificação em duas etapas.
2. Abra [Senhas de app da conta Google](https://myaccount.google.com/apppasswords) e crie uma senha com o nome `Supabase DIGIMON CWB`.
3. Cole essa senha diretamente em **Supabase → Authentication → Email → SMTP Settings** (a disposição do menu pode variar). Não a envie ao chat nem salve em arquivos do projeto, logs ou Git.
4. Use os campos abaixo:

| Campo              | Valor                                              |
| ------------------ | -------------------------------------------------- |
| Enable custom SMTP | Habilitar após preencher os campos                 |
| Sender name        | `DIGIMON CWB`                                      |
| Sender email       | A conta Gmail escolhida                            |
| Host               | `smtp.gmail.com`                                   |
| Port               | `587` com STARTTLS                                 |
| Username           | O endereço Gmail completo                          |
| Password           | A senha de app criada, não a senha normal da conta |

Gmail tem limites, controles contra abuso e decisões de entrega próprios. Esse caminho é uma opção inicial para baixo volume, sem garantia de serviço transacional de produção. Teste a entrega antes de liberar cadastros e reveja a solução se houver aumento de uso. Trocar a senha normal da conta Google pode revogar senhas de app. Não prometa um limite de mensagens sem conferir a conta e o provedor.

O SMTP padrão do Supabase é restrito a testes e não serve como alternativa geral para cadastrar os membros da comunidade. O envio de feedback/sugestões tem integração separada com Resend no código; configurar o SMTP de Auth não altera esse fluxo.

## URLs e segurança do Auth

O repositório aponta para `digimoncwb/digimoncwb.github.io`. Confira a URL efetiva de publicação antes de salvar:

- Site URL proposta: `https://digimoncwb.github.io/`.
- Redirect de produção usado pelo shell: `https://digimoncwb.github.io/index.html` (o cliente acrescenta `#overview`).
- Se `demo-v2` também for usado como entrada de teste, inclua explicitamente `https://digimoncwb.github.io/demo-v2/index.html`.
- Endereços locais devem ser específicos de homologação; não use wildcard de qualquer domínio em produção.
- Exigir confirmação de e-mail, troca segura de e-mail e senha de no mínimo 12 caracteres.

Esses valores são uma proposta, não evidência de que já estejam configurados. Alterar os requisitos de senha afeta também contas administrativas antigas; teste a migração para e-mail real antes de ativar o controle de contas.

## Modelos em português

Gere novamente, se necessário:

```powershell
node scripts/prepare-auth-emails.mjs
```

Em **Authentication → Email Templates**, copie os modelos correspondentes de `supabase/templates/`:

| Template         | Arquivo                 | Assunto                                      |
| ---------------- | ----------------------- | -------------------------------------------- |
| Confirm sign up  | `confirmation.html`     | Confirme seu e-mail — DIGIMON CWB            |
| Reset password   | `recovery.html`         | Redefina sua senha — DIGIMON CWB             |
| Change email     | `email_change.html`     | Confirme a alteração de e-mail — DIGIMON CWB |
| Invite user      | `invite.html`           | Convite para o DIGIMON CWB                   |
| Magic link       | `magic_link.html`       | Seu link de acesso — DIGIMON CWB             |
| Reauthentication | `reauthentication.html` | Confirme sua identidade — DIGIMON CWB        |

O script gera também `email-templates.patch.json` com apenas assuntos e conteúdo dos modelos, para aplicação controlada pela Management API quando houver acesso disponível. Ele não contém credenciais, não configura SMTP, não envia mensagens e não ativa notificações ou métodos de login adicionais.

Os links usam `{{ .ConfirmationURL }}` para preservar o fluxo de verificação do Supabase e os redirects do SDK. Não substitua pelo endereço inicial do site, não fixe token em código e não ative rastreamento de cliques do provedor. Se um scanner de e-mail consumir o link automaticamente, avalie um fluxo de confirmação intermediária antes da liberação pública.

## Homologação obrigatória antes de liberar contas

Com destinatários de teste autorizados pelo usuário, confirme cadastro, recuperação e alteração de e-mail em provedor diferente de Gmail, além do Gmail. Verifique spam, remetente, idioma, destino, expiração e rejeição de reutilização do link. O teste de confirmação deve ocorrer no navegador que iniciou o PKCE, ou em um fluxo projetado e testado para outro dispositivo. Não desabilite confirmação para contornar falha de entrega.

Só envie mensagens de teste depois de definir explicitamente os destinatários. O usuário pode executar os testes no painel e informar o resultado; não é necessário revelar senha de app.

## Referências

- [Google — senhas de app e pré-requisitos](https://support.google.com/accounts/answer/185833).
- [Gmail — configuração SMTP](https://support.google.com/mail/answer/7104828).
- [Supabase — SMTP próprio e limites do serviço padrão](https://supabase.com/docs/guides/auth/auth-smtp).
- [Supabase — variáveis dos modelos de e-mail](https://supabase.com/docs/guides/auth/auth-email-templates).
