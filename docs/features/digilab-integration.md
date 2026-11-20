# Integração com o DigiLab

## Catálogo alinhado ao DigiLab em 05/10/2026

### Imagens armazenadas no Supabase

A sincronização copia a carta representativa do DigiLab para `deck-images/digilab/` antes de aplicar o catálogo. As URLs públicas desse storage são usadas em decks e posts, com CORS permitido para exportar PNG. Arquivos existentes são reutilizados; cartas ausentes no DigiLab usam a mesma carta do storage anterior ou das fontes de imagem já utilizadas pelo sistema. JPEG, WebP e PNG mantêm seu formato real. Uma falha de download ou upload impede a aplicação do catálogo, preservando os dados anteriores.

`20261005050000_store_digilab_catalog_images.sql` rejeita URLs externas no catálogo. O histórico da sincronização registra imagens enviadas e reutilizadas em `summary.images`. A correção foi aplicada no Supabase e conferida: todas as 295 URLs de `deck_images` usam storage, incluindo os cadastros históricos. O script manual `sync-digilab-catalog.mjs --apply` foi bloqueado; novas sincronizações devem usar a função `digilab-deck-catalog`, inclusive pelo script `sync-digilab-deck-colors.mjs`.

A consulta autenticada de `/api/meta?format=all&group_by=archetype` retornou 282 arquétipos e 29 famílias. A sincronização local atualizou 163 decks mantendo seus IDs, criou 119 e preservou 17 cadastros históricos como inativos, sem alterar resultados ou decklists. Nomes, slug, cores, família e carta representativa dos 282 decks ativos foram conferidos contra o catálogo atual. Imagens usam a carta representativa publicada pelo DigiLab. Glowing Dawn passou de `y,g,b,p` para `g,b`, com ST23-09.

O backup completo está em `backup/decks/digilab-catalog-2026-10-05T18-56-46-563Z.json`; o resumo da operação está em `backup/decks/digilab-catalog-latest-report.json`. Credenciais não são incluídas nesses arquivos.

### Correção histórica do EX12 em 05/10/2026

A auditoria comparou os 206 torneios de Curitiba retornados pela API com seus vínculos locais. Foram corrigidos 62 formatos: 61 eventos de outros períodos estavam classificados como EX12 e um estava em BT24. Nos 31 torneios realmente EX12, 12 resultados tiveram seu `deck_id` atualizado para o arquétipo informado nos standings atuais. Os IDs dos torneios e resultados, jogadores e listas foram preservados; backups da alteração estão em `backup/tournaments/`.

A conferência final reproduziu os 63 decks e 241 participações do DigiLab, com Glowing Dawn em primeiro (27 participações, 11,2%). Todas as contagens por arquétipo coincidiram. `20261005040000_require_digilab_tournament_format.sql` exige o código oficial na importação; a prévia também deixa de escolher o formato padrão quando o código está ausente. Esses casos exigem revisão em vez de misturar períodos.

`audit_tournaments` é uma ação de consulta protegida de `digilab-deck-catalog`, usada pelos scripts `reconcile-digilab-tournament-formats.mjs` e `reconcile-digilab-ex12-results.mjs`. Eles conferem data, IDs, correspondências e completude antes de aplicar alterações com `--apply`. O primeiro consulta os formatos oficiais de todos os torneios vinculados; o segundo compara jogadores/decks dos standings EX12. A consulta não altera o banco.

### Rotina automática

A Edge Function `digilab-deck-catalog` busca todas as páginas da API e aplica decks, famílias, imagens, vínculos e formatos em uma única transação. O DigiLab determina nomes, cores e carta representativa; arquétipos novos são cadastrados e os que saem do catálogo são inativados, preservando os resultados e listas anteriores. IDs externos estáveis permitem renomear decks sem trocar o ID local.

O catálogo é atualizado às **00h45, 06h45, 12h45 e 18h45**, no horário de Brasília. A sincronização de torneios executa **a cada hora, no minuto zero**, com `0 * * * *`. Os jobs `digilab-catalog-sync` e `digilab-background-sync` usam UTC no `pg_cron`. Nenhum navegador precisa permanecer aberto.

Formatos novos recebem o código e nome publicados pelo DigiLab. Os existentes mantêm ID, ativação, formato padrão e imagem de fundo. Datas de lançamento são usadas quando fornecidas; o retorno atual de `/api/meta` não inclui essas datas, então as datas locais existentes são preservadas. Em 05/10/2026 foram conferidos 282 arquétipos e 14 formatos externos; um formato novo foi cadastrado e 13 existentes foram atualizados.

`digilab_catalog_sync_runs` registra início, conclusão, contagens e falhas. Paginação incompleta, códigos inválidos ou uma queda maior que 20% no tamanho do catálogo cancelam a aplicação. Usuários públicos e autenticados podem consultar o registro de decks; a escrita cabe ao serviço de sincronização. O Admin permite consultar o catálogo e solicitar uma atualização completa, sem mapeamento ou criação manual de arquétipos.

O menu **Deckbuilder** substitui o catálogo e o cadastro manual de decks: escolha um torneio existente, selecione um resultado e abra sua lista para criar ou editar. O Metagame usa bolinhas na ordem do DigiLab: cor primária primeiro, cor secundária depois, quando existir. Dados antigos sem cor primária utilizam a ordem salva em `colors`. O retrato circular usa o mesmo zoom do restante do sistema. O modal reúne indicadores, evolução mensal e resultados/listas em tabelas compactas. As barras do gráfico e da tabela usam a cor primária; preto recebe um grafite mais claro (`#73777f`) para contraste no tema escuro. As participações são normalizadas pelo deck mais utilizado, que ocupa 100% da largura.

As migrations `20261005010000_automate_digilab_catalog.sql`, `20261005020000_schedule_digilab_catalog.sql` e `20261005030000_digilab_tournaments_every_six_hours.sql` instalam a rotina, permissões e horários. A migration `20261006010000_digilab_tournaments_hourly.sql` restaura o intervalo de uma hora em 06/10/2026. O workflow de CI aplica essas migrations e publica a função. Para executar ou verificar manualmente, com `SUPABASE_DB_URL` no `.env`:

```powershell
npm.cmd install --prefix .tmp/digilab-tools --no-save --no-package-lock pg
node scripts/deploy-digilab-catalog-automation.mjs sync
node scripts/deploy-digilab-catalog-automation.mjs verify
```

## Objetivo e estado atual

O DigiStats exporta standings para publicação manual no DigiLab e usa a API oficial para confirmar posteriormente que o torneio publicado corresponde ao registro local.

Estado em 05/10/2026:

- Exportação manual de standings implementada no frontend.
- Secret `DIGILAB_API_KEY` configurado nos secrets das Edge Functions.
- Conectividade e validade da chave confirmadas pela função `digilab-health`.
- Migration de persistência executada no projeto remoto em 31/07/2026.
- `DIGILAB_VERIFY_TOKEN` configurado e função `verify-digilab-tournaments` publicada no Supabase em 31/07/2026.
- Teste real concluído: torneio DigiStats `104` associado ao DigiLab `7018` com status `matched`, uma requisição externa e um candidato comparado.
- Prévia individual por URL ou ID disponível no modal público **Novo torneio**.
- Aba DigiLab posicionada primeiro e selecionada por padrão no Admin.
- Criação manual e automática de jogadores inequivocamente novos antes da importação do torneio.
- Fila em background executada a cada hora pelo `pg_cron`, sem depender de navegador aberto.

O plano detalhado e os critérios de correspondência estão em [`proposta_sincronizacao_digistats_digilab.md`](../../proposta_sincronizacao_digistats_digilab.md).

## Contrato externo utilizado

- Documentação: <https://digilab.cards/docs>.
- Base URL: `https://api.digilab.cards`.
- Autenticação: `X-API-Key: <DIGILAB_API_KEY>`.
- Descoberta: `GET /api/tournaments`.
- Detalhe: `GET /api/tournament/{id}`.
- API somente leitura e sem versão fixa.
- Limites documentados: 60 requisições/minuto por IP e 300 por chave.
- Respostas `429` devem respeitar `Retry-After`.
- Listagens podem permanecer em cache por aproximadamente 15 minutos.

## Secret de produção

No Dashboard do Supabase, acessar **Edge Functions → Secrets** e cadastrar:

```text
DIGILAB_API_KEY=<chave emitida pelo DigiLab>
```

O secret é lido apenas no backend:

```ts
const apiKey = Deno.env.get('DIGILAB_API_KEY');
```

Regras:

- Não colocar a chave em `config/`, frontend, banco, logs ou respostas HTTP.
- Não versionar arquivos `.env`.
- Não usar nomes iniciados por `SUPABASE_`, prefixo reservado pela plataforma.
- A chave fica disponível para as Edge Functions logo após ser salva.

Para desenvolvimento local, usar um arquivo ignorado pelo Git, como `supabase/functions/.env`:

```env
DIGILAB_API_KEY=dl_k_exemplo
```

## Acesso ao Admin

A migration [`20260731010000_create_admin_users.sql`](../../database/migrations/20260731010000_create_admin_users.sql) cria a allowlist `public.admin_users`. A tela guarda a sessão apenas em `sessionStorage`; nenhuma senha ou refresh token é persistido no código do projeto.

O login pede somente a senha. Para o Supabase Auth identificar a conta sem um campo de usuário, o prefixo do e-mail técnico deve ser igual à senha em minúsculas.

| Pessoa          | E-mail técnico                   | Senha inicial |
| --------------- | -------------------------------- | ------------- |
| Marcio Braga    | `braga@admin.digistats.local`    | `braga`       |
| Lukas Fujisawa  | `fujisawa@admin.digistats.local` | `fujisawa`    |
| Matheus Fonseca | `fonseca@admin.digistats.local`  | `fonseca`     |
| Carlos Fortes   | `fortes@admin.digistats.local`   | `fortes`      |
| Eduardo Lopes   | `lopes@admin.digistats.local`    | `lopes`       |
| Oliveira        | `oliveira@admin.digistats.local` | `oliveira`    |

As senhas não são criadas pela migration nem armazenadas em SQL. Criar os seis usuários em **Authentication → Users → Add user**, marcar o e-mail como confirmado e então executar o bloco de associação fornecido junto da migration. E-mails técnicos não recebem recuperação de senha; redefinições são feitas pelo Dashboard.

O Admin mantém o login com um único campo. Credenciais antigas continuam usando o e-mail técnico derivado do sobrenome. Depois da primeira troca pelo botão **Trocar senha**, a Edge Function `change-admin-password` confirma a senha atual e altera senha e e-mail técnico em conjunto. O novo e-mail usa somente um hash SHA-256 da senha, permitindo qualquer combinação entre 3 e 72 caracteres sem expor seu conteúdo no endereço interno. Após a troca, todas as sessões locais são encerradas e o administrador entra novamente com a nova senha.

## Edge Function `digilab-health`

O código versionado está em [`supabase/functions/digilab-health/index.ts`](../../supabase/functions/digilab-health/index.ts).

A função faz uma única chamada:

```http
GET https://api.digilab.cards/api/tournaments?per_page=1
X-API-Key: <secret>
```

Ela não devolve a chave nem o payload de torneios. A resposta de sucesso contém apenas indicadores sanitizados:

```json
{
    "ok": true,
    "configured": true,
    "digilab_status": 200,
    "returned_items": 1,
    "pagination_received": true
}
```

Interpretação:

| Resultado                  | Significado                                                |
| -------------------------- | ---------------------------------------------------------- |
| `configured: false`        | Secret ausente ou salvo com outro nome                     |
| `digilab_status: 401`      | Header de autenticação não foi enviado corretamente        |
| `digilab_status: 403`      | Chave inválida, revogada ou inativa                        |
| `digilab_status: 429`      | Limite temporário atingido; observar `retry_after`         |
| `502` sem `digilab_status` | Falha de rede ou indisponibilidade antes de obter resposta |

### Uso operacional e segurança

- Manter a verificação JWT padrão do Supabase habilitada na implantação.
- Não chamar a função automaticamente no carregamento do frontend.
- Usar somente para diagnóstico manual pelo Dashboard do Supabase ou por operador autorizado.
- Cada teste consome uma requisição da cota do DigiLab.
- A função aceita `GET` e `POST`; outros métodos retornam `405`.
- No teste manual do Dashboard, enviar também `x-digilab-verify-token`. Pela aba Admin, o JWT do usuário substitui esse header.

## Ordem de implantação do Admin

1. Criar e confirmar os seis usuários técnicos em **Authentication → Users**.
2. Executar `20260731010000_create_admin_users.sql` no SQL Editor.
3. Republicar `digilab-health`, `preview-digilab-import` e `verify-digilab-tournaments` com o código versionado.
4. Publicar o frontend com a nova aba Admin.
5. Entrar com uma senha provisória, abrir **DigiLab** e executar **Testar conexão**.

## Exportação manual

O módulo [`config/digilab-export.js`](../../config/digilab-export.js) transforma os resultados locais no texto aceito pelo fluxo manual:

```text
1 PlayerName 0012345678 9
2 PlayerName 0012345678 7
```

O nome usa `players.digilab_name`, com fallback para `players.name`. A ausência de Bandai ID gera aviso, mas não impede a cópia.

## Persistência da associação

A migration [`20260731000000_create_tournament_digilab_sync.sql`](../../database/migrations/20260731000000_create_tournament_digilab_sync.sql) cria `public.tournament_digilab_sync`.

Uma linha passa a existir somente após a primeira tentativa de verificação. A ausência de linha significa `not_checked`.

Estados persistidos:

- `matched`: vínculo confirmado e identificador externo salvo.
- `not_found`: nenhum candidato encontrado.
- `ambiguous`: mais de um candidato possível.
- `mismatch`: candidato encontrado com divergências.
- `api_error`: falha de autenticação, limite ou disponibilidade.

Somente `service_role`, usado pelas Edge Functions de integração, pode escrever. Clientes `anon` e `authenticated` podem ler apenas ID local, ID/URL DigiLab, status e datas de verificação. `comparison_summary` e `last_error_code` não são concedidos ao frontend.

## Edge Function `verify-digilab-tournaments`

O código está em [`supabase/functions/verify-digilab-tournament/index.ts`](../../supabase/functions/verify-digilab-tournament/index.ts).

### Autorização

As funções administrativas aceitam um JWT de usuário autenticado cuja identidade esteja na allowlist `public.admin_users`. A aba **Admin → DigiLab** usa esse caminho e nunca recebe os secrets da integração. A prévia pública aceita apenas a consulta individual por ID; inventário e operações de escrita continuam protegidos.

Para testes manuais no Dashboard, continua disponível o segundo secret operacional:

```text
DIGILAB_VERIFY_TOKEN=<valor aleatório longo e exclusivo>
```

O token deve ser enviado no header `x-digilab-verify-token` somente em testes manuais pelo Dashboard. Ele não pode ser colocado no frontend. A verificação JWT padrão da Edge Function também deve permanecer habilitada.

O header operacional deve permanecer restrito a testes no Supabase. Em produção, operadores usam sua sessão individual.

### Entrada

Descoberta automática pelo torneio local:

```json
{
    "tournament_id": 123
}
```

Comparação direta quando o ID externo já é conhecido:

```json
{
    "tournament_id": 123,
    "digilab_tournament_id": 7018
}
```

`tournament_id` é sempre o ID local do DigiStats. `digilab_tournament_id` é o ID global do DigiLab; os valores não precisam e normalmente não irão coincidir.

### Proteções e limites

- Cooldown de 15 minutos por torneio após cada tentativa.
- Torneios já associados retornam o vínculo salvo sem consultar a API novamente.
- Descoberta limitada à scene `curitiba`, com uma busca por loja e, somente se necessário, uma busca de fallback sem loja.
- Quando `digilab_tournament_id` é informado, a listagem é ignorada e somente um detalhe é consultado.
- No máximo 10 consultas de detalhe por execução.
- Máximo normal de 12 requisições DigiLab por execução.
- Nenhum polling ou retry automático.
- `429` interrompe a execução e repassa `Retry-After`.
- O cooldown interno é ignorado somente em uma confirmação manual autenticada (`force_match`); a função ainda refaz a consulta de detalhe antes de salvar.

### Correspondência inicial

A primeira versão é conservadora e exige igualdade de:

- data;
- quantidade de jogadores;
- loja após normalização de caixa, acentos, espaços e pontuação;
- código de formato apenas como informação, sem bloquear o vínculo;
- quantidade de standings;
- nome e colocação de todos os jogadores;
- ausência de DNF no DigiLab.
- scene DigiLab igual a `curitiba`.

Se houver diferenças nos campos obrigatórios, o status será `mismatch`. Jogadores `Anonymous` também impedem a associação automática. Os nomes das lojas foram padronizados manualmente entre os dois sistemas em 31/07/2026; não há necessidade imediata de uma tabela de aliases de loja.

Quando o DigiLab devolve colocações repetidas por empate completo, a comparação por posição deixa de ser válida. Nesse caso excepcional, a função compara o conjunto completo de jogadores e registra `tied_placements` como aviso; o modelo local continua armazenando posições sequenciais e únicas.

Um administrador pode resolver um `mismatch` pela aba DigiLab usando **Confirmar vínculo após revisão**. A requisição envia `force_match: true` junto dos dois IDs, consulta novamente o detalhe externo e salva o vínculo como `matched`. O `comparison_summary` preserva `source = admin_manual_override`, `manual_override = true` e `accepted_mismatches` para auditoria.

### Implantação e teste

1. Adicionar `DIGILAB_VERIFY_TOKEN` em **Edge Functions → Secrets**.
2. Criar ou publicar a função `verify-digilab-tournaments` mantendo a verificação JWT habilitada.
3. No teste do Dashboard, usar `POST`, enviar o header `x-digilab-verify-token` e o body com o ID local.
4. Confirmar a resposta e a linha criada em `tournament_digilab_sync`.

## Validações operacionais contínuas

1. Acompanhar casos `not_found`, `mismatch` e `ambiguous` de forma controlada.
2. Revisar nomes de loja e formatos sempre que o DigiLab introduzir novas variações.
3. Conferir periodicamente a fila `digilab_background_imports` e o histórico do job `digilab-background-sync`.
4. Manter os mapeamentos de decks atualizados para reduzir itens em revisão.
5. Confirmar após cada release que prévia pública, importação autenticada e execução agendada continuam funcionando.

## Edge Function `preview-digilab-import`

O código está em [`supabase/functions/preview-digilab-import/index.ts`](../../supabase/functions/preview-digilab-import/index.ts). A consulta de inventário exige uma sessão de admin autorizada ou o header operacional de testes. A consulta de um único torneio por `digilab_tournament_id` também aceita a chave pública do aplicativo, permitindo preencher o modal **Novo torneio** a partir de uma URL DigiLab sem exigir acesso ao Admin. Ao encontrar nesse detalhe um meta ainda inexistente no DigiStats, a função cria somente o registro correspondente em `formats`, com nome e código iguais aos recebidos, ativo, sem imagem de fundo e sem alterar o meta padrão.

Sem um ID externo, ela lista uma página do inventário da scene Curitiba:

```json
{
    "page": 1,
    "per_page": 100
}
```

Cada item contém ID DigiLab, data, quantidade de jogadores, loja, formato, vínculo existente e candidatos locais da mesma data. A classificação usa quantidade de jogadores, loja e formato para resolver dias com mais de um evento.

Com um ID, ela busca uma prévia detalhada sem escrever no banco:

```json
{
    "digilab_tournament_id": 7018
}
```

A prévia valida a scene, retorna standings/DNFs sanitizados, informa candidatos locais e marca impedimentos conhecidos, como jogador anônimo ou DNF. Cada modo realiza somente uma requisição ao DigiLab e respeita `Retry-After` sem retry automático. Diferença de formato é informativa e não bloqueia vínculo ou importação.

### Aba Admin → DigiLab

A aba administrativa oferece:

- teste manual do health;
- inventário paginado da scene Curitiba;
- totais por situação de mapeamento;
- consulta direta por ID DigiLab;
- execução manual imediata da mesma rotina agendada pelo botão **Executar automação agora**;
- detalhe sanitizado, standings e pontuação derivada;
- confirmação do vínculo quando existe exatamente um candidato local compatível.
- vínculo automático e sequencial dos candidatos exatos, com intervalo de 1,3 segundo entre chamadas;
- explicação dos motivos de `Revisar validação` e confirmação administrativa auditável do vínculo;
- distinção entre vínculo confirmado, dados ainda não revisados e dados já sincronizados;
- auditoria dos decks ao abrir os detalhes, mostrando decks ausentes ou divergentes no DigiStats antes da sincronização;
- cadastro automático de jogadores inequivocamente novos e criação do torneio em sequência quando loja, formato e decks estão resolvidos e não existe candidato local conflitante;
- de-para persistente por `player.slug`, com seleção manual apenas para nomes não resolvidos.
- de-para persistente por `deck.slug`, preenchendo `tournament_results.deck_id` e permitindo seleção manual quando o nome do arquétipo divergir.

Entrar na aba e trocar de página apenas carregam dados. O botão **Atualizar inventário** executa os vínculos exatos e as importações resolvidas sob demanda. **Sincronizar dados pendentes** percorre os itens da página, enquanto **Executar automação agora** chama o worker agendado e antecipa a nova tentativa dos itens em revisão. O processamento manual é sequencial e não faz polling. O cooldown local pula apenas o candidato afetado e permite processar os demais; um `429` real do DigiLab interrompe a sequência e respeita `Retry-After`.

### Importação em background

A Edge Function `sync-new-digilab-tournaments` é chamada a cada hora, no minuto zero, por `pg_cron`, sem depender de navegador ou sessão administrativa. Cada ciclo consulta a primeira página da scene Curitiba e uma página histórica, retomada pelo cursor persistido em `digilab_sync_state.next_page`. Ao chegar ao fim, o cursor volta à página 2. A descoberta coloca torneios novos na fila; torneios vinculados dos últimos 30 dias também entram para revisão a cada seis horas. São processados até oito itens por ciclo, com orçamento de 60 segundos para iniciar novas operações e intervalos de 1,3 segundo entre consultas ao DigiLab.

Somente torneios com loja resolvida e sem candidato local conflitante são importados automaticamente. Jogadores, decks e formatos ausentes são criados pela RPC `sync_digilab_tournament_atomic`, na mesma transação dos resultados e dos mapeamentos. Decks novos não recebem Deck Code. Qualquer erro desfaz os cadastros dessa tentativa. Nomes ambíguos, jogadores locais ausentes no DigiLab e colocações incompletas (buracos sem empate) exigem revisão. Empates informados pelo DigiLab (por exemplo 1º, 1º, 3º), em qualquer posição, são aceitos: os empatados recebem posições únicas na ordem listada pelo DigiLab, ou na ordem do evento local quando é um evento da comunidade, e `tournament_results.reported_placement` guarda a posição compartilhada para os posts, que mostram os dois como 1º. Editar a posição manualmente limpa esse valor. Itens `needs_review` voltam a ser avaliados depois de seis horas; erros transitórios usam `retry` com espera progressiva de 30 minutos até seis horas, respeitando também `Retry-After`. O job mantém os segredos existentes no Vault e nas Edge Functions.

A RPC confirma o vínculo e os resultados na mesma transação antes de retornar sucesso. Torneios vinculados recebem correções de posição, deck, pontos, formato e total de participantes, preservando os IDs dos resultados, as decklists e o nome local do evento. Valores de deck ou pontos ausentes no DigiLab não apagam os valores locais. A exclusão manual de um torneio remove por cascata o vínculo, os arquivos OCR, a entrada correspondente da fila e os demais registros dependentes; os objetos do Storage são apagados em seguida pelo cliente. Se o torneio continuar publicado no DigiLab, poderá ser importado novamente em um ciclo posterior.

`start_digilab_sync_run` reserva a execução por cinco minutos e recusa uma segunda execução simultânea. `claim_digilab_sync_item` reserva cada item atomicamente com `FOR UPDATE SKIP LOCKED`; a conclusão exige o identificador da execução proprietária. Reservas expiradas são recuperadas automaticamente. A importação manual e a agendada compartilham a transação de cadastro, que serializa as escritas para evitar duplicações por nomes equivalentes.

Em **Admin → DigiLab → Histórico da sincronização**, são exibidas as últimas 20 execuções, 80 resultados e até 100 pendências, com horários, contagens de importações, atualizações e cadastros, além do motivo de cada falha. **Atualizar histórico** consulta somente o banco. **Tentar novamente** antecipa e processa apenas o torneio escolhido, respeitando a reserva de execução. As tabelas `digilab_sync_runs` e `digilab_sync_events` mantêm o histórico completo; o acesso ocorre pela função autenticada como administrador.

No desktop, a barra lateral calcula a contagem regressiva até o início da próxima hora. Durante os primeiros segundos do ciclo ela mostra **Atualizando** e, após 35 segundos, recarrega a lista local de torneios. Se o usuário estiver em outra seção, a atualização fica marcada e ocorre ao retornar para **Torneios**. O contador informa o horário do job; o cache externo ainda pode adiar a descoberta para o ciclo seguinte.

O botão **Sincronizar dados pendentes** processa em lote os torneios vinculados e novos da página atual usando a mesma RPC transacional. O painel mostra progresso, permite interromper após o item atual e deixa torneios incompletos marcados para revisão. As chamadas são sequenciais, com intervalo de 1,3 segundo.

Quando a prévia encontra nomes DigiLab sem jogador local, os detalhes exibem a lista em **Jogadores ainda não cadastrados**. O botão **Cadastrar jogadores** continua disponível como ação explícita; na importação e no sincronismo, os cadastros automáticos fazem parte da transação do torneio. Cada jogador novo recebe o mesmo valor em `name`, `bandai_nick` e `digilab_name`, com `bandai_id = NULL`. Correspondências por nome normalizado são reutilizadas; casos anônimos, sem slug, ambíguos ou que apontem duas posições para a mesma pessoa exigem revisão. A prévia é somente leitura, inclusive para formatos ainda inexistentes.

O botão **Detalhes** funciona como alternador: um segundo clique no mesmo torneio fecha a linha expandida.

A criação inversa exige a Edge Function `import-digilab-tournament`, cujo código está em [`supabase/functions/import-digilab-tournament/index.ts`](../../supabase/functions/import-digilab-tournament/index.ts). Ela usa `sync_digilab_tournament_atomic`, que resolve os cadastros e chama as funções existentes de gravação e mapeamento dentro da mesma transação.

O meta informado pelo DigiLab também é garantido nessa transação. Se o código ainda não existir, `formats` recebe um registro ativo com `name = code` e `is_default = false`. Um registro correspondente que esteja inativo é reativado; metas já existentes preservam as demais configurações.

### Publicação do sincronismo

O workflow `.github/workflows/ci.yml` publica as três funções na `main` após lint e testes. Antes do deploy, `scripts/deploy-digilab-schema.js` aplica exclusivamente a migration idempotente `database/migrations/20260924010000_reliable_digilab_sync.sql` pela Management API, usando o segredo `SUPABASE_ACCESS_TOKEN` existente. Esse token precisa permitir consultas de escrita ao banco e publicação de funções no projeto. Uma falha na migration impede a publicação das funções. Não é necessário fornecer a senha do banco ou alterar o agendamento e seus segredos.

O SQL também pode ser aplicado no SQL Editor antes de um deploy manual. Não execute apenas o deploy das funções desta versão sem aplicar a migration. A migration pode ser reaplicada; preserva filas, histórico e torneios existentes. Validação local: `npm test` executa os cenários SQL em PostgreSQL embutido (PGlite), incluindo rollback, repetição, correções, reserva da fila e recuperação após interrupção.

Na criação do torneio, os tipos externos são convertidos para os nomes aceitos pelo DigiStats: `locals` vira **Semanal** e `evo_cup` vira **Evo Cup**. Tipos ausentes ou ainda não reconhecidos usam **Semanal** como padrão. A migration `20260801000000_map_digilab_tournament_types.sql` faz o primeiro ajuste retroativo nos torneios vinculados. A migration `20260801010000_normalize_tournament_types.sql` amplia o backfill para qualquer registro legado com esses aliases e instala um trigger no banco, garantindo a conversão também em futuros inserts e updates, independentemente da versão do cliente ou da Edge Function.

A migration `20260731040000_add_digilab_deck_sync.sql` cria `digilab_deck_sync` e torna a importação idempotente também para resultados: chamar novamente a função para um torneio já vinculado atualiza decks e pontos pelo `player_id`, sem criar outro torneio. Na prévia de um vínculo existente, o botão **Sincronizar dados** executa esse backfill.

### Famílias e catálogo de decks

O DigiStats adota dois níveis, sem tags:

```text
Família
└── Arquétipo específico
```

`deck_families` contém famílias como `Mastemon`; `decks` continua sendo o arquétipo usado no resultado, como `Mastemon (Tribal)` ou `CS Mastemon`, e recebe `family_id`. `tournament_results.deck_id` não muda, preservando todas as referências históricas e as estatísticas atuais por arquétipo.

`digilab_deck_catalog` espelha os dados retornados por `/api/meta?format=all&group_by=archetype`, incluindo ID/slug, família, cores e carta representativa. O espelho não usa IDs DigiLab como chave das tabelas locais. `digilab_deck_sync` mantém automaticamente o vínculo entre o ID/slug externo e `decks.id`.

A Edge Function `digilab-deck-catalog` aceita três ações autenticadas:

- `list`: lê o catálogo salvo sem consumir a API DigiLab;
- `sync`: sincroniza o registro completo de decks, famílias, imagens e formatos usando a API oficial.
- `audit_tournaments`: consulta formatos e standings de Curitiba para conferir os vínculos históricos.

Na aba **Admin → DigiLab**, o card **Catálogo de decks DigiLab** mostra todos os arquétipos ativos, com filtros por busca, situação e família. O vínculo em `digilab_deck_sync` é mantido automaticamente por ID externo e slug. A migration `20260731050000_create_deck_families_and_digilab_catalog.sql` também cria `v_deck_family_stats`; decks históricos ainda não classificados permanecem como grupos próprios.

Quando um candidato local possui menos participantes que o torneio DigiLab, o Admin oferece **Adicionar ausentes**. A reconciliação exige a mesma data e loja, reutiliza o de-para revisado, adiciona resultados ausentes e atualiza posição, deck e pontos dos participantes presentes no DigiLab. Resultados locais excedentes não são excluídos automaticamente. A operação é transacional pela migration `20260731060000_reconcile_digilab_tournament_results.sql` e registra sua origem em `tournament_digilab_sync.comparison_summary`.

### Pontuação retroativa

O endpoint de detalhe retorna o recorde agregado de cada jogador (`wins`, `losses`, `ties`), mas não uma lista documentada de rodadas. Como o DigiStats usa 3 pontos por vitória e 1 por empate, a prévia calcula:

```text
match_points = wins × 3 + ties
```

O valor é devolvido com `match_points_source = derived_3_win_1_tie`. Na importação definitiva, ele poderá preencher `tournament_results.match_points`; se o recorde estiver ausente ou inválido, o campo permanece `NULL`.

Isso recupera a pontuação acumulada, não o histórico de cada rodada. Um histórico por rodada exigiria um novo modelo local e um endpoint oficial que exponha partidas individuais.

### Identidade dos jogadores

A API pública não retorna Bandai Member Number. O detalhe expõe `player.name` e `player.slug`; portanto, o fluxo inverso não pode fazer match por `players.bandai_id`.

Ordem recomendada:

1. Mapeamento persistido de `digilab_player_slug` para `players.id`.
2. Fallback exato por `players.digilab_name` normalizado, somente quando houver um único resultado.
3. Revisão manual em caso de ausência, duplicidade, mudança de nome ou jogador `Anonymous`.

O Bandai ID continua prioritário nos fluxos originados por OCR/TCG+, onde o dado está presente.

### Inventário real de Curitiba — página 1

Teste realizado em 31/07/2026 com 100 dos 163 torneios retornados:

- 1 já vinculado: DigiLab `7018` → DigiStats `104`.
- 58 candidatos locais exatos por data, jogadores, loja e formato.
- 33 candidatos que divergiam apenas por nome de loja no momento do teste:
    - `Taverna Game House` → `Taverna` em 23 casos.
    - `Rei das Cartinhas` → `Rei das Cartinhas (Celta)` em 10 casos.
- Os nomes dessas lojas foram ajustados manualmente nos dois sistemas após o teste.
- DigiLab `6032` diverge do candidato local no formato (`BT23` × `BT24`), diferença agora considerada apenas informativa.
- DigiLab `6107` diverge do candidato local na quantidade de jogadores (17 × 14).
- Em 27/06/2026 há dois torneios DigiLab: `6306` (Meruru, 5 jogadores, EX09) e `5920` (Rei das Cartinhas, 4 jogadores, BT25). Apenas `5920` possui candidato local; `6306` deve ser tratado como nova importação.
- Outros cinco torneios da página não possuem candidato local.

O classificador foi ajustado para que um registro apenas na mesma data, mas com score zero nos demais campos, permaneça `new_import`.
