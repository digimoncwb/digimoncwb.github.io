# Vínculo de conta com jogador da Bandai

A migração `database/migrations/20261026010000_self_service_bandai_player_link.sql` deve ser aplicada antes da publicação do frontend correspondente.

No primeiro acesso confirmado, uma conta ativa sem `player_id` precisa informar o nome utilizado no Bandai TCG+. O fluxo também atende contas antigas ainda sem vínculo. O usuário seleciona um jogador existente ou cadastra um novo quando não há correspondência exata. O vínculo é imediato e não abre solicitação de aprovação. Jogadores já vinculados a outra conta não podem ser assumidos; mudar um vínculo existente continua sendo uma operação administrativa.

O pop-up preserva os aceites de termos, privacidade e maioridade. Quando faltam aceites vigentes, eles aparecem na mesma etapa. Não é possível fechar essa etapa sem concluir o vínculo ou sair da conta. Contas bloqueadas e e-mails não confirmados não podem criar vínculos.

As RPCs `search_bandai_players` e `complete_my_player_link` atendem apenas contas confirmadas e ativas. A criação e o vínculo são transacionais, com serialização de operações e unicidade de `user_profiles.player_id`. Pedidos antigos pendentes referentes ao vínculo são encerrados automaticamente. As alterações são auditadas.

`players.avatar_url` persiste a URL da foto do Google. A migração copia fotos de contas já vinculadas; novos vínculos e acessos posteriores sincronizam a foto pelo metadata de Auth, por meio de `sync_my_player_google_avatar`. A RPC não recebe um ID de jogador arbitrário nem uma URL do navegador: ela resolve o jogador da própria conta e aceita URLs HTTPS do Google. Se não houver uma foto válida, a foto existente é mantida. A anonimização existente de jogadores remove a foto.

As telas de jogadores mostram a foto circular, com iniciais como alternativa quando ela não carrega. O botão de sair faz parte do bloco da conta em desktop e mobile.

Validação local: `node --test --test-name-pattern=Bandai tests/site-accounts.test.js`, `node --test tests/site-auth-service.test.js`, `npm.cmd run typecheck` e `npm.cmd run build`.

## Privilégios administrativos reservados nos jogadores

A migração `20261026020000_admin_privileges_on_bandai_players.sql` cria `player_admin_grants`, uma lista privada de jogadores com privilégio administrativo. Ela não define e-mail nem conta Auth futura para cada jogador. Conforme a opção escolhida pelo responsável, assumir um desses jogadores com uma conta Google confirmada libera o acesso administrativo automaticamente, sem código ou aprovação. Esse fluxo confia no jogador selecionado pelo usuário; não verifica a titularidade da conta Bandai em um serviço externo.

A transição é executada por `node scripts/reserve-player-admins.mjs --keep-admin=lopes --apply`. Sem `--apply`, o script apenas confere o plano. Ele valida a lista dos seis administradores existentes e preserva a conta Google `edu_lopes`; as outras cinco contas antigas perdem o papel administrativo e o vínculo com os jogadores. Os e-mails e as senhas das contas Auth existentes não são alterados nem apagados. Os jogadores ficam disponíveis para as novas contas Google, sem e-mail predefinido para receber o privilégio.

O claim mantém a unicidade de conta por jogador, os aceites e a auditoria. Um jogador comum não concede acesso administrativo. As funções privadas não podem ser chamadas por clientes, o painel mostra os jogadores aguardando claim e a revogação de admin desativa o privilégio reservado para impedir que ele seja recuperado pelo mesmo claim. A última conta administrativa ativa continua protegida.

A migração complementar `20261026030000_limit_automatic_player_admins.sql` fixa a lista de claim administrativo em seis jogadores: Marcio Braga, Lukas Fujisawa, Matheus Fonseca, Carlos Fortes, Philippe Oliveira e Matheus Souza. Eduardo Lopes conserva o privilégio na conta atual, sem conceder admin automaticamente pelo seu jogador. Promoções manuais de outras contas não ampliam a lista de claim automático. O script de transição inicial acima não deve ser reaplicado após essa migração; ele recusa a lista modificada antes de alterar dados.
