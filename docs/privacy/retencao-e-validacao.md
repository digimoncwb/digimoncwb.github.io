# Proposta de retenção e validação de privacidade

Data da preparação: 25/10/2026. Responsável técnico: Eduardo Lopes. Comunidade informada: Digimon CWB. **O usuário aprovou 90 dias para auditoria e 180 dias após conclusão de solicitações e feedback. Os 90 dias e a justificativa foram salvos no banco em 25/10/2026, mantendo `accounts_enabled=false`; o prazo de 180 dias requer execução manual. Os demais critérios desta tabela continuam como propostas.** O aviso completo ainda é minuta; URL e versão do banco permanecem sem preenchimento.

## Proposta para decisão

| Conjunto                       | Prazo ou critério proposto                                                                                         | Execução existente                                                                 | Pendência                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Eventos em `site_audit.events` | 90 dias desde o evento                                                                                             | Função de limpeza e agendamento diário instalados; prazo de 90 dias salvo no banco | Prazo e justificativa salvos; testar uma execução e acompanhar erros                                                         |
| Conta ativa                    | Enquanto necessária à relação de uso, com revisão de contas sem uso                                                | Bloqueio, encerramento e solicitações implementados                                | Definir revisão de inatividade sem coletar novos dados desnecessários                                                        |
| Conta encerrada                | Triagem para eliminação/anonimização em até 30 dias como meta operacional, respeitados os direitos e prazos legais | Encerramento bloqueia gravação; não elimina automaticamente o usuário              | Documentar remoção de credenciais, desvinculação de registros e tratamento de FKs; não executar exclusão genérica em cascata |
| Solicitações concluídas        | 180 dias após atendimento, com minimização do conteúdo                                                             | Registro e análise administrativa implementados                                    | Rotina de revisão/anonimização ainda manual; separar comprovante mínimo de atendimento de mensagens desnecessárias           |
| Feedback resolvido             | 180 dias após conclusão                                                                                            | Armazenamento e envio de feedback existentes                                       | Confirmar como a conclusão será marcada e quem executará a limpeza                                                           |
| Resultados e decks públicos    | Revisão anual da necessidade de identificação nominal, além do atendimento de pedidos                              | Consulta pública e edição administrativa existentes                                | Definir critérios de anonimização, atribuição e preservação de estatísticas; não fixar prazo ilimitado por padrão            |
| Logs de Auth/API e de e-mail   | Prazo efetivo do plano/provedor, sem extensão por padrão                                                           | Mantidos pelos fornecedores                                                        | Conferir contratos, configurações e exportações; não aplicar os 90 dias do painel a esses logs por suposição                 |
| Backups                        | Ciclo mínimo necessário à recuperação, conforme política efetivamente contratada                                   | Backup manual interrompido a pedido do usuário                                     | Definir ciclo e proteção; reaplicar pedidos atendidos após restauração                                                       |

Os 90 e 180 dias foram aprovados como critérios operacionais, **não são prazos impostos pela LGPD**. Não reduzem nem prorrogam os prazos legais de resposta a solicitações. A aprovação foi expressa nesta sessão; os demais critérios exigem decisão própria.

Justificativa proposta para a auditoria: “Conservar por 90 dias os eventos necessários à investigação de alterações indevidas, recuperação de falhas e prestação de contas à comunidade, cobrindo aproximadamente três meses de operação. Restringir acesso, revisar necessidade a cada seis meses e eliminar diariamente os eventos mais antigos. Não conservar credenciais, IPs ou mensagens privadas no conteúdo dos eventos por padrão.”

Uma investigação ou obrigação concreta pode exigir conservação específica. A comunidade deverá documentar hipótese, escopo, acesso e revisão, sem suspender indiscriminadamente a limpeza de todos os registros.

## Validações do aviso

| Tema                         | Situação em 25/10/2026                                                                       | Ação necessária                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Identificação do controlador | Usuário informou “a comunidade Digimon CWB”; Eduardo é responsável técnico                   | Identificar pessoas/entidade que assumem as decisões e a representação; não presumir CNPJ ou encarregado formal |
| Contato                      | `dulopes1997@gmail.com` informado                                                            | Confirmar monitoramento e responsáveis pelo atendimento                                                         |
| Finalidades                  | Conta, decks, torneios, segurança, atendimento e geração de conteúdo identificados no código | Confirmar usos fora do código e bases legais por atividade                                                      |
| Legítimo interesse           | Possível fundamento de algumas operações                                                     | Registrar teste de finalidade, necessidade, impactos, expectativas e salvaguardas antes de adotá-lo             |
| Dados públicos               | Resultados e perfis incluem nome/apelido e identificadores Bandai/DigiLab                    | Revisar minimização e necessidade de exposição dos identificadores                                              |
| Menores                      | Declaração de maioridade implementada; sem aferição independente                             | Definir política e procedimento compatíveis com participantes de torneios e usuários menores                    |
| Fornecedores                 | Supabase, GitHub Pages, DigiLab e fontes de imagens; código de feedback usa Resend           | Conferir uso efetivo, região, transferências e contratos; incluir Google se Gmail for usado                     |
| Retenção                     | 90 dias de auditoria configurados no banco                                                   | Aprovar critérios e assegurar execução antes de publicar compromissos                                           |
| Publicação do aviso          | Minuta local                                                                                 | Resolver notas, publicar versão HTTPS e então cadastrar URL/versão                                              |
| E-mail transacional          | SMTP ainda não fornecido                                                                     | Configurar serviço, guardar credencial apenas no provedor e testar fluxos reais                                 |
| Ativação                     | `accounts_enabled=false`                                                                     | Manter desativado até conclusão e validação da preparação                                                       |

## Aplicação após aprovação

Decisões posteriores confirmadas: os responsáveis pelas decisões de dados são vários administradores da comunidade, que ainda precisam ser identificados nominalmente no aviso. A primeira versão de contas será **exclusiva para maiores de 18 anos**, substituindo a intenção inicial de incluir menores. Não será criado fluxo de autorização de responsáveis nesta entrega. A declaração de maioridade e seu registro foram implementados e testados, com publicação do frontend pendente; um aceite genérico não comprova maioridade nem transfere as responsabilidades da comunidade ao usuário.

Não rode SQL para ativar contas como parte da preparação. Depois de revisar e publicar o aviso, um administrador deve salvar sua URL, versão, prazo e justificativa pelo painel, mantendo a opção de controle desativada. A configuração de prazo habilita a limpeza diária de auditoria mesmo durante o piloto, portanto só deve ocorrer após aprovação.

As contas do domínio interno de administração precisam de migração para e-mail real confirmado antes da ativação. Não exclua essas identidades nem transfira privilégios automaticamente pelo nome.

## Revisão manual dos 180 dias

A administração deve revisar mensalmente solicitações e feedback concluídos. Em `account_requests`, a data de revisão está em `reviewed_at`; um status pendente não deve ser tratado como concluído. No feedback, `email_sent_at` representa envio, não resolução: a tabela atual não possui data de conclusão. Registre a conclusão em controle administrativo privado e mantenha somente identificador e datas necessários à gestão, sem duplicar mensagens pessoais no Git ou em planilhas públicas.

Antes de eliminar ou anonimizar, confira pendências, obrigações específicas e dados que precisam ser preservados de forma mínima. O atendimento de eliminação não precisa aguardar os 180 dias. Inclua cópias das mensagens no e-mail de suporte no procedimento, pois apagar uma linha do banco não apaga uma mensagem do Gmail ou de outro provedor. Registre a execução de forma mínima e proporcional. Nenhuma exclusão de solicitações ou feedback foi executada nesta preparação.

## Referências para revisão

- [LGPD, texto compilado — finalidades, necessidade, direitos e conservação](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm).
- [ANPD — guia de legítimo interesse](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_hipoteses_legais_tratamento_de_dados_pessoais_legitimo_interesse).
- [ANPD — guia de agentes de tratamento e encarregado](https://www.gov.br/anpd/pt-br/assuntos/noticias/nova-versao-do-guia-dos-agentes-de-tratamento).

A validação técnica registra correspondência entre aviso e código. A revisão jurídica deve considerar a operação real da comunidade; esta minuta não certifica conformidade.
