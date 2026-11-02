# Torneios da comunidade

O botão **Organizar torneio**, ao lado de **+ Adicionar torneio**, abre a operação de eventos da Digimon CWB. Jogadores se inscrevem pelos avisos na Visão Geral; administradores criam e organizam eventos. Não há tela de entrada por código nem convite para copiar. O cadastro de resultados existente permanece separado.

Eventos com inscrições abertas aparecem acima dos cards da Visão Geral. Após o início, o aviso com **Ver rodada atual** aparece somente para participantes que não deram drop; demais jogadores e visitantes deixam de vê-lo. Dar drop atualiza imediatamente a consulta dos avisos. Login, cadastro ativo e vínculo com um jogador são obrigatórios para a inscrição; o servidor verifica novamente capacidade e duplicidade. O evento escolhido fica em `sessionStorage` durante login/vínculo. Jogadores incluídos pela organização já estão inscritos, sem confirmação de presença.

## Operação

- Novos torneios têm capacidade fixa de 32 jogadores. O motor mantém suporte aos eventos anteriores de até 128 participantes.
- Criar preenche a previsão de início com o horário atual de Brasília mais 30 minutos, o formato atual configurado ou o mais recente ativo, tipo Casual (Casuals no DigiLab), local “Curitiba, Brazil” e “Sem loja”. A previsão pode ser alterada na criação e na edição, e é preservada no servidor. Editar mantém o horário já salvo. O início do torneio continua manual. Clicar fora da janela não a fecha; Cancelar e Escape continuam disponíveis.
- O administrador pode selecionar vários jogadores cadastrados na própria criação ou incluí-los depois, antes do início, sem login individual. A seleção é gravada em uma transação, sem duplicatas ou inclusão parcial por falta de vagas. Convidados novos são cadastrados pela aba Jogadores.
- Criar o torneio já o publica com inscrições abertas e o exibe na Visão Geral. A pessoa logada, com cadastro ativo e jogador vinculado, clica em Inscrever-se no aviso para entrar diretamente. Iniciar encerra as inscrições. A migração também abre os rascunhos existentes. Não há check-in. Os campos legados são mantidos apenas para compatibilidade de snapshots e clientes de pareamento.
- A inclusão administrativa usa sugestões após digitar pelo menos dois caracteres, sem listar jogadores ao abrir o campo. É possível selecionar vários nomes antes de incluir. A contagem mostra somente os inscritos atuais; a capacidade continua sendo validada internamente. Regras e busca ficam visíveis sem seções expansíveis.
- No desktop, o resumo permanece aberto e a atividade aparece logo abaixo, na mesma coluna. A atividade mostra autor, ação e jogadores envolvidos, com data e horário, sem JSON. Novas ações preservam os nomes no registro, mesmo ao remover uma inscrição. Registros anteriores recuperam os nomes disponíveis; alvos removidos antes dessa mudança podem aparecer como “um jogador”. A auditoria continua restrita à organização.
- Mínimo de 4 jogadores para iniciar, conforme a faixa inicial da tabela suíça da Bandai. Rodadas: 4–8 jogadores → 3; 9–16 → 4; 17–32 → 5; 33–64 → 6; 65–128 → 7. A contagem fica congelada ao iniciar. Eventos antigos já iniciados e a continuação após drops preservam seus dados.
- Relógio configurável por torneio, com padrão de 45 minutos decrescentes e overtime crescente de 00:00 até 05:00. Overtime 0 desativa a prorrogação. Os horários são persistidos no servidor. Retomar a tela atualiza os dados e recalcula o tempo absoluto. Somente admins podem ajustar o relógio, sem justificativa obrigatória. O servidor valida a permissão, conserva a duração de overtime da rodada atual e registra autor e ajuste na auditoria. O relógio não atribui placares. Ao entrar no overtime, o tempo fica vermelho e OVERTIME aparece acima do timer. Ao terminar, mostra FIM DO OVERTIME e o tempo pisca. A tela também dispara imediatamente a notificação do sistema quando a permissão está habilitada, com deduplicação por rodada compartilhada com a consulta de avisos.
- Placar com uma escolha obrigatória por linha: jogador logado (2/1/0), oponente (2/1/0) e Draw (1/0). A soma deve ser de 1 a 3 jogos, validada também no servidor. `1–1–0` e `1–1–1` permanecem distintos.
- O adversário aceita ou refuta enviando outra proposta. Cada contraproposta retorna ao outro jogador, sem limite de trocas. Revisões da partida impedem aceitar um placar substituído. Administradores podem lançar ou corrigir sem justificativa, preservando auditoria automática.
- Só resultados confirmados entram na classificação provisória. Após todas as confirmações, a rodada encerra automaticamente e o relógio desaparece; gerar a próxima rodada continua sendo uma ação da organização.
- Iniciar cria o pareamento inicial aleatório com semente registrada e inicia o relógio da primeira rodada em uma transação. Falhas revertem a operação inteira. As demais rodadas priorizam proximidade de pontos, evitam reencontros e distribuem byes. Não há opção de pareamento excepcional na interface.
- Bye vale 3 pontos e é atribuído a exatamente um jogador quando a rodada tem um número ímpar de participantes ativos. Desistências alteram essa contagem para as rodadas seguintes: com número par, não há bye; com número ímpar, há um bye.
- Antes do início, qualquer jogador com conta ativa pode cancelar a própria inscrição em **Desistir do torneio**, removendo a inscrição e liberando a vaga. Cancelar a inscrição de outro jogador exige admin. Depois do início, a organização registra a desistência, preservando resultados e excluindo o jogador das próximas mesas; a partida atual precisa estar resolvida.
- A organização pode reabrir a última rodada para corrigir resultados. A interface não oferece invalidar a última rodada. Operações legadas de invalidação continuam preservadas no backend e na auditoria histórica.
- Para refazer a rodada atual, admins usam **Parar rodada** em Pairings (no menu de controles no mobile). A confirmação arquiva mesas e resultados antes de limpá-los e deixa a rodada pausada. Nesse intervalo é possível corrigir resultados anteriores pelo Histórico e marcar drops em Admin. **Refazer pareamentos e reiniciar** usa o mesmo motor suíço normal, mantém o número da rodada e inicia novamente usando os tempos configurados no torneio. As rodadas anteriores permanecem intactas. A validação e o reinício são transacionais: uma falha mantém a rodada pausada. São necessários pelo menos dois jogadores ativos para refazer as mesas.
- **Finalizar Torneio** encerra diretamente com a classificação calculada e congela o resultado para exportação, sem tela de revisão ou ordenação manual.
- Durante o evento, o resumo desaparece. Apenas admins veem Cancelar torneio. A navegação separa Pairings, Ranking, Histórico e Admin (somente admins). Gerenciar Jogadores fica dentro de Admin; apenas admins podem registrar drops por esse gerenciamento, com a permissão também validada no servidor. Após a finalização, Ranking, Histórico e Admin continuam disponíveis, respeitando as mesmas permissões.
- Não há botão Voltar na tela do torneio. Durante o evento, o nome aparece apenas junto da rodada em Pairings, sem cabeçalho repetido nas outras abas. A aba Admin começa por Gerenciar torneio, com edição de nome, data, horário, local e formato, além de Cancelar torneio. Depois aparecem Gerenciar Jogadores e a atividade. A edição administrativa preserva rodadas, relógios e resultados já existentes. O nome aparece junto da rodada no card dos pairings. As abas seguem o visual do Deckbuilder, com ícones e destaque inferior na cor do tema. No mobile, abas horizontais compactas e controles de rodada em um menu deixam o relógio e as mesas em destaque; no desktop, os controles continuam ao lado do título. A coluna Resultado e os placares compartilham o centro do relógio.
- Pairings usa uma tabela com jogador 1, campanha, placar e jogador 2, com fundo verde no vencedor confirmado e areia nos dois jogadores em caso de empate confirmado. Clicar na linha abre o resultado. Admins editam qualquer mesa da rodada em andamento; jogadores só enviam, aceitam ou refutam o resultado da própria mesa. Essas permissões também são validadas no servidor. Os controles de rodada ficam ao lado de “Rodada X de Y”.
- Todas as mesas da rodada aparecem sem filtro. A aba Histórico é paginada por botões compactos de rodada e reutiliza a tabela, com campanha acumulada somente até a rodada selecionada. Admins também podem corrigir resultados de rodadas encerradas por ali, sem remover pareamentos seguintes. Correções em torneios finalizados exigem confirmar novamente a classificação antes de gerar uma nova exportação; exportações anteriores ficam preservadas. Eventos já vinculados ao DigiLab são marcados para revisão.
- Ranking fica disponível desde o início, com todos os inscritos, pontos, campanha Record (vitórias–derrotas–empates, no formato `x - x - x`), OMW%, GW%, OGW% e byes. O cabeçalho tem fundo e borda destacados para se distinguir dos jogadores, e a fonte da tabela é maior. Jogadores que deram drop aparecem com “(DROP)”. Só resultados confirmados contam na campanha. No mobile, as estatísticas podem ser percorridas horizontalmente.
- Ao finalizar, a classificação final exibe posição, jogador e pontos. Participantes deixam de aparecer e o histórico fica em um painel independente. Copiar resultados e abrir a submissão no DigiLab ficam nas informações do torneio. A cópia exibe apenas uma confirmação de sucesso, sem campo de texto. Admin > Gerenciar torneio permite excluir o evento finalizado com a confirmação de exclusão existente.
- Avisos no app e notificações do sistema, quando autorizadas, informam rodada/adversário, nova proposta, overtime e colocação final. A consulta acontece enquanto o app está executando e ao retomá-lo. **Não há entrega push com o app fechado ou suspenso pelo sistema**: essa entrega requer inscrições Web Push e serviço de envio no backend. Permissões de notificação são solicitadas por ação explícita da pessoa. Avisos já vistos são deduplicados no armazenamento local.
- Administradores podem excluir definitivamente um evento em qualquer estado, confirmando seu nome. O servidor valida a revisão e remove inscrições, rodadas, partidas, auditoria e exportações em uma transação. Um resultado oficial já importado do DigiLab permanece no histórico independente.

## Desempates: validação ainda pendente

A ordem é pontos → OMW% → GW% → OGW%. O perfil `community-bo3-50-5-preview-v2` é explicitamente uma **prévia**, sem alegação de equivalência exata ao TCG+.

O cálculo usa pontos 3/1/0 por jogo; aplica piso de 0,33 aos percentuais dos adversários usados nas médias; compara valores sem arredondamento e exibe duas casas. Pela regra definida para os eventos da comunidade, um bye vale três pontos de rodada e vitória de 2–0 para o GW% (6 pontos de jogo em 2 jogos). Não cria um adversário nas médias OMW%/OGW%. Jogadores desistentes conservam seu histórico.

A versão anterior `preview-v1` excluía o bye do GW%. Eventos ainda não finalizados migram para `preview-v2`, com registro na auditoria; eventos encerrados e seus resultados congelados preservam o perfil anterior.

Conferência documental em 01/11/2026: o [manual oficial da Bandai, seções 3.4.2 e 5.4](https://world.digimoncard.com/event/online_event/pdf/tournament_rules.pdf?20240606=) confirma o bye em caso de número ímpar e os 3 pontos. O texto consultado não especifica o tratamento 2–0 no GW% nem homologa a cadeia completa OMW% → GW% → OGW%; essa parte permanece uma política explícita da comunidade até validação com o TCG+.

Antes de homologar o perfil, comparar com eventos reais do TCG+ incluindo `1–1–0`, `1–1–1`, bye, desistência, pisos e arredondamentos. Até lá, a organização deve conferir a classificação; a finalização exige confirmação da revisão. Nunca mudar as fórmulas de um perfil já utilizado: publicar outra versão e manter o comportamento dos eventos antigos. O nome histórico do perfil de desempates não determina a duração da rodada.

## DigiLab

Ao finalizar, **Copiar resultados** gera e registra uma versão no formato:

```text
1 PlayerOne #0012345678 9
2 PlayerTwo #0098765432 7
```

O cabeçalho é preenchido manualmente no DigiLab: loja/associação da comunidade, tipo, data, formato do evento, rodadas realizadas e jogadores que iniciaram (incluindo desistentes). IDs ausentes são avisados e omitidos, nunca fabricados. O fluxo antigo de cópia conserva seu formato padrão.

Copiar não publica o evento. A tela oferece apenas copiar resultados e abrir submissão. A reconciliação automática existente continua disponível no backend para eventos com ID explicitamente vinculado; IDs vinculados são consultados mesmo fora da cena Curitiba, com até cinco verificações por execução, respeitando os limites e erros da integração.

A reconciliação verifica data, formato, quantidade de jogadores, rodadas informadas, loja quando configurada, identidade/colocação e pontos disponíveis. Divergências ficam para revisão; nenhuma alteração parcial é aplicada. A importação usa as transações existentes, conserva os IDs e liga o mesmo evento operacional ao registro oficial. Eventos sem loja usam `organizer_name`; não são criadas lojas fictícias. Eventos sem deck são permitidos.

O histórico, os posts e as estatísticas continuam recebendo somente dados importados do DigiLab. Listas privadas e partidas operacionais não dependem de retorno pela API.

## Implantação

Requer o esquema de contas e integrações existente. Aplicar, nesta ordem:

1. `20261101010000_community_tournaments.sql`.
2. `20261101020000_community_history.sql`.
3. `20261101030000_community_digilab_reconciliation.sql`.
4. `20261101040000_community_event_defaults_and_players.sql`.
5. Aplicar as migrações `20261101050000` até `20261101180000_community_restart_round.sql`, em ordem.
6. Publicar `community-pairings`, `import-digilab-tournament` e `sync-new-digilab-tournaments`.
7. Compilar e publicar o frontend após o backend.

O pipeline existente inclui essas migrações e funções. As migrações podem ser reaplicadas sem apagar eventos; as definições do histórico preservam o suporte a duplas já existente. Nenhum secret novo é necessário: a importação usa o secret DigiLab configurado. O gerador de mesas valida o JWT e o acesso administrativo internamente.

As tabelas operacionais têm RLS e não permitem acesso direto a usuários públicos/autenticados. As RPCs filtram dados privados; listas completas são visíveis apenas ao participante e à organização. Escritas usam bloqueio por evento e revisão obrigatória para impedir sobrescrita e lotação excedida. A consulta da interface atualiza a cada 10–15 segundos quando ativa.

## Verificação

Testes em PGlite cobrem acesso, vínculo obrigatório, vagas, revisão, placares, invalidação, 128 jogadores, relógio, importação sem loja, idempotência e rollback por divergência. O motor tem cenários de pareamento de 4 a 128 jogadores. O exportador tem cobertura para nomes compostos, zero pontos, `#` e zeros iniciais.

Ainda exigem validação externa: fórmulas contra o TCG+, aceitação do paste na prévia real do DigiLab e um torneio piloto. Os testes locais não submetem torneios a serviços externos. CSV, escrita no Limitless, duplas, top cut e entrada tardia não integram esta versão.

- Os tempos podem ser definidos ao criar ou em Admin > Gerenciar torneio. O padrão é 45 minutos normais e 5 de overtime; overtime 0 desativa a prorrogação. Alterar a configuração preserva os prazos da rodada em andamento e vale para as próximas rodadas ou seu reinício.
- O aviso de início usa `Inicio do overtime: 5 minutos ou 3 turnos` (minutos conforme a duração real da rodada). No fim: `fim do overtime, passem os resultados`. As labels **OVERTIME** e **FIM DO OVERTIME** aparecem acima do timer. O cronômetro fica vermelho e pisca ao esgotar o tempo; respeita a preferência por movimento reduzido. Sem overtime, não emite esses dois avisos.
- Pairings, histórico e ranking destacam a célula do jogador logado com contorno, conservando a cor de vitória ou empate. No mobile os botões Adicionar torneio e Organizar torneio dividem a mesma linha.
- Antes do início, o resumo e as regras permanecem visíveis; Editar configuração fica junto da preparação do início. As inscrições continuam abertas automaticamente após a criação.
- Após **Parar rodada**, admins podem **Continuar a rodada de onde parou**, restaurando as mesas, os placares e as propostas salvas. O relógio desconta a pausa, inclusive durante overtime. A restauração aumenta a revisão dos resultados para rejeitar envios desatualizados. Se um jogador com partida pendente deu DROP durante a pausa, é necessário refazer os pareamentos. A opção de refazer e reiniciar continua disponível, com confirmação antes de substituir os placares salvos.
- **Iniciar próxima rodada** usa o motor suíço compartilhado e envia as mesas ao RPC autenticado `community_start_next_round`, que valida as mesas e inicia o relógio na mesma transação. Esse fluxo funciona também quando o admin participa do torneio e dispensa a autenticação adicional da Edge Function. No mobile, os controles de rodada ficam abaixo da tabela de pairings, sem menu no cabeçalho.
- Na Visão Geral, os cards de inscrição aparecem apenas enquanto as inscrições estiverem abertas. Depois do início, permanece o aviso superior da rodada, com **Ver torneio** à direita e sem botão de dispensar. O aviso reaparece ao recarregar, mas a entrega de notificações do sistema continua deduplicada.
- Antes do primeiro início, uma janela mostra o total atual de jogadores, o sorteio dos pairings e os tempos normal/overtime configurados, com **Sim** e **Não**. Para excluir um torneio, é necessário digitar **deletar**, validado também no servidor, além da permissão administrativa e revisão atual do evento.
- Para jogadores comuns, ao abrir uma proposta recebida, **Confira o placar** mostra apenas **Confirmar o resultado** e **Refutar resultado**, junto do placar informado. O formulário de pontuação só aparece após refutar. Administradores confirmam resultados diretamente, inclusive na própria mesa e contra outro admin. O formulário administrativo mostra os jogadores na ordem da mesa; propostas de jogadores comuns usam a perspectiva de quem envia.
- A notificação de proposta mostra o resultado de quem recebe: `Confirmar R1: WIN 2-1`, `Confirmar R1: LOSS 1-2` ou `Confirmar R1: DRAW 1-1-1`. Os valores correspondem ao placar real; em empates os três números são vitórias, derrotas e jogos empatados.

- A migração `20261102240000_community_admin_results.sql` aplica a confirmação direta dos resultados enviados por admins, preservando a auditoria e o fechamento automático da rodada.
- A migração `20261102250000_community_self_withdrawal.sql` permite cancelar a própria inscrição antes do início, com validação do jogador no servidor e auditoria.
