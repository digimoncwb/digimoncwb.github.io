# Feedback por e-mail

O dashboard oferece dois links secundários no rodapé da barra lateral:

- **Reportar bug** — assunto `[DigiStats - Bug Report]`
- **Enviar sugestão** — assunto `[DigiStats - Sugestão]`

As opções de sugestão e relato de bug aparecem apenas para contas logadas. As mensagens são registradas na tabela privada `feedback_submissions` e enviadas pela Edge Function `send-feedback`. O navegador não conhece o endereço destinatário nem a chave do Resend. A função valida a sessão e usa o e-mail da conta autenticada em `contact_email` e `reply_to`, ignorando qualquer e-mail informado no corpo da requisição.

## Ativação

1. Execute `database/migrations/20260725190000_feedback_submissions.sql` no Supabase.
2. Crie uma API key no Resend e verifique o domínio usado pelo remetente.
3. Configure os secrets da função:

```powershell
npx supabase secrets set RESEND_API_KEY="re_..." FEEDBACK_RECIPIENT_EMAIL="seu-email@dominio.com" FEEDBACK_FROM_EMAIL="DigiStats <feedback@seu-dominio.com>"
```

4. Publique a função:

```powershell
npx supabase functions deploy send-feedback --no-verify-jwt
```

`FEEDBACK_RECIPIENT_EMAIL` é o endereço privado que recebe os relatos. `FEEDBACK_FROM_EMAIL` precisa utilizar um domínio autorizado no Resend.

## Proteções

- tabela sem acesso para `anon` ou `authenticated`;
- validação de tipo, tamanho e e-mail;
- honeypot invisível;
- limite de cinco mensagens por origem a cada quinze minutos;
- idempotência para impedir e-mails duplicados em novas tentativas.
