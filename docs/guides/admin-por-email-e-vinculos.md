# Administração por conta e vínculo com jogador

O administrador entra em **Login** com seu e-mail e a senha da própria conta. A tela Admin usa essa mesma sessão e verifica a permissão no servidor; não existe mais a entrada que deduzia uma identidade administrativa pela senha. Esse acesso funciona durante a preparação, com `accounts_enabled=false`, sem liberar o cadastro público nem ativar o controle geral de contas.

Em **Admin → Contas**, busque por nome de usuário ou nome de exibição. Use **Tornar admin** ou **Remover admin** para alterar a permissão. A concessão exige conta ativa com e-mail real confirmado. O banco impede retirar o último administrador ativo. Os e-mails não são retornados nas consultas administrativas de contas e solicitações; a busca também não aceita e-mail. As alterações de permissão ficam na auditoria.

O gerenciamento fica na própria tela **Admin**, dividido em **Torneios** (DigiLab, lojas e agenda), **Catálogo** (formatos, coleções, retratos, banlist e manutenção), **Contas** (contas, solicitações e propriedade) e **Auditoria** (diagnóstico e eventos). O menu lateral mostra Admin apenas para uma conta conectada com permissão administrativa; a mesma sessão por e-mail libera a tela. **Sair da conta** fica disponível no menu lateral.

A auditoria destaca o estado atual e os problemas encontrados. Métricas técnicas, revisões de logs, histórico e filtros ficam recolhidos. Falhas anteriores continuam no histórico de 24 horas. O diagnóstico reconhece a recuperação da rotina agendada do catálogo quando uma sincronização completa posterior termina com sucesso. Os eventos e as duas formas de exportação continuam disponíveis, incluindo os registros de acesso e exportação já existentes.

Nos decks da comunidade, cada usuário pode excluir apenas os próprios decks. Administradores também podem excluir decks anônimos, sem proprietário. Essa restrição exige a migração `20261025120000_community_deck_delete_permissions.sql` e vale também para exclusões diretas e chamadas de funções antigas, mesmo com o controle geral de contas desativado.

O perfil só informa sucesso depois de confirmar os dados gravados e consultar novamente a conta. A tela de login permite reenviar a confirmação de cadastro e informa falhas e limites do serviço de e-mail. A entrega real ainda depende da configuração SMTP e dos logs do Supabase; testes locais não comprovam o recebimento pelo destinatário. A inspeção existente em `scripts/configure-auth-emails.js` precisa de `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_ID` no ambiente de execução.

A edição de nome de usuário e nome de exibição usa `update_my_site_profile`, da migração `20261025140000_update_basic_site_profile.sql`, quando não há novos aceites a registrar. Ela exige conta ativa e e-mail confirmado, mas funciona mesmo antes da publicação dos documentos legais. Essa edição não registra aceites nem concede permissões. Quando há documentos publicados pendentes de aceite, o perfil continua usando o fluxo de aceitação versionada.

Após o vínculo com um jogador, **Minha conta** mostra apenas **Vinculado a Nome do jogador**, sem repetir o formulário ou o histórico de claim. Segurança e privacidade ficam em seções recolhidas. **Lembrar de mim** mantém a sessão e o e-mail após sair; o salvamento e o preenchimento da senha ficam com o gerenciador de senhas do navegador, sem armazenar a senha em localStorage. A recuperação via Credential Management depende do suporte e das permissões do navegador; os campos também usam os atributos padrão de preenchimento automático.

Em **Minha conta → Vincular meu jogador**, procure seu jogador e envie a solicitação. Em **Admin → Contas → Solicitações**, a administração confere a identidade e aprova ou recusa. Após a aprovação, o perfil mostra o jogador vinculado e oculta o formulário. O vínculo não concede administração, não transfere decks antigos automaticamente e não pode associar o mesmo jogador a duas contas.

## Migração das contas antigas

O workflow manual **Migrate existing admin emails** lê um plano privado no segredo temporário `ADMIN_ACCOUNT_MIGRATION`. Cada item deve conter `user_id`, `email`, `display_name` e `player_id`, conferidos com o responsável pelo site. A execução exige `apply=true`.

A rotina verifica os administradores existentes, contas ativas, e-mails já confirmados, disponibilidade do endereço de destino e ausência de conflito de jogador. A atualização de Auth altera somente o e-mail: não redefine senha e não força confirmação. Uma comparação interna antes e depois verifica que as senhas armazenadas foram preservadas, sem registrar seus hashes ou impressões digitais nos logs. Os vínculos autorizados e nomes são atualizados e auditados. A rotina não cria contas nem remove administradores; o plano temporário deve ser removido após a conferência.

Se houver falha após uma atualização de Auth, as contas já alteradas não são revertidas automaticamente. Confira o resultado antes de repetir a operação; a rotina aceita os endereços já migrados para a mesma conta.

Matheus Souza ficará apenas com o cadastro de jogador nesta etapa, conforme decisão do responsável: não existe conta antiga com senha para preservar.

## Propriedade de decks e simplificação da conta

A migração `20261025150000_reconcile_linked_player_deck_ownership.sql` atribui decks da comunidade sem proprietário à conta ativa, com e-mail confirmado, vinculada ao jogador creditado. A reconciliação usa os IDs do jogador e da conta, preserva proprietários existentes e listas de torneios, e registra as alterações na auditoria. Novos vínculos aprovados e importações administrativas seguem a mesma regra.

A migração `20261025160000_direct_deck_claims_and_private_account_email.sql` permite **Adicionar aos meus decks** imediatamente, sem revisão administrativa, para decks da comunidade sem proprietário. Exige conta ativa confirmada e bloqueia atribuições concorrentes e tentativas de assumir decks já pertencentes a outra conta. O vínculo de identidade com um jogador continua separado da atribuição de decks.

A interface não contém mais a aba **Configuração** em Contas nem **Dados e privacidade** em Minha conta. As configurações persistidas e funções de autenticação permanecem preservadas para o funcionamento do projeto.
