# Plano de auditoria do site

Data: 25/10/2026. Status: coleta, painel, exportação por período e diagnóstico implementados; migrações até `20261025090000` aplicadas. Publicação do frontend e configuração operacional externa ainda precisam ser concluídas. Consulte o [roteiro de aceites, eliminação e auditoria](../guides/aceites-eliminacao-auditoria.md) para a cobertura efetiva e os serviços externos necessários.

Este documento complementa o [plano de gestão de contas](gestao-de-contas.md). O objetivo é conseguir responder, com evidências: **quem fez o quê, quando, em qual registro e o que mudou**.

## 1. Escopo inicial

| Área                | Eventos a registrar                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Contas              | Cadastro, alterações de perfil, bloqueio, reativação e encerramento.                                                       |
| Autenticação        | Eventos disponíveis no provedor: entrada, saída, recuperação, troca de senha e falhas relevantes, sem guardar credenciais. |
| Administração       | Concessão e remoção de privilégio, conta responsável e conta afetada.                                                      |
| Vínculos            | Solicitação, aprovação, recusa e alteração do vínculo entre conta e jogador.                                               |
| Decks da comunidade | Criação, edição, importação, cópia, exclusão, alteração de autor e transferência de propriedade.                           |
| Torneios            | Criação, alteração e exclusão de torneios, resultados e listas associadas.                                                 |
| Cadastros globais   | Mudanças em jogadores, lojas, tipos de deck e demais entidades administrativas.                                            |
| Formatos            | Alterações em regras, banlists, pontuação, publicação e desativação.                                                       |
| Integrações         | Execuções de DigiLab, OCR e outras importações: responsável ou rotina, origem, resultado e identificador da execução.      |
| Auditoria           | Consulta de detalhes restritos, exportações e operações de retenção sobre o próprio histórico.                             |

Consultar páginas públicas não deve gerar, por padrão, uma trilha nominal de navegação de cada visitante. Métricas de acesso, se necessárias, terão finalidade e política próprias.

## 2. Informações de cada evento

Tabela proposta: `audit_events`, em esquema de acesso restrito.

| Campo                       | Conteúdo                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `event_id`                  | Identificador único do evento.                                                                                           |
| `occurred_at`               | Data e hora geradas pelo servidor, em UTC; a interface apresenta o fuso informado.                                       |
| `actor_user_id`             | Conta autenticada que originou a ação, quando houver.                                                                    |
| `actor_kind`                | Usuário, rotina de sistema ou manutenção identificada. Tentativas sem autenticação não recebem uma identidade presumida. |
| `action`                    | Código estável, como `deck.author_changed`, `deck.deleted` ou `account.admin_granted`.                                   |
| `entity_type` e `entity_id` | Tipo e identificador do registro afetado.                                                                                |
| `changes`                   | Campos permitidos que mudaram, com valores anteriores e posteriores quando necessários.                                  |
| `request_id`                | Correlação entre a operação, seus eventos e os registros técnicos do servidor. Não comprova identidade por si só.        |
| `operation_id`              | Agrupa eventos de uma importação, exclusão com dependências ou outra ação composta.                                      |
| `outcome`                   | Sucesso, recusa ou falha, conforme a fonte do evento.                                                                    |
| `reason_code`               | Motivo padronizado e seguro, sem copiar respostas brutas ou segredos.                                                    |
| `schema_version`            | Versão do formato do evento, para permitir evolução e exportação.                                                        |

O identificador do registro deve sobreviver à exclusão da entidade: não usar uma relação com exclusão em cascata que apague a trilha junto com o deck ou a conta.

## 3. O que mudou: dados mínimos e comparação útil

Exemplos de apresentação:

- **Autor do deck alterado:** conta responsável, deck, jogador anterior e jogador novo, identificados pelos seus IDs.
- **Banlist alterada:** cartas incluídas ou removidas e limites anteriores e novos.
- **Resultado corrigido:** torneio, participação e campos autorizados alterados, com indicação do responsável.
- **Administrador adicionado:** conta que concedeu o acesso e conta que o recebeu.
- **Importação realizada:** origem, quantidade de registros processados, falhas e execução correspondente.

Usar uma lista explícita de campos permitidos por entidade. Não copiar automaticamente a linha inteira do banco para um JSON de auditoria.

O conteúdo completo e todas as versões de uma decklist só devem ser preservados se houver uma necessidade definida e uma política de retenção correspondente. Auditoria não implica guardar cópias ilimitadas de tudo nem oferecer restauração automática de qualquer exclusão.

## 4. Registro confiável no banco e no servidor

### Alterações concluídas

- Registrar mudanças de dados no backend ou em triggers do banco, cobrindo interface, API direta e RPCs.
- Gravar a mudança e seu evento na mesma transação. Se a auditoria obrigatória falhar, a alteração não deve ser confirmada sem histórico.
- Obter a identidade da sessão validada pelo servidor, como `auth.uid()`. Não confiar em um `user_id` enviado pelo navegador como prova de autoria.
- Nas funções `security definer`, preservar a identidade do solicitante autenticado e distinguir a conta responsável da função privilegiada que executou a mudança.
- Nas rotinas com `service_role`, identificar o serviço e, quando houver, a conta que disparou a execução. Não colocar a chave de serviço no frontend.
- Uma ação composta pode gerar vários eventos de entidade, mas todos devem compartilhar a mesma operação e evitar duplicação do mesmo evento lógico.

### Tentativas recusadas e falhas

Uma transação desfeita também desfaz os eventos inseridos dentro dela. Portanto, um trigger de atualização não é suficiente para registrar tentativas negadas ou operações que falharam.

- Usar os logs de autenticação do Supabase para os eventos de identidade disponíveis no ambiente contratado.
- Usar registros do servidor/gateway e das funções para recusas e falhas de operações relevantes.
- Correlacionar as fontes sem afirmar que uma tentativa foi bem-sucedida quando a alteração não foi confirmada.
- Verificar, no inventário, a cobertura real de recusas na API direta. Se os logs disponíveis não atenderem ao requisito, encaminhar essas operações por um endpoint de servidor que produza a evidência necessária.
- Mensagens enviadas pelo navegador podem servir como telemetria auxiliar, mas nunca são a única evidência de uma ação ou identidade.

### Dados antigos e manutenção

- Identificar registros importados como legado; não inventar quem os criou no passado.
- Registrar quem atribuiu propriedade ou vinculou um cadastro antigo a uma conta.
- Migrações e correções manuais precisam de execução identificada, versão do script, motivo e responsável pelo procedimento.
- Não atribuir mudanças feitas diretamente por manutenção a um usuário do site sem uma evidência válida desse vínculo.

## 5. Proteção do histórico

- Usuários comuns não podem inserir, alterar ou excluir eventos diretamente.
- Administradores da aplicação autorizados podem consultar os eventos, mas não editar ou apagar eventos pelo painel ou pela API normal.
- Inserção fica limitada aos mecanismos de auditoria confiáveis. Não expor uma RPC pública que aceite ator, horário e ação arbitrários como se fossem evidência verificada.
- Aplicar controle de acesso, validação e limitação de volume às consultas e exportações.
- Não depender apenas de RLS: revisar privilégios de tabela, funções e acesso de infraestrutura.
- Manter backup e testar sua restauração. Monitorar períodos inesperados sem eventos ou falhas na coleta.

Essa proteção torna a trilha somente de acréscimo para os usuários e administradores da aplicação. Não significa que ela seja inviolável para quem controla o banco ou a infraestrutura.

Como evolução, prever cópias em armazenamento separado, com retenção protegida e controle de acesso independente. Assinaturas ou verificações de integridade podem ajudar a detectar alterações, mas não substituem essa separação; uma cadeia de hashes guardada apenas no mesmo banco não elimina o risco de reescrita por um operador privilegiado.

## 6. Painel de auditoria

Adicionar **Admin → Auditoria**, com:

- Filtros por período, conta responsável, ação, entidade, resultado e execução.
- Linha do tempo de cada deck, jogador, torneio ou formato.
- Comparação legível dos campos alterados, sem expor campos fora da lista autorizada.
- Identificação clara de ações humanas, rotinas automáticas e operações de manutenção.
- Consulta paginada no servidor e índices adequados; não carregar o histórico inteiro no navegador.
- Exportação autorizada por período e filtros, em formato documentado. Registrar quem exportou e o intervalo consultado.

Tratar textos como dados, inclusive nas exportações: evitar execução de HTML na tela e fórmulas injetadas em arquivos CSV. O painel não pode apresentar uma exclusão comum de eventos individuais.

## 7. Privacidade, senhas e retenção

- Nunca registrar senha, hash de senha, token de sessão, refresh token, chave de serviço ou link completo de recuperação.
- Uma troca de senha gera o evento de troca e o responsável conhecido; não os valores anterior e novo. Não aplicar auditoria genérica sobre `auth.users`.
- Não coletar IP e informações detalhadas de dispositivo por padrão na trilha funcional. Avaliar separadamente os logs de segurança do provedor, suas finalidades e retenção.
- Definir o responsável pela consulta dos eventos, a finalidade, a base legal aplicável e os prazos de retenção por categoria.
- Incluir a auditoria no aviso de privacidade e no tratamento dos pedidos dos titulares.
- Ao encerrar uma conta, aplicar a política definida de eliminação, anonimização ou conservação justificada dos eventos. Não prometer apagar tudo nem guardar tudo para sempre.
- Fazer o descarte por rotina restrita, após o prazo definido, com evidência mínima da execução. O descarte autorizado por retenção não equivale a permitir que administradores apaguem rastros de uma ação específica.
- Revisar também retenção e acesso nas cópias de segurança, exportações e fornecedores de logs.

Essas medidas entram no trabalho de adequação à LGPD. Ter logs não comprova, sozinho, conformidade legal.

## 8. Implementação por entrega

| Entrega                   | Resultado verificável                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Inventário                | Lista de ações, campos permitidos, fontes de eventos, responsáveis e lacunas de cobertura.                                  |
| Infraestrutura            | Esquema de eventos, coleta confiável, permissões, correlação e testes de integridade transacional.                          |
| Primeira versão de contas | Cadastro e vínculos, criação e alterações dos decks, autor, propriedade, exclusões e privilégios administrativos auditados. |
| Cobertura do site         | Torneios, resultados, cadastros globais, regulamentos e integrações incluídos na trilha.                                    |
| Operação                  | Painel, exportação controlada, retenção, backup e procedimento de investigação testados.                                    |

A infraestrutura de auditoria deve ser criada antes de liberar as novas gravações vinculadas a contas. Eventos antigos indisponíveis não podem ser reconstruídos como se tivessem sido coletados na época.

## 9. Critérios de aceite

- Uma ação feita pela interface e a mesma ação feita por API produzem evidências equivalentes.
- O cliente não consegue falsificar conta responsável, horário ou resultado confirmado.
- Mudança confirmada gera evento; mudança revertida não aparece como sucesso.
- Recusas e falhas relevantes são encontradas na fonte de segurança prevista, mesmo quando a transação de dados é desfeita.
- Duas edições concorrentes registram o que efetivamente foi confirmado, sem inventar uma alteração para a operação recusada.
- Exclusões não apagam o próprio histórico, e alterações em dependências preservam a correlação com a ação original.
- Nem o proprietário de um deck nem o administrador da aplicação consegue alterar ou excluir diretamente a trilha.
- Campos secretos não aparecem nos eventos, nos detalhes do painel nem nas exportações.
- Consultas e exportações só funcionam com a autorização definida e ficam registradas.
- Uma investigação de exemplo consegue reconstruir a troca de autor, a transferência de propriedade e a exclusão de um deck.
- A coleta suporta o volume esperado de importações sem impedir a consulta da biblioteca. Índices, paginação e retenção são verificados com dados representativos.
- Restauração de backup e descarte por retenção são testados antes da publicação.

## Referências

- [Plano de contas e permissões](gestao-de-contas.md)
- [OWASP — Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [Supabase — Auth Audit Logs](https://supabase.com/docs/guides/auth/audit-logs)
- [LGPD — texto da lei](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
