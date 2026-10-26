# Vínculo de conta com jogador da Bandai

A migração `database/migrations/20261026010000_self_service_bandai_player_link.sql` deve ser aplicada antes da publicação do frontend correspondente.

No primeiro acesso confirmado, uma conta ativa sem `player_id` precisa informar o nome utilizado no Bandai TCG+. O fluxo também atende contas antigas ainda sem vínculo. O usuário seleciona um jogador existente ou cadastra um novo quando não há correspondência exata. O vínculo é imediato e não abre solicitação de aprovação. Jogadores já vinculados a outra conta não podem ser assumidos; mudar um vínculo existente continua sendo uma operação administrativa.

O pop-up preserva os aceites de termos, privacidade e maioridade. Quando faltam aceites vigentes, eles aparecem na mesma etapa. Não é possível fechar essa etapa sem concluir o vínculo ou sair da conta. Contas bloqueadas e e-mails não confirmados não podem criar vínculos.

As RPCs `search_bandai_players` e `complete_my_player_link` atendem apenas contas confirmadas e ativas. A criação e o vínculo são transacionais, com serialização de operações e unicidade de `user_profiles.player_id`. Pedidos antigos pendentes referentes ao vínculo são encerrados automaticamente. As alterações são auditadas.

`players.avatar_url` persiste a URL da foto do Google. A migração copia fotos de contas já vinculadas; novos vínculos e acessos posteriores sincronizam a foto pelo metadata de Auth, por meio de `sync_my_player_google_avatar`. A RPC não recebe um ID de jogador arbitrário nem uma URL do navegador: ela resolve o jogador da própria conta e aceita URLs HTTPS do Google. Se não houver uma foto válida, a foto existente é mantida. A anonimização existente de jogadores remove a foto.

As telas de jogadores mostram a foto circular, com iniciais como alternativa quando ela não carrega. O botão de sair faz parte do bloco da conta em desktop e mobile.

Validação local: `node --test --test-name-pattern=Bandai tests/site-accounts.test.js`, `node --test tests/site-auth-service.test.js`, `npm.cmd run typecheck` e `npm.cmd run build`.
