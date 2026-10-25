# Plano de desenvolvimento: contas e permissões do site

Data: 25/10/2026. Status: base e complementos implementados; migrações até `20261025090000` aplicadas ao Supabase. O controle de contas permanece desativado. Publicação do frontend, configuração dos e-mails e documentos finais ainda precisam ser concluídas. Consulte o [roteiro de aceites, eliminação e auditoria](../guides/aceites-eliminacao-auditoria.md) para o comportamento efetivo e os limites da entrega.

## 1. Objetivo

Ter uma conta pessoal e uma sessão única para o site inteiro. Vincular os cadastros a quem os criou, permitir que cada pessoa cuide dos próprios decks e reservar a administração a contas específicas.

As páginas de consulta continuam públicas. O login passa a ser necessário para cadastrar ou alterar informações. A primeira entrega funcional deve resolver contas, perfil de jogador e propriedade dos decks da comunidade.

**Auditabilidade é requisito da entrega.** Ações relevantes precisam registrar conta responsável, horário, entidade e mudanças efetivadas. A trilha deve cobrir também administradores e operações diretas de API. O desenho, a proteção do histórico, o painel e os critérios de aceite estão no [plano de auditoria do site](auditoria.md).

## 2. Situação atual do projeto

- O Supabase Auth já autentica os administradores. A tabela `admin_users` identifica quem tem acesso administrativo.
- A sessão atual em `shared/data/admin-session.js` exige que o usuário seja administrador. Será necessário separar a autenticação geral dessa verificação de privilégio.
- O login administrativo usa e-mails internos derivados da credencial. Essas contas precisam de um plano específico de transição para o login pessoal e a recuperação por e-mail.
- O shell, o workspace, o deckbuilder e o estúdio são módulos independentes. Precisam consumir uma sessão compartilhada, sem criar logins separados.
- `config/supabase.js` monta cabeçalhos com o token público por padrão. Cada caminho de gravação precisa passar a enviar o token da conta conectada.
- Existem permissões de criação e edição anônima, inclusive em decks da comunidade e RPCs. Esconder botões não substitui a revisão dessas permissões.
- `decklists.creator_player_id` representa o jogador creditado como autor. Esse campo pode ser escolhido por quem cadastra; portanto, não comprova propriedade de uma conta.

Antes de escrever migrações, comparar o esquema e as políticas efetivamente publicados com os arquivos locais. Mudanças recentes, como a exclusão administrativa de decks, também precisam entrar nesse inventário.

## 3. Comportamento esperado

### Perfis de acesso

| Ação                                                          | Visitante       | Usuário ativo e com e-mail confirmado | Administrador ativo                       |
| ------------------------------------------------------------- | --------------- | ------------------------------------- | ----------------------------------------- |
| Consultar torneios, estatísticas e decks públicos             | Sim             | Sim                                   | Sim                                       |
| Criar um deck da comunidade                                   | Entrar primeiro | Sim                                   | Sim                                       |
| Editar ou excluir um deck da comunidade                       | Não             | Apenas os próprios                    | Todos                                     |
| Editar o autor creditado no deck                              | Não             | Nos próprios decks                    | Em todos                                  |
| Transferir a propriedade de um deck                           | Não             | Não na primeira versão                | Sim, com registro da alteração            |
| Vincular um jogador antigo a uma conta                        | Não             | Solicitar vínculo                     | Validar e aprovar                         |
| Criar ou alterar jogadores, lojas e tipos de deck globais     | Não             | Solicitar correção                    | Sim                                       |
| Gerenciar torneios, resultados, regulamentos e sincronizações | Não             | Não                                   | Sim                                       |
| Conceder ou remover administração                             | Não             | Não                                   | Administradores autorizados a essa gestão |

Ser um administrador não cria uma segunda conta: é uma permissão adicional da conta pessoal. A gestão de administradores não pode permitir que a última conta administrativa ativa perca o acesso.

### Fluxo de conta

1. A pessoa clica em **Entrar** no menu do site.
2. Pode cadastrar uma conta, entrar ou recuperar a senha.
3. Após confirmar o e-mail, escolhe um nome de usuário público e completa o perfil.
4. Se já estiver cadastrada como jogador, solicita o vínculo com esse cadastro. A associação é validada, sem criar automaticamente um segundo jogador.
5. O site mantém a sessão durante a navegação. Ao sair, todos os módulos refletem o encerramento da sessão.
6. A área **Minha conta** permite editar os campos pessoais autorizados. **Meus decks** lista os decks que pertencem à conta.

Uma conta confirmada pode criar decks antes de ter um vínculo com jogador aprovado. Nesse caso, o responsável já é identificado pela conta e o autor creditado pode ficar em branco.

### Identidades que precisam permanecer separadas

- **Conta:** identidade usada no login, identificada por `auth.users.id`.
- **Perfil público:** nome de usuário e nome de exibição.
- **Jogador:** cadastro usado nos torneios e no histórico competitivo, mesmo que a pessoa nunca crie conta.
- **Proprietário do deck:** conta que pode gerenciar o registro.
- **Autor creditado:** jogador mostrado no deck e na imagem exportada.
- **Responsável pela operação:** conta que criou ou modificou um registro.

Ao criar um deck, o proprietário é definido pelo servidor como a conta conectada. O autor creditado pode começar com o jogador vinculado ao perfil. Editar o autor nunca transfere propriedade.

## 4. Modelo de dados proposto

| Estrutura                 | Campos principais e finalidade                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth.users`              | Usar a identidade e as credenciais administradas pelo Supabase Auth. Não armazenar senhas em tabelas da aplicação.                                                       |
| `user_profiles`           | `user_id` como chave e referência à conta; `username` com unicidade normalizada; `display_name`; `player_id` opcional e único; `status`; datas de criação e atualização. |
| `admin_users`             | Reaproveitar como fonte da permissão administrativa. Alterações de membros somente por operação privilegiada e auditada.                                                 |
| `decklists`               | Acrescentar `owner_user_id`, `created_by_user_id` e `updated_by_user_id`. Preservar `creator_player_id` como crédito de autoria.                                         |
| Cadastros administrativos | Acrescentar identificação de criação e atualização nas tabelas definidas no inventário, sem presumir que quem cadastrou é dono do jogador, loja ou torneio.              |
| Solicitações de vínculo   | Conta solicitante, jogador pretendido, estado pendente/aprovado/recusado, responsável pela análise e datas.                                                              |
| Histórico de ações        | Registrar mudanças de privilégio, vínculo, propriedade, bloqueio e exclusões relevantes. Não registrar senhas, tokens ou conteúdo de recuperação.                        |

Regras obrigatórias:

- Um jogador pode estar vinculado a no máximo uma conta, e uma conta a no máximo um jogador na primeira versão.
- Nome de usuário único deve ser garantido no banco, sem distinção entre maiúsculas e minúsculas.
- E-mail e dados privados da conta não entram nas consultas públicas da biblioteca ou dos jogadores.
- Perfil público não permite alterar `status`, vínculo de jogador ou papel administrativo livremente pelo cliente.
- O usuário não pode forjar os campos de auditoria nem mudar o proprietário por um `PATCH` direto.
- Registros antigos ficam com propriedade desconhecida até serem associados por uma operação validada. Não inventar o usuário que os criou originalmente.
- Definir o comportamento das referências antes de oferecer exclusão de conta. A remoção de uma conta não pode apagar automaticamente o histórico de torneios ou liberar decks sem controle de propriedade.

Um e-mail e um nome de usuário únicos evitam duplicidade desses identificadores, mas não garantem uma única conta por pessoa física. O vínculo validado com o cadastro de jogador é a regra principal para a identidade competitiva.

## 5. Etapas de desenvolvimento

### Etapa 0 — Inventário e decisões de produto

**Trabalho**

- Levantar tabelas, políticas RLS, permissões, funções RPC, Edge Functions e operações de Storage acessadas pelo frontend.
- Mapear cada operação de leitura e escrita, incluindo telas antigas, importação, OCR, cópia de decks, sincronização e rotas diretas da API.
- Confirmar os administradores atuais e como manterão o acesso durante a transição.
- Levantar jogadores duplicados, decks sem autor e registros sem responsável conhecido.
- Fechar as decisões listadas na seção 9.

**Conclusão:** inventário de acesso e matriz de permissões revisados, com roteiro de migração e recuperação do acesso administrativo.

### Etapa 1 — Banco e sessão compartilhada

**Trabalho**

- Criar migrações incrementais para perfis, vínculos, propriedade e auditoria, preservando os dados existentes.
- Preparar a coleta e a proteção dos eventos de auditoria antes de ativar as novas gravações, seguindo o [plano de auditoria](auditoria.md).
- Criar o perfil inicial com operação segura e idempotente. Cadastro de uma conta nunca pode conceder administração.
- Implementar um serviço único de autenticação, com restauração de sessão, renovação de token, saída e estado de perfil/permissões.
- Expor esse serviço pelo contrato dos módulos em `frontend/contracts.ts`. Os módulos devem poder assinar mudanças de sessão.
- Adaptar os cabeçalhos de requisição para usar a sessão ativa, preservando os caminhos de leitura pública e as configurações públicas do Supabase.
- Invalidar dados privados em memória quando a conta sair ou for trocada.

**Conclusão:** uma sessão funciona em shell, workspace, builder e studio; usuário comum entra sem passar pela exigência de `admin_users`.

### Etapa 2 — Cadastro, login e perfil

**Trabalho**

- Implementar entrar, cadastrar, confirmar e-mail, recuperar senha, definir nova senha, sair e editar perfil.
- Configurar remetente, envio de e-mail e URLs de retorno para os ambientes local, de teste e de produção, incluindo hospedagem em subdiretório.
- Adicionar **Entrar / Minha conta** ao menu e mostrar **Admin** somente às contas autorizadas.
- Quando uma ação exigir login, preservar a rota e o contexto para a pessoa continuar após entrar. Não perder a lista digitada no importador ou alterações em andamento.
- Tratar sessão expirada, falha de rede e conta bloqueada sem descartar o conteúdo do editor.
- Criar o fluxo de solicitação de vínculo com jogador existente. Nome parecido ou Bandai ID informado pelo usuário, isoladamente, não aprovam o vínculo.

**Conclusão:** o fluxo completo de conta funciona e o login não apaga o trabalho em andamento.

### Etapa 3 — Propriedade e permissões dos decks

**Trabalho**

- Definir o proprietário de novos decks pela sessão no servidor; preencher o autor creditado com o jogador vinculado quando houver.
- Revisar `save_deck_draft`, cópia de listas, edição rápida de autor e exclusão para reconhecer proprietário e administrador.
- Permitir ao proprietário editar, trocar o crédito de autoria e excluir seus decks da comunidade. Manter confirmação para exclusão.
- Garantir que alterações de autoria e propriedade respeitem as revisões usadas para detectar edições concorrentes.
- Acrescentar **Meus decks** e distinguir na interface decks editáveis de decks apenas consultáveis.
- Permitir que um usuário copie um deck público para criar um novo deck próprio, sem ganhar acesso de escrita ao original.
- Preservar as regras específicas de listas de torneios: pertencer ao jogador creditado não concede permissão para modificar resultados históricos.
- Remover as gravações anônimas correspondentes quando essa entrega for ativada.

**Conclusão:** duas contas diferentes conseguem consultar o mesmo deck, mas apenas o proprietário ou um administrador consegue alterá-lo pela interface ou diretamente pela API.

### Etapa 4 — Administração e registros antigos

**Trabalho**

- Criar a tela de contas para buscar perfis, analisar vínculos e bloquear ou reativar acesso de escrita.
- Criar a gestão dos administradores, com proteção da última conta administrativa ativa e registro de quem alterou a permissão.
- Migrar os administradores existentes para login pessoal com e-mail recuperável. Validar o novo acesso antes de retirar o método anterior.
- Criar uma fila de decks sem proprietário e uma ação administrativa de atribuição ou transferência.
- Usar o autor atual dos decks apenas como sugestão de associação. Não transferir todos os decks automaticamente só porque `creator_player_id` coincide com o jogador solicitado.
- Manter decks antigos consultáveis e administráveis enquanto a associação não for aprovada.
- Bloquear gravações pelo banco em contas suspensas; esconder botões sozinho não basta. A consulta pública pode continuar disponível como visitante.

**Conclusão:** administradores conseguem resolver vínculos e propriedade sem editar SQL manualmente, e nenhuma conta ganha conteúdo ou privilégios indevidos pela migração.

### Etapa 5 — Cobertura das demais áreas e publicação

**Trabalho**

- Aplicar a matriz de permissões às demais áreas de cadastro e às integrações.
- Rever políticas permissivas antigas: políticas permissivas podem se somar e manter acessos que uma política nova pretendia fechar.
- Revisar funções `security definer`, que precisam validar explicitamente o usuário e sua autorização; conferir também permissões de execução.
- Restringir a criação e alteração de cadastros globais e resultados aos administradores. Registrar a conta responsável pelas operações.
- Rever permissões de upload e remoção de arquivos e o acesso a funções de sincronização, importação e geração de imagens no servidor.
- Atualizar os guias de uso, administração e segurança.
- Publicar primeiro em ambiente de teste, depois para um grupo piloto e por fim para a comunidade.

**Conclusão:** todas as gravações expostas têm uma regra documentada e testada, inclusive as que não passam pelos botões da interface.

## 6. Testes e critérios de aceite

### Autenticação e interface

- Cadastro com confirmação, recuperação de senha e retorno ao site funcionam nos endereços configurados.
- A sessão é compartilhada durante a navegação, restaura ao recarregar e se encerra em todos os módulos ao sair.
- Trocar de conta não mostra dados privados nem permissões da conta anterior.
- Sessão expirada não apaga a decklist em edição; o salvamento só continua com uma sessão válida.
- O login comum não abre a área administrativa.
- Seletores de jogador, nome de usuário e gestão de contas funcionam por teclado e em telas pequenas.

### Banco e autorização

- Testar visitante, usuário A, usuário B, administrador e conta bloqueada.
- Testar os acessos por consultas e chamadas HTTP diretas, e não apenas pela visibilidade dos botões.
- Usuário A não altera nem exclui decks de B, não muda o proprietário e não concede administração a si próprio.
- Alterar o autor creditado não altera o proprietário.
- Cópia de deck público cria um registro de A e preserva o original.
- Edição concorrente, transferência e exclusão não passam por cima de uma revisão mais recente.
- Contas não conseguem aprovar o próprio vínculo com jogador nem assumir cadastros antigos sem validação.
- Perfis públicos não expõem e-mail, tokens ou outros campos privados.
- A migração preserva jogadores, decks, listas, resultados e vínculos existentes; reexecuções previstas não duplicam registros.
- A última conta administrativa ativa não pode ser removida, rebaixada ou bloqueada pela gestão comum.

Usar os testes existentes de sessão administrativa e as verificações de banco com PGlite como ponto de partida. Confirmar os fluxos de Supabase Auth, e-mail e Storage em ambiente de teste, pois os testes locais de SQL não substituem essas integrações.

## 7. Ordem de entrega e esforço relativo

| Entrega                       | Conteúdo                                                                       | Dependências | Esforço relativo |
| ----------------------------- | ------------------------------------------------------------------------------ | ------------ | ---------------- |
| A — Preparação                | Inventário, decisões e plano dos dados antigos                                 | Nenhuma      | Pequeno a médio  |
| B — Base de contas            | Modelo de dados, sessão compartilhada e fluxos de login                        | A            | Médio            |
| C — Primeira versão funcional | Propriedade dos decks, regras de acesso, perfil e tratamento inicial do legado | B            | Grande           |
| D — Gestão completa           | Contas, vínculos, atribuições e privilégios administrativos                    | C            | Médio a grande   |
| E — Cobertura do site         | Demais cadastros, integrações, documentação e publicação gradual               | C e D        | Médio a grande   |

Não liberar a criação de contas como se a gestão de propriedade já estivesse pronta. A entrega funcional precisa combinar frontend, migrações e autorização dos decks. Prazos em dias devem ser definidos após o inventário, principalmente pela quantidade de políticas antigas e de registros que exigirem associação manual.

## 8. Publicação e recuperação

### Condição de publicação: privacidade e LGPD

O plano técnico não representa uma certificação de conformidade. Antes do lançamento, completar e validar a definição das finalidades e bases legais, o aviso de privacidade, os canais para exercício de direitos, os prazos de retenção e descarte, o tratamento de dados de menores quando aplicável, a resposta a incidentes e a análise de fornecedores e eventuais transferências internacionais.

Essa definição também precisa abranger os registros de auditoria e os dados legados já publicados. Prazos e procedimentos de encerramento de conta não podem ficar indefinidamente sem solução após o lançamento. As escolhas jurídicas precisam ser validadas por quem responde pelo tratamento de dados, com apoio especializado quando necessário.

### Roteiro de ativação

1. Exportar esquema, políticas e dados relevantes antes das mudanças.
2. Aplicar migrações aditivas em teste e executar a matriz de permissões.
3. Validar e-mail, restauração de sessão e acesso de pelo menos um administrador de recuperação.
4. Preparar a nova versão do frontend e todas as alterações de banco necessárias à mesma entrega.
5. Executar um roteiro coordenado de ativação. Uma flag de interface não substitui as restrições no banco; clientes antigos também precisam ser impedidos de gravar sem autorização.
6. Durante o piloto, verificar login, recuperação, cadastros novos, salvamentos, erros de autorização e associações de registros antigos.
7. Expandir a disponibilidade e retirar os caminhos de autenticação substituídos somente após validar a transição.

Se houver falha na publicação, manter consultas públicas e suspender temporariamente as gravações afetadas. Voltar ao frontend anterior não deve reabrir permissões anônimas nem eliminar os vínculos de propriedade já gravados. Migrações destrutivas devem ficar para uma etapa posterior, após o período de estabilização e com restauração testada.

## 9. Decisões e configuração de publicação

| Decisão                          | Proposta inicial                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Forma de entrada                 | E-mail e senha com confirmação; avaliar Google em uma segunda etapa.                                                              |
| Identificação pública            | Nome de usuário único e nome de exibição; e-mail privado.                                                                         |
| Acesso de visitantes             | Consulta pública, sem gravações.                                                                                                  |
| Vínculo com jogador              | Solicitação e aprovação administrativa; não obrigatório para criar um deck.                                                       |
| Autor versus proprietário        | Manter campos separados; crédito editável pelo proprietário, transferência somente pelo administrador na primeira versão.         |
| Decks antigos                    | Permanecem públicos e sob gestão administrativa até a atribuição validada.                                                        |
| Quem gerencia administradores    | Definir nominalmente as contas autorizadas antes da publicação; sem autoatribuição.                                               |
| Bloqueio e encerramento de conta | Bloqueio de escrita no lançamento; definir retenção, desvinculação e encerramento antes de oferecer exclusão definitiva da conta. |

O código, as migrações e os testes da primeira versão foram preparados localmente em 25/10/2026. A ativação no site hospedado segue o [roteiro de contas e auditoria](../guides/ativacao-contas-auditoria.md), que distingue o que está implementado das decisões legais e configurações externas pendentes. Responsável técnico informado: Eduardo Lopes; contato: dulopes1997@gmail.com. Os administradores existentes são preservados, com migração para e-mail real antes da ativação.

## 10. Fora da primeira versão

- Colaboração simultânea entre vários proprietários de um deck.
- Papéis adicionais de moderador ou organizador de loja.
- Login por vários provedores sociais e vinculação automática entre provedores.
- Transferência de propriedade diretamente entre usuários.
- Verificação automática de identidade por serviços externos.
- Publicação de dados privados ou exclusão em massa de cadastros antigos.

## Referências

- [Arquitetura dos módulos e sessão compartilhada](../architecture-v2.md)
- [Permissões e RLS do projeto](../security-rls.md)
- [Plano de auditoria do site](auditoria.md)
- [Banco de dados e migrações](../../database/README.md)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
