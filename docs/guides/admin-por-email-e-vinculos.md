# Administração por conta e vínculo com jogador

O administrador entra em **Entrar** com seu e-mail e a senha da própria conta. A tela Admin usa essa mesma sessão e verifica a permissão no servidor; não existe mais a entrada que deduzia uma identidade administrativa pela senha. Esse acesso funciona durante a preparação, com `accounts_enabled=false`, sem liberar o cadastro público nem ativar o controle geral de contas.

Em **Contas e auditoria → Contas**, busque por e-mail, nome de usuário ou nome de exibição. Use **Tornar admin** ou **Remover admin** para alterar a permissão. A concessão exige conta ativa com e-mail real confirmado. O banco impede retirar o último administrador ativo. E-mails são retornados somente pela consulta administrativa autenticada, sem inclusão na lista pública de jogadores. As alterações de permissão ficam na auditoria.

Em **Minha conta → Solicitações de conta e privacidade**, escolha **Reivindicar jogador existente (claim user)**, procure seu jogador e envie a solicitação. Em **Contas e auditoria → Solicitações**, a administração confere a identidade e aprova ou recusa. O vínculo não concede administração, não transfere decks antigos automaticamente e não pode associar o mesmo jogador a duas contas. A tela Admin também possui um atalho para contas, vínculos e administradores.

## Migração das contas antigas

O workflow manual **Migrate existing admin emails** lê um plano privado no segredo temporário `ADMIN_ACCOUNT_MIGRATION`. Cada item deve conter `user_id`, `email`, `display_name` e `player_id`, conferidos com o responsável pelo site. A execução exige `apply=true`.

A rotina verifica os administradores existentes, contas ativas, e-mails já confirmados, disponibilidade do endereço de destino e ausência de conflito de jogador. A atualização de Auth altera somente o e-mail: não redefine senha e não força confirmação. Uma comparação interna antes e depois verifica que as senhas armazenadas foram preservadas, sem registrar seus hashes ou impressões digitais nos logs. Os vínculos autorizados e nomes são atualizados e auditados. A rotina não cria contas nem remove administradores; o plano temporário deve ser removido após a conferência.

Se houver falha após uma atualização de Auth, as contas já alteradas não são revertidas automaticamente. Confira o resultado antes de repetir a operação; a rotina aceita os endereços já migrados para a mesma conta.

Matheus Souza ficará apenas com o cadastro de jogador nesta etapa, conforme decisão do responsável: não existe conta antiga com senha para preservar.
