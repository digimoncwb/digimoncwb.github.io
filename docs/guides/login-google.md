# Login com Google

O botão **Continuar com Google** fica na janela **Login**, acima do acesso por e-mail. O cliente usa `signInWithOAuth` do Supabase com PKCE e solicita apenas `openid email profile`, sem acesso ao Gmail, Drive, agenda ou contatos. A preferência **Lembrar de mim** também determina onde a sessão e o verificador do OAuth são guardados.

O login retorna para `https://digimoncwb.github.io/index.html`, sem fragmento de rota. O roteador abre a visão geral por padrão; o fragmento fica reservado à autenticação. A autenticação do Google volta primeiro para o Supabase, por isso a URI autorizada no cliente OAuth do Google Cloud precisa ser:

```
https://vllqakohumoinpdwnsqa.supabase.co/auth/v1/callback
```

O endereço do site em **Origens JavaScript autorizadas** não substitui essa URI. A configuração foi ajustada no Google Cloud pelo responsável. Mudanças feitas apenas no JSON baixado não alteram a configuração do provedor.

## Credenciais e configuração

A pasta local `oauth-google/` está no `.gitignore`. O Client Secret não faz parte do frontend, de arquivos públicos ou de commits. Para configurar o provedor no Supabase, o repositório utiliza os secrets `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET`, junto ao `SUPABASE_ACCESS_TOKEN` já existente. O workflow manual **Google OAuth configuration** aceita `inspect` ou `configure` e registra apenas indicadores sem valores de credenciais.

O script `scripts/configure-google-oauth.js` altera apenas os campos do Google. Exige e-mail do provedor, mantém a verificação de nonce habilitada e confere que URLs, SMTP e acesso por e-mail continuaram preservados. A configuração dos secrets e do provedor precisa ser refeita se o responsável rotacionar o Client Secret no Google Cloud.

## Conta e aceites

Identidades com o mesmo e-mail verificado podem ser associadas pelo Supabase à conta existente. O site utiliza o ID retornado pelo serviço de autenticação e não recria nem associa jogadores pelo nome recebido do Google. Nome de exibição é apenas uma sugestão de perfil: metadados do provedor não concedem administração, vínculo com jogador ou aceite de documentos.

Após o retorno do Google, uma conta sem os aceites vigentes abre **Minha conta** para completar os termos, a ciência do aviso e a declaração de maioridade. A aplicação não considera essa etapa concluída até o registro autenticado. Contas existentes continuam usando o mesmo perfil e os vínculos já registrados.

Os documentos `2026-10-25.2` incluem o login social. Os documentos `2026-10-25.1` continuam preservados, junto às evidências de aceite que eventualmente os referenciem.

## Verificação e limites

Os testes cobrem início do OAuth, retorno, preferência de sessão, aceites, preservação do ID e erros do provedor. O navegador valida o botão no celular e o direcionamento ao perfil. A conferência do redirecionamento público não equivale a concluir o login em uma conta Google: essa etapa exige que o próprio usuário escolha sua conta e autorize o acesso.

Se o aplicativo do Google estiver em modo de teste, o responsável pode precisar adicionar as contas permitidas em **Google Auth Platform → Público-alvo / Audience → Usuários de teste**. Para abrir o acesso à comunidade, confira o estado de publicação e as exigências apresentadas pelo Google. Não adicione escopos extras para corrigir um problema de acesso.

Referências: [login com Google no Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [associação de identidades](https://supabase.com/docs/guides/auth/auth-identity-linking) e [configuração do Auth pela Management API](https://supabase.com/docs/reference/api/v1-update-auth-service-config).

## Publicação verificada em 25/10/2026

A versão `2026.10.25.9` foi publicada pela revisão `8c8575a`. O [pipeline](https://github.com/digimoncwb/digimoncwb.github.io/actions/runs/40244355631) passou com 280 testes, TypeScript, lint, build e publicação. O [workflow de configuração](https://github.com/digimoncwb/digimoncwb.github.io/actions/runs/40244359548) confirmou o Google habilitado, e-mail obrigatório e verificação de nonce ativa, com as configurações anteriores de Auth preservadas.

As páginas legais foram conferidas publicamente e a versão `2026-10-25.2` foi registrada no banco. A inicialização do nome de perfil foi atualizada sem alterar contas ou decks existentes. A conferência no navegador público chegou à tela de identificação do Google, com PKCE e sem erro de URI; não foi realizada autenticação em conta pessoal. A pasta local de credenciais permaneceu fora do Git, e uma comparação local confirmou ausência do Client Secret nos arquivos rastreados e no pacote público.
