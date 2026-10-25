# Ativação de contas e auditoria

Implementação local preparada em 25/10/2026. Este roteiro não significa que as migrações já foram aplicadas ao projeto hospedado. Responsável técnico informado: **Eduardo Lopes**. Contato de contas e privacidade: **dulopes1997@gmail.com**. A identificação jurídica do controlador e as decisões legais de tratamento precisam ser validadas separadamente.

**Atualização de implantação em 25/10/2026:** as seis migrações de `20261025000000` a `20261025050000` foram aplicadas, na ordem, ao projeto `vllqakohumoinpdwnsqa`. Não as reaplique. A verificação após a aplicação confirmou `accounts_enabled=false`, aviso e retenção ainda sem configuração, e preservação dos 6 administradores, 106 decks, 121 jogadores e 220 torneios. A publicação das Edge Functions e do frontend desta entrega continua sendo uma etapa separada. Os recibos locais com os hashes dos arquivos aplicados estão em `.tmp/accounts-migration-deployment/`; o projeto ainda não tinha histórico de migrações da CLI.

## O que está implementado

Complementos de 25/10/2026: migrações `20261025060000` a `20261025090000` também aplicadas, sem ativação. A retenção foi posteriormente aprovada e configurada em 90 dias. Foram acrescentados aceites versionados e declaração de maioridade, procedimento de eliminação, exportação completa por período e diagnóstico de auditoria. Veja os detalhes e pendências no [roteiro complementar](aceites-eliminacao-auditoria.md).

- Sessão compartilhada no shell com Supabase Auth: cadastro, confirmação por e-mail, entrada, saída, recuperação, troca de senha e de e-mail. Nome de usuário único, perfil e vínculo opcional com jogador mediante análise administrativa.
- Visitantes consultam dados públicos. Membros com e-mail confirmado e perfil ativo criam e alteram os próprios decks. Administradores gerenciam cadastros globais e permissões. Autor creditado e proprietário são campos separados.
- Decks anteriores ficam sem proprietário até atribuição validada. O painel permite filtrar esses decks ou transferir qualquer deck da comunidade. Solicitações de propriedade não são aprovadas por coincidência de nomes.
- Bloqueio e encerramento suspendem gravações. A última conta administrativa ativa não pode ser bloqueada, encerrada ou removida pelo painel. Encerramento não equivale a eliminação automática de todos os dados.
- Auditoria transacional de cadastros, decks, permissões, configurações e armazenamento; registro de consultas administrativas, exportações e integrações instrumentadas. Painel com filtros, paginação e exportação JSON da página.
- Solicitações de acesso, correção, eliminação e encerramento, com resposta administrativa. Download dos dados da conta. A solicitação de eliminação exige atendimento humano e aplicação da política de conservação; o botão não promete exclusão imediata.

As senhas são enviadas ao Supabase Auth por HTTPS. A aplicação não cria tabela de senhas e não copia hashes para os registros de negócio ou de auditoria. O armazenamento e a verificação das credenciais são responsabilidade do provedor de autenticação. O navegador guarda tokens de sessão para manter a entrada; esses tokens são credenciais privadas, portanto devem ser protegidos contra scripts injetados e extensões maliciosas.

## Ordem da entrega

1. Faça backup do banco, das políticas e dos objetos relevantes; teste a restauração. Use primeiro um ambiente de homologação.
2. Aplique as migrações anteriores pendentes e depois, em ordem:
    - `20261025000000_delete_community_decks.sql`
    - `20261025010000_site_accounts_and_audit.sql`
    - `20261025020000_account_management_operations.sql`
    - `20261025030000_account_deck_saves.sql`
    - `20261025040000_account_storage_and_integration_access.sql`
    - `20261025050000_site_audit_retention_schedule.sql`
    - `20261025060000_versioned_terms_and_adult_declarations.sql`
    - `20261025070000_account_erasure_workflow.sql`
    - `20261025080000_audit_period_exports.sql`
    - `20261025090000_audit_operation_monitoring.sql`
    - `20261025100000_distinguish_anonymous_integration_actors.sql`
3. Publique as Edge Functions abaixo junto com o diretório compartilhado `_shared/site-security.ts`:
   `change-admin-password`, `digilab-deck-catalog`, `digilab-health`, `import-digilab-tournament`, `preview-digilab-import`, `sync-new-digilab-tournaments`, `verify-digilab-tournament`, `upload-card-image` e `erase-site-account`.
4. Gere e publique os artefatos completos com `npm run build:release`. Não envie apenas o bundle do shell: os módulos compartilham o contrato de autenticação.
5. Mantenha `accounts_enabled=false` enquanto conclui as etapas abaixo. Nesse piloto as gravações públicas anteriores continuam disponíveis; ele não é o estado final de segurança.

As funções de integração exigem a migração de autorização antes da publicação do código novo. Se o serviço de autorização estiver indisponível, pedidos administrativos falham com acesso fechado. As rotinas automáticas continuam usando os segredos de servidor existentes; nunca coloque `service_role` em configuração pública.

## Preparar a autenticação

No Supabase Auth:

1. Ative a confirmação de e-mail; configure SMTP de produção, remetente e modelos em português. Teste entrega real, expiração e utilização única dos links.
2. Configure Site URL e uma lista explícita de URLs de retorno para o `index.html` do site publicado e para homologação. O shell usa PKCE e retorna a `index.html#overview`.
3. Configure senha mínima de 12 caracteres no provedor, limites de tentativas, envio de e-mail e proteção contra abuso. A interface também verifica esse comprimento no cadastro e na troca.
4. Mantenha confirmação segura para alteração de e-mail. Teste recuperação, troca de e-mail, logout e sessão restaurada em outra aba.
5. Avalie MFA para administradores no provedor. A interface desta entrega não inclui cadastro de fatores MFA.

As contas administrativas antigas são preservadas. Antes de ativar, cada administrador deve migrar para um e-mail real confirmado. O domínio interno `@admin.digistats.local` deixa de ser aceito quando o controle está ativo; o fluxo antigo que transforma senhas em endereços internos fica desabilitado.

Prefira atualizar o e-mail da conta existente no provedor após verificar sua titularidade: o mesmo UUID mantém permissões e histórico. Para uma conta nova, um administrador existente concede o papel pelo painel depois de confirmar a identidade. Se não houver nenhuma sessão utilizável, um operador autorizado do banco pode inserir o UUID confirmado na allowlist existente, com justificativa registrada. Não associe contas automaticamente pelo nome e não crie senhas no SQL.

## Preparar a privacidade e ativar

Publique um aviso de privacidade real em HTTPS, com identificação do controlador, contato, finalidades, bases legais adequadas, dados públicos e privados, operadores, transferências internacionais, prazos, direitos e procedimentos. Defina também regras para menores quando aplicáveis, atendimento e resposta a incidentes. A confirmação de leitura do aviso não substitui a escolha da base legal.

Em **Minha conta → Contas e auditoria → Configuração**:

1. Informe a URL HTTPS e a versão do aviso publicado.
2. Defina o prazo de auditoria e sua justificativa. O banco aceita 30 a 3650 dias como limite técnico, sem recomendar legalmente um desses prazos. Avalie separadamente retenção de logs do provedor, solicitações, backups e outros registros.
3. Salve a configuração e atualize o próprio perfil, registrando a leitura da versão publicada.
4. Com uma conta administrativa de e-mail real confirmado, ative o controle de contas. O banco valida as condições técnicas e fecha as gravações anônimas, inclusive para clientes antigos.
5. Valide visitante, membro A, membro B, administrador e conta bloqueada. Teste criação, salvamento concorrente, cópia, exclusão, transferência, cadastros globais, armazenamento e integrações.

Uma alteração posterior da versão do aviso exige nova leitura antes de gravar, inclusive para administradores. Os usuários continuam podendo entrar e atualizar o reconhecimento no perfil.

## Auditoria e operação

As alterações de negócio e seus eventos são gravados na mesma transação. Se o evento falhar, a alteração também falha. O aplicativo não pode atualizar ou apagar os eventos diretamente. Administradores consultam por RPC; consultas e exportações também geram eventos. Campos privados não autorizados aparecem somente como indicação de mudança, sem copiar seu conteúdo. Não inclua credenciais ou dados sensíveis em nomes de decks, motivos ou outros campos livres.

As integrações validam o token antes de atribuir um responsável; ignoram cabeçalhos de identidade enviados pelo cliente. As gravações do servidor recebem um identificador de operação, também devolvido na resposta. As chamadas internas de outra Edge Function têm seu próprio identificador; acompanhe também os identificadores de execução DigiLab. O cache público de imagens de cartas continua automático e só usa os provedores fixos; uma chamada sem identidade não comprova que uma pessoa específica a realizou.

Recusas e falhas das integrações instrumentadas geram eventos separados. Se a entrega desse evento falhar, a função registra `site_audit_delivery_failed` nos logs do provedor com o identificador da operação. Configure alerta para esse evento. Tentativas de login, recuperação e recusas diretas pelo REST devem ser acompanhadas nos logs de Auth/API do provedor: uma transação recusada não pode preservar seu próprio evento SQL. Não trate o painel como cobertura de toda tentativa de acesso.

Quando `pg_cron` já está instalado, a migração agenda `site-audit-retention` diariamente às 04:20 no fuso do agendador. O job só chama a limpeza depois da configuração do prazo. Verifique execução e alertas:

```sql
select jobid, jobname, schedule, active from cron.job
where jobname='site-audit-retention';
select jobid, status, start_time, end_time, return_message
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname='site-audit-retention')
order by start_time desc limit 10;
```

Sem `pg_cron`, configure um agendador de servidor para chamar `public.purge_site_audit()` diariamente com papel de manutenção. Essa função não é acessível aos usuários normais nem aos administradores do aplicativo. A limpeza registra corte temporal e quantidade removida; não recopia os eventos eliminados.

O operador do banco ainda tem poder sobre o banco. Para evidência independente, configure exportação periódica para armazenamento externo com acesso separado, retenção e imutabilidade apropriadas, e teste a recuperação. Esta entrega não cria esse serviço externo, não garante resistência contra um operador com privilégios totais e não certifica conformidade com a LGPD.

## Recuperação e validação

Depois da ativação, o painel não permite reabrir gravações anônimas. Em falha de implantação, preserve as restrições do banco, mantenha consultas públicas e corrija o componente afetado. Não volte `accounts_enabled` para falso como estratégia de rollback.

Comandos de validação local:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd audit
```

Os testes SQL usam PostgreSQL local via PGlite e verificam políticas antigas permissivas, proprietários distintos, clientes anônimos, contas bloqueadas, última administração, solicitações, armazenamento, integração e identidade da auditoria. Os testes de serviço verificam uso de JWT, logout e recuperação; as funções de integração têm testes contra falsificação de ator. Ainda é necessário homologar o serviço Supabase hospedado, o envio de e-mails, os redirects, o armazenamento real, os jobs e o funcionamento após publicação.
