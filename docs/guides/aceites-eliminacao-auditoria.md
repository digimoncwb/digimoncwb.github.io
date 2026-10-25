# Aceites, eliminação e operação da auditoria

Implementação em 25/10/2026. As contas continuam desativadas. As migrações de `20261025060000` a `20261025090000` foram aplicadas ao projeto `vllqakohumoinpdwnsqa` após testes; não as reaplique. A migração complementar `20261025100000` distingue os acessos anônimos de rotinas autenticadas nas integrações. Elas não publicam documentos, não concedem administração, não atribuem decks antigos e não executam eliminação de contas existentes.

## Documentos e declaração de maioridade

O cadastro exige três manifestações separadas, sem seleção prévia para novos usuários: aceite dos termos, leitura do aviso e declaração de ter 18 anos ou mais. Após confirmação do e-mail, o perfil registra a manifestação autenticada no servidor. A marcação do formulário inicial não é usada como prova de aceite autenticado, nem metadados de cadastro concedem privilégios.

Em **Contas e auditoria → Configuração → Versões dos documentos publicados**, registre o tipo, a versão, a URL HTTPS e o texto integral da versão que já foi revisada e publicada. Não registre as minutas como documentos aprovados. O banco calcula SHA-256 e impede alterar ou apagar uma versão registrada. Para mudar o conteúdo, publique uma nova versão. A escolha de termos vigentes possui ação própria; o aviso vigente é selecionado na configuração existente.

O perfil registra a conta, os documentos, seus hashes, data e método `self_declaration`. A declaração não comprova a idade de forma independente. Não há coleta automática de documento de identidade ou data de nascimento. Contas de menores e autorização de responsáveis ficam fora desta versão. A aplicação das regras de proteção a participantes menores nos resultados e a visitantes exige avaliação própria.

Quando o controle estiver ativo, alterar uma versão vigente exige atualizar o aceite autenticado para continuar gravando. O administrador também precisa aceitar as versões antes da primeira ativação. Contas antigas não recebem um aceite presumido. O histórico dos próprios aceites entra no arquivo de dados da conta.

## Eliminação solicitada pelo titular

O fluxo começa por uma solicitação de **Eliminação de dados** da conta ou pelo canal de privacidade. Bloquear, encerrar e eliminar são ações distintas. Não execute o procedimento abaixo em uma conta real apenas para testar.

Um administrador diferente do titular deve validar a identidade, o escopo e a eventual necessidade de conservação. No painel de solicitações:

1. Escolha se o jogador vinculado deve ser desidentificado ou se a identificação no histórico será preservada com fundamento específico e justificativa. Um histórico público não autoriza conservação nominal indiscriminada.
2. Confirme os registros revisados e a justificativa. **Preparar eliminação** encerra a conta, remove a permissão administrativa, desidentifica o perfil, remove seus textos de solicitação e deixa os decks da comunidade sem proprietário, sob gestão administrativa. O jogador vinculado pode ter nome e identificadores removidos conforme a decisão. Os IDs e os resultados de torneios permanecem.
3. Revise arquivos do Storage pertencentes à conta. A remoção no provedor pode falhar se ainda houver objetos pertencentes a ela. A decisão de conservar, reatribuir ou remover cada arquivo precisa respeitar o pedido e a finalidade; não transfira arquivos privados automaticamente.
4. Use **Remover credenciais no provedor**. A Edge Function `erase-site-account` valida novamente a sessão e a administração, busca o alvo no procedimento preparado e remove a identidade no Supabase Auth. Não aceita um UUID de usuário arbitrário enviado pelo navegador como autorização. Se a resposta for ambígua, o procedimento pode ser retomado; o banco verifica se a identidade ainda existe.
5. Revise cópias em mensagens, fontes de importação e backups. Impeça reintrodução indevida dos dados por novas importações e documente o que precisa ser reaplicado após restauração. A exclusão do mapeamento DigiLab não impede, sozinha, que uma fonte externa volte a fornecer dados.
6. Só então confirme a revisão externa e conclua o atendimento. O backend impede marcar a solicitação como concluída se as credenciais ainda existirem ou se a revisão não tiver sido confirmada.

A preparação não pode ser desfeita pelo painel. A remoção de credenciais é definitiva. A última conta administrativa ativa continua protegida. A identidade técnica da aplicação permanece como referência pseudônima para não apagar resultados ou quebrar vínculos históricos. Portanto, não descreva a ação como eliminação de todo dado em toda cópia, nem como anonimização irreversível garantida. Valores antigos permitidos na auditoria continuam sujeitos aos 90 dias aprovados; justificativas e provas mínimas precisam de revisão de necessidade e conservação específica.

Pedidos de eliminação não precisam aguardar os 180 dias de retenção de solicitações e feedback. Essa retenção continua sendo um procedimento manual; a tabela de feedback não possui data de resolução. Registre a conclusão em controle privado e considere as dependências do procedimento de eliminação antes de remover solicitações.

## Comparação e exportação

O painel mostra campo, valor anterior e novo. Cartas aparecem como código e quantidade. Campos cujo conteúdo foi protegido aparecem apenas como indicação de alteração; a interface não tenta reconstruí-los.

**Exportar intervalo completo** usa os filtros correntes, um limite superior fixado no início e páginas de até 500 eventos por cursor. Até 100.000 eventos e 50 MB por arquivo são aceitos; acima disso, reduza o período ou refine os filtros. Cada exportação pertence ao administrador que a iniciou, expira em 15 minutos e registra início e preparação ou cancelamento. Um arquivo incompleto não é apresentado como completo. Se a retenção remover registros durante a leitura, a exportação é interrompida para ser refeita. O evento comprova a preparação dos dados pelo serviço, não que o usuário guardou o arquivo no computador.

O JSON contém versão do formato, identificador da exportação, período/filtros e eventos. A exportação da página atual continua disponível. Os dados exportados são privados e também precisam de proteção e descarte.

## Monitoramento e alertas

O painel tem diagnóstico de mecanismos de coleta ausentes, integrações com erro de servidor nas últimas 24 horas, execuções sem conclusão há mais de 30 minutos e funcionamento da rotina de retenção. A falta de eventos de negócio, isoladamente, não é tratada como falha: o site pode estar sem atividade.

A migração agenda `site-audit-monitor` a cada 15 minutos se `pg_cron` estiver disponível. As verificações ficam em esquema privado por 30 dias; metadados das integrações concluídas ou abandonadas são limpos após 90 dias. A rotina também remove sessões de exportação expiradas. O diagnóstico respeita uma janela inicial de 48 horas antes de considerar anômala a ausência de aplicação da retenção.

O workflow `.github/workflows/audit-health.yml` faz a verificação por um executor externo ao Supabase. Ele reutiliza o segredo de Actions `SUPABASE_ACCESS_TOKEN`, já exigido pela publicação das funções, e falha quando o provedor está indisponível ou o diagnóstico requer atenção. **O workflow só passa a rodar após publicação no branch padrão.** Configure as notificações de falha do GitHub Actions nas contas responsáveis e teste o canal. Não há destinatário de e-mail ou webhook de alertas explicitamente configurado por esta entrega; o painel informa essa pendência.

As funções instrumentadas registram início e resultado. Cabeçalhos de ator e operação enviados por um cliente não são considerados prova de identidade. Chamadas internas autenticadas com a credencial de serviço podem preservar a conta original e o vínculo com a operação pai. A sincronização DigiLab encaminha essa correlação às funções chamadas. Filtrar uma operação também encontra o resultado de suas chamadas filhas diretas.

Falhas ao entregar o evento geram `site_audit_delivery_failed` nos logs de execução, com fase e identificador, sem tokens nem conteúdo da requisição. Configure no provedor a observação desse sinal. Uma falha no próprio banco não pode ser detectada somente por um job dentro do banco: mantenha o executor externo e teste sua falha controlada em homologação.

## Auth e recusas diretas de API

Logs de autenticação e gateway continuam nas fontes do provedor; não foram copiados indiscriminadamente para a trilha funcional. O painel mostra disponibilidade da fonte Auth e permite registrar quem realizou uma revisão manual de Auth/API e quando. Isso não equivale a ingestão automática nem comprova que todos os fluxos foram homologados. Consulte os logs reais de cadastro, recuperação, renovação, logout e recusas diretas e registre somente referência da verificação, sem credenciais.

A retenção contratada, os filtros e o acesso a esses logs precisam ser conferidos no projeto. O painel identifica a ingestão automática de recusas da API como não configurada. Até essa integração ser definida, não prometa cobertura unificada de toda tentativa negada.

## Publicação e validação

As funções que importam `_shared/site-security.ts`, inclusive `erase-site-account`, dependem das migrações novas. O CI verifica os pré-requisitos por leitura antes da publicação e não reaplica essas migrações não idempotentes. Publique o frontend completo a partir de `npm run build:release`.

Testes locais cobrem ausência de aceite, maioridade não declarada, mudança de versão, imutabilidade dos documentos, autorização da eliminação, falha do provedor, preservação de histórico, exportação por cursor, cancelamento, diagnóstico e correlação contra falsificação. O navegador local foi verificado com dados fictícios. E-mails reais e recuperação em produção ainda aguardam o Gmail dedicado, SMTP, URLs e testes com destinatários autorizados.
