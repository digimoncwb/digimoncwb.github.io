# Vínculos de contas

Em **Administração → Contas → Vínculos de contas**, admins podem buscar contas pelo nome, usuário ou jogador vinculado. A aba substitui Solicitações; os registros de solicitações existentes continuam preservados no banco.

- **Vincular jogador / Alterar vínculo** abre uma busca por nome ou identificação Bandai e exige salvar a escolha. Jogadores inativos ou vinculados a outra conta não são oferecidos.
- **Desvincular** pede confirmação e remove apenas `user_profiles.player_id`. A conta, o jogador e a propriedade já definida dos decks são preservados. O próximo acesso do titular poderá pedir um novo vínculo.
- O servidor valida a permissão administrativa, a exclusividade do jogador e o vínculo esperado para evitar sobrescrever alterações concorrentes. Novos vínculos exigem conta ativa com e-mail confirmado.
- Os gatilhos existentes continuam recalculando os acessos concedidos pelo jogador reservado e reconciliando decks sem proprietário. A operação é revertida se remover o último acesso administrativo ativo.
- Alterações são registradas na auditoria com responsável e IDs anterior/novo. A lista é paginada em 50 contas, e a busca de jogadores retorna até 10 sugestões.

Migração: `20261102233000_admin_account_links.sql`. RPCs: `admin_list_account_links`, `admin_search_link_players`, `admin_set_account_player`.

Em **Contas**, o quadro de jogadores com privilégios reservados mostra vínculo e acesso administrativo em colunas separadas. Vincular uma conta de e-mail não é um claim automático de Google. A concessão manual por um admin permite contas ativas, com e-mail confirmado e jogador vinculado, independentemente do provedor de login. A concessão automática continua usando as regras existentes para Google e jogadores reservados. As condições da conta de destino geram mensagens próprias, sem afirmar que o administrador que executa a ação não tem permissão. Migração: `20261102234000_admin_account_role_consistency.sql`.

Contas desvinculadas exibem **Sem jogador vinculado**. Durante o carregamento após login, o formulário de perfil aguarda a resolução dos dados; a etapa de vínculo se chama **Vincule os dados à sua conta**.
