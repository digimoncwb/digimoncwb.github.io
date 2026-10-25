# Reconciliação do catálogo DigiLab

A migração `20261025130000_reconcile_digilab_catalog_names.sql` corrige conflitos
`decks_name_key` na aplicação de snapshots. A identidade de um arquétipo segue seu
ID externo e seu UUID local; nomes e slugs podem mudar sem transferir resultados
históricos para outro arquétipo.

A função reserva os vínculos existentes antes de procurar cadastros legados sem
ID externo. Libera nomes e slugs que serão trocados dentro da mesma transação,
permitindo trocas e ciclos. Se um cadastro que sai do catálogo ocupa um nome
canônico, ele permanece com o mesmo UUID, fica inativo e recebe o sufixo
`[histórico UUID]`. Seus resultados e decklists continuam vinculados ao mesmo
registro. Slugs antigos que entram em conflito são desambiguados também no
catálogo e nos aliases.

A rotina não remove decks nem transfere referências. Um ID externo novo que
reutiliza um nome ou slug antigo recebe uma identidade própria. Falhas na
validação desfazem a transação inteira; a permissão de execução continua restrita
à conta de serviço.

Os testes em `tests/digilab-catalog-automation.test.js` reproduzem o conflito na
função anterior e cobrem trocas de nomes/slugs, colisões com registros históricos,
reutilização por um ID externo novo, idempotência, permissões e rollback.

## Verificação em 25/10/2026

A função corrigida foi aplicada no Supabase. Uma sincronização real retornou
HTTP 200: 283 arquétipos, 1 criado, 282 atualizados e 1 arquivado. A conferência
antes/depois confirmou a preservação dos UUIDs existentes, dos vínculos externos
e das referências em resultados de torneios e decklists.

O audit health preserva as falhas na contagem das últimas 24 horas. A migração
`20261025170000_audit_catalog_recovery_health.sql` distingue falhas pendentes e
recuperadas: uma execução agendada completa do catálogo com HTTP 2xx, iniciada
após a conclusão da falha, comprova a recuperação dessa rotina global. Execuções
de outra integração, de outro usuário ou iniciadas antes da falha não comprovam
recuperação. As demais integrações mantêm o alerta até análise própria.

O diagnóstico usa as falhas sem recuperação confirmada para definir o alerta.
Falhas de coleta, execuções paradas e problemas de retenção continuam alterando
o estado. O histórico de integrações e verificações não é apagado. Após a
aplicação, o banco informou `ok`, 2 falhas históricas recuperadas e 0 pendentes.
