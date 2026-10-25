# Aviso de privacidade — Comunidade DIGIMON CWB

**Minuta para revisão, ainda não publicada como documento vigente.** Versão proposta: `2026-10-25.1`. A data de vigência será a da publicação aprovada. As notas entre colchetes devem ser resolvidas antes de publicar este texto ou cadastrá-lo como aviso vigente no site.

## Quem é responsável e como entrar em contato

O DIGIMON CWB é um site da Comunidade Digimon CWB para consulta de torneios, resultados e decks e para criação de listas de cartas.

Responsável informado pela organização do site: **Comunidade Digimon CWB**, com decisões sobre dados compartilhadas pelos administradores designados pela comunidade. Responsável técnico e contato operacional: **Eduardo Lopes**. Para assuntos de conta, dados pessoais e privacidade: **dulopes1997@gmail.com**.

[VALIDAR: a decisão compartilhada foi confirmada pelo usuário. Identificar nominalmente as pessoas que decidem as finalidades e os meios e documentar suas responsabilidades. Ter acesso técnico como administrador, por si só, não define essa responsabilidade. A indicação da comunidade não presume CNPJ, personalidade jurídica nem nomeação de Eduardo como encarregado ou representante legal.]

## Quais dados usamos e para quê

| Atividade             | Dados necessários                                                                                                                  | Finalidade                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Consulta do site      | Dados técnicos de acesso que os provedores de hospedagem e infraestrutura recebem, como endereço IP e navegador                    | Entregar as páginas e proteger a infraestrutura                           |
| Conta                 | E-mail, identificador da conta, nome de usuário, nome de exibição, estado da conta e registro da versão lida deste aviso           | Autenticar, manter o perfil e administrar o acesso                        |
| Credenciais           | Senha fornecida ao serviço de autenticação, tokens de sessão e informações de confirmação de e-mail                                | Verificar a identidade, manter a sessão e recuperar o acesso              |
| Jogadores e torneios  | Nome ou apelido, identificadores Bandai/DigiLab cadastrados, loja, data, participação, classificação e deck                        | Organizar e apresentar resultados e estatísticas da comunidade            |
| Decks                 | Nome da lista, cartas e quantidades, formato, autor creditado, conta proprietária e histórico de alterações                        | Criar, editar, compartilhar e administrar listas                          |
| Atendimento           | Tipo do pedido, mensagem, contato quando informado e resposta da administração                                                     | Atender dúvidas, erros e solicitações de direitos                         |
| Segurança e auditoria | Conta responsável quando identificada, data, ação, registro afetado, diferenças permitidas e resultado de operações instrumentadas | Apurar alterações, abusos e falhas, controlar permissões e prestar contas |

A aplicação usa Supabase Auth para autenticação. Não disponibilizamos senhas, tokens ou hashes de credenciais no painel de auditoria da aplicação. Administradores não consultam sua senha pela interface do site.

As consultas públicas não exigem conta. A ausência de dados obrigatórios de conta impede a autenticação e a criação ou alteração de registros que exigem login. O vínculo com jogador é opcional e depende de análise administrativa; ser o autor creditado de um deck não comprova sua propriedade.

Não envie documentos de identidade, dados de saúde, senhas ou outros dados sensíveis em nomes de decks, mensagens e campos livres. Quando precisarmos verificar uma solicitação, pediremos somente informações proporcionais à verificação.

## O que fica público

Listas de decks da comunidade e de torneios, nomes e apelidos de jogadores, resultados, lojas e estatísticas podem ser consultados por visitantes e indexados por mecanismos de busca. O site possui recursos de geração de imagens e compartilhamento de resultados e decks. Cópias publicadas por outras pessoas ou em redes sociais não ficam sob nosso controle técnico.

O e-mail de acesso, as solicitações privadas e os eventos de auditoria da aplicação não fazem parte da consulta pública. Administradores autorizados têm acesso aos dados necessários às suas funções. Alguns cadastros públicos de jogadores contêm identificadores Bandai/DigiLab; revise com a comunidade quais identificadores precisam permanecer públicos e solicite correção ou restrição quando necessário.

Dados de torneios também podem ser fornecidos por organizadores e administradores ou importados da integração DigiLab. O fato de um dado estar disponível em outra fonte não elimina os direitos de seu titular.

## Fundamentos do tratamento

[VALIDAR ANTES DA PUBLICAÇÃO: a comunidade deve registrar, para cada finalidade, a hipótese legal aplicável. Proposta para revisão: procedimentos solicitados pelo titular e execução da relação de uso do site para conta e decks, quando aplicável; legítimo interesse para operações de segurança e para divulgação proporcional de resultados, após análise de finalidade, necessidade, expectativas e impactos; cumprimento de obrigações legais quando houver uma obrigação concreta. Não tratar o reconhecimento de leitura deste aviso como consentimento genérico.]

Quando uma atividade depender de consentimento, a finalidade e a possibilidade de revogação deverão ser informadas de forma específica. Não condicionamos o exercício de direitos à aceitação de publicidade.

## Serviços utilizados e compartilhamento

- **Supabase:** banco de dados, autenticação, armazenamento e execução de funções de servidor.
- **GitHub Pages:** hospedagem das páginas públicas.
- **DigiLab e fontes de imagens de cartas:** integração de dados e carregamento de imagens. Ao buscar uma imagem diretamente de outro servidor, o navegador pode transmitir dados técnicos de acesso a esse provedor.
- **Provedor de e-mail:** entrega de confirmações e recuperação de conta. [VALIDAR: Gmail/Google se aprovado como SMTP inicial; o formulário de sugestões também possui integração separada com Resend, cujo uso efetivo deve ser conferido.]

Provedores podem tratar dados fora do Brasil. [VALIDAR: confirmar a região efetiva do projeto, os fornecedores usados, os contratos e os mecanismos aplicáveis às transferências internacionais. Não afirmar localização exclusivamente brasileira sem verificar.]

[VALIDAR: confirmar se há publicidade, patrocínio com compartilhamento, venda de dados ou outras finalidades fora do código revisado. Esses usos não foram identificados nos componentes de autenticação e preferências analisados.]

## Armazenamento no navegador

Usamos armazenamento local e de sessão para autenticação, preferências de aparência e funcionalidades do site. Apagar esse armazenamento pode encerrar a sessão e remover preferências. Não exigimos cookies de publicidade para entrar na conta. Serviços externos podem receber dados técnicos conforme descrito acima.

## Por quanto tempo conservamos os dados

[VALIDAR: aplicar somente os prazos aprovados e cuja execução esteja organizada. A proposta está em `retencao-e-validacao.md`.]

- Dados de conta: enquanto a conta estiver ativa e pelo período de encerramento necessário ao atendimento e à solução de pendências. O encerramento bloqueia o acesso de escrita; a eliminação ou anonimização requer procedimento próprio.
- Decks e resultados: enquanto forem necessários às finalidades informadas, com revisão da identificação de pessoas e atendimento de solicitações. Não adotamos conservação nominal ilimitada como regra automática.
- Auditoria da aplicação: **90 dias**, prazo aprovado e configurado em 25/10/2026, com rotina diária de limpeza. Não se aplica automaticamente aos logs dos provedores.
- Solicitações e feedback: **180 dias após a conclusão**, prazo aprovado, com revisão de necessidade e remoção manual de conteúdo desnecessário. A administração precisa atribuir a tarefa e acompanhar a execução.
- Cópias de segurança e logs de fornecedores: seguem ciclos próprios, a confirmar no inventário. Uma eventual restauração deve reaplicar solicitações de eliminação ou anonimização já atendidas.

Conservações excepcionais devem ter finalidade e fundamento específicos, prazo ou critério de revisão, acesso limitado e registro da justificativa. Não mantemos dados apenas porque existe espaço disponível.

## Seus direitos e como solicitar

Você pode pedir confirmação e acesso a dados, correção, informações sobre compartilhamento e, nas hipóteses aplicáveis, portabilidade, bloqueio, anonimização, eliminação, revogação de consentimento e revisão de decisões automatizadas.

Entre em contato por **dulopes1997@gmail.com** ou use as solicitações da área de conta quando disponível. Informe o pedido e os registros envolvidos; não envie sua senha. Podemos verificar sua identidade antes de fornecer dados privados ou alterar registros de outra pessoa. Não é preciso manter uma conta ativa para usar o canal por e-mail.

Cada solicitação será analisada conforme os direitos aplicáveis e os prazos legais. Quando houver impedimento de atendimento ou necessidade de conservação, explicaremos o motivo pertinente. Você também pode recorrer à Autoridade Nacional de Proteção de Dados pelos canais oficiais.

## Crianças e adolescentes

Nesta primeira versão, a criação de contas será destinada exclusivamente a pessoas com 18 anos ou mais. Não haverá cadastro de conta de menor por autorização de responsável nesta etapa. A abertura futura para menores dependerá de preparação e validação específicas.

[IMPLEMENTADO E TESTADO: declaração de maioridade no cadastro e registro autenticado no servidor ao completar o perfil. A declaração não é comprovação independente de idade. A publicação da interface e dos documentos finais está pendente. VALIDAR: tratamento de indícios de uso por menor; não afirmar que existe verificação documental ou biométrica.]

Essa restrição de contas não elimina a possibilidade de menores aparecerem em resultados importados de torneios ou consultarem páginas públicas. [VALIDAR: minimização, exposição de identificadores e tratamento de solicitações de participantes menores; avaliar a incidência do ECA Digital sobre a operação efetiva, considerando o público provável do site.]

## Segurança e alterações deste aviso

Adotamos controles de acesso e registros de alterações na aplicação. Os eventos do painel não representam toda tentativa de acesso: os serviços de autenticação e infraestrutura mantêm logs próprios. Nenhum serviço é totalmente imune a incidentes. Comunicaremos incidentes quando e como exigido pela legislação aplicável.

Publicaremos alterações relevantes neste aviso e identificaremos sua versão. O site pode exigir nova leitura antes de permitir gravações, sem impedir o uso do canal de privacidade para exercer direitos.
