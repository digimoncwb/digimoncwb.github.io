# Testes de contas, permissões e limpeza

Os ensaios combinaram a suíte automatizada, operações no banco hospedado revertidas integralmente e uma jornada no site público com uma conta descartável. Após autorização do responsável, o controle geral de contas foi ativado em produção em 26/10/2026 (UTC; noite de 25/10 em Brasília). Os resultados abaixo distinguem o diagnóstico anterior e a verificação após a ativação.

## Permissões no banco real

Foram usados somente jogadores, decks e identidades fictícias criados dentro de uma transação. O modo atual foi comparado com o controle geral temporariamente ativado na mesma transação. Ao final, todas as linhas e a mudança de configuração foram revertidas.

| Verificação                                                            | Piloto antes da ativação | Produção após a ativação |
| ---------------------------------------------------------------------- | ------------------------ | ------------------------ |
| Visitante não edita deck da comunidade                                 | Falhou: edição permitida | Passou                   |
| Visitante não altera cadastro de jogador                               | Falhou: edição permitida | Passou                   |
| Conta comum edita o próprio deck                                       | Passou                   | Passou                   |
| Conta comum não edita deck de outra conta                              | Falhou: edição permitida | Passou                   |
| Proprietário exclui seu deck pela função usada na tela                 | Passou                   | Passou                   |
| Conta comum não exclui deck de outra conta                             | Passou                   | Passou                   |
| Admin não exclui deck que pertence a outra conta                       | Passou                   | Passou                   |
| Admin exclui deck sem proprietário pela função da tela                 | Passou                   | Passou                   |
| Conta comum não consulta o gerenciamento administrativo                | Passou                   | Passou                   |
| Conta comum não concede administração a si mesma                       | Passou                   | Passou                   |
| Visitante não exclui deck                                              | Passou                   | Passou                   |
| Conta comum assume deck sem proprietário sem aprovação                 | Passou                   | Passou                   |
| Conta comum não assume deck já pertencente a outra conta               | Passou                   | Passou                   |
| Transferir a chamada de exclusão para admin não contorna a propriedade | Passou                   | Passou                   |
| Decks públicos continuam consultáveis sem login                        | Passou                   | Passou                   |

Resultado inicial: **12/15 no piloto e 15/15 com o controle ativo no ensaio**. Após a ativação permanente (`accounts_enabled=true`), a matriz foi repetida e passou **15/15 no estado real de produção**, além de 15/15 na repetição transacional. Todos os dados fictícios foram revertidos e a configuração permaneceu ativa.

A ativação foi executada com a identidade administrativa existente de Eduardo, já confirmada e com aceites vigentes. Seu acesso administrativo foi verificado na mesma transação. A comparação antes/depois confirmou que perfis, decks, registros de aceite, versões legais e retenção permaneceram intactos. As seis atribuições administrativas foram preservadas; os outros cinco administradores precisam concluir seus próprios aceites para usar os recursos autenticados. A interface publicada abre Minha conta automaticamente para contas confirmadas e ativas que precisam dos aceites; nenhum aceite foi registrado em nome de terceiros.

A autenticação de execução agendada também foi conferida depois da ativação: uma consulta `audit_tournaments` pelo token operacional retornou HTTP 200 e dados do DigiLab, sem iniciar sincronização nem alterar catálogos. A auditoria retornou `severity=ok`, sem integrações paradas ou falhas não recuperadas. O [workflow Audit health 40267313923](https://github.com/digimoncwb/digimoncwb.github.io/actions/runs/40267313923) também concluiu com sucesso.

## Jornada de conta comum no site público

O workflow manual **Live account journey tests** cria uma única conta em endereço reservado para testes. As duas operações que enviariam mensagens são substituídas por `generateLink` no runner: os links são reais do Auth, mas nenhum e-mail é enviado. A validação de links, sessões, perfil, RPCs e troca de senha usa o serviço hospedado. Isso não substitui um teste adicional de entrega SMTP; os recebimentos dos testes anteriores foram confirmados pelo responsável, incluindo a mensagem inicialmente classificada como spam.

Os testes estão protegidos por autorização explícita de conta descartável. A limpeza remove a identidade de Auth, o perfil fictício e seus aceites após cada execução, inclusive quando uma etapa falha. Dados de contas existentes não são usados para trocar senha, endereço ou permissões. Tokens, links, senhas e chaves ficam apenas na memória do runner e não aparecem nos resultados.

Na passagem inicial, a confirmação ocorreu no servidor, mas o navegador permaneceu sem sessão. O diagnóstico mostrou a rota e a autenticação concatenadas em dois fragmentos (`#overview#access_token=...`), impedindo o SDK de reconhecer o primeiro parâmetro. A correção gera novos retornos sem fragmento de rota e normaliza esse formato nos links antigos antes de inicializar o SDK. Testes de regressão cobrem cadastro, recuperação, convite e troca de e-mail, sem modificar rotas comuns ou callbacks incompletos.

A repetição completa passou inicialmente no [workflow 40263998440](https://github.com/digimoncwb/digimoncwb.github.io/actions/runs/40263998440). Após ativar o controle geral e publicar a versão `2026.10.25.11`, passou novamente no [workflow 40266934130](https://github.com/digimoncwb/digimoncwb.github.io/actions/runs/40266934130):

| Etapa no ambiente real                                                                                     | Resultado |
| ---------------------------------------------------------------------------------------------------------- | --------- |
| Formulário exige os três aceites antes de criar a conta                                                    | Passou    |
| Login com senha é recusado antes de confirmar o endereço                                                   | Passou    |
| Link de confirmação com formato antigo assume a sessão e registra os aceites autenticados                  | Passou    |
| Reutilização do token de confirmação é recusada                                                            | Passou    |
| Conta comum não acessa a administração por tela nem por RPC                                                | Passou    |
| Nome de usuário salvo persiste após recarregar a página                                                    | Passou    |
| Link real de recuperação abre a definição de senha; senha antiga deixa de funcionar e nova senha autentica | Passou    |
| Troca de e-mail só conclui após confirmar os dois endereços, preservando o ID e a senha da conta           | Passou    |
| Logout remove a identidade privada e permanece após recarregar a página                                    | Passou    |
| Conta descartável, perfil e aceites de teste são removidos ao final                                        | Passou    |

O responsável concluiu a autorização pessoal no Google e confirmou o funcionamento como conta comum: entrada, conclusão dos aceites e ausência de acesso à área Admin. Essa etapa foi validada pelo usuário, complementando a conferência automatizada do redirecionamento público.

## Suíte e publicação da correção

A suíte executada antes dos ensaios passou com 281 testes. Após acrescentar a proteção do teste ao vivo e a regressão do callback, o pipeline passou com 283 testes. A publicação da versão `2026.10.25.11` passou com **284 testes**, além de lint, TypeScript, build e implantação, no [pipeline 40266517577](https://github.com/digimoncwb/digimoncwb.github.io/actions/runs/40266517577). A nova regressão verifica o encaminhamento para os aceites e a liberação da conta após o registro autenticado. O teste ao vivo roda apenas por execução manual autorizada, separado dos testes automáticos comuns.

O navegador também conferiu a versão publicada em celular: cadastro habilitado, três declarações inicialmente desmarcadas, documentos vigentes legíveis, olho da senha centralizado e ausência de rolagem horizontal ou erros de JavaScript. A consulta final encontrou zero contas descartáveis restantes.

## Limpeza e recursos ainda ausentes

- **Auditoria:** o ensaio no banco real inseriu um evento fictício mais antigo que a retenção e outro recente. A rotina removeu o primeiro e preservou o segundo; tudo foi revertido após a conferência. O agendamento diário está ativo. O ensaio não equivale a observar uma execução agendada já concluída.
- **Mensagens e solicitações:** a limpeza de dados resolvidos em 180 dias continua sendo procedimento manual; não foi encontrada uma rotina automática correspondente. A tabela de feedback também não registra uma data de resolução para automatizar esse prazo diretamente.
- **Notificações de solicitações:** não foi encontrado um mecanismo de envio por e-mail ao aprovar ou recusar solicitações administrativas. Os triggers existentes cobrem auditoria e consistência da exclusão de conta, sem um envio de e-mail.
- **Alertas externos:** o diagnóstico confirma que alertas externos de entrega e ingestão central de recusas da API não estão configurados. A consulta manual dos logs existe, mas não substitui alertas automáticos.

O ponto prioritário de encerrar o modo piloto foi concluído. As três edições indevidas detectadas inicialmente foram recusadas no banco real após a ativação. As funções ausentes listadas acima continuam pendentes e não são cobertas pela ativação do controle de contas.
