# Atendimento compartilhado usando o executor Codex existente

O chat do Adsnap usa as rotas autenticadas `/api/support` e o banco já existente para enviar solicitações e recuperar respostas. O navegador não se conecta a localhost. Usuários podem acessar de outros computadores, celulares e redes com suas próprias contas do Adsnap; não precisam entrar no ChatGPT.

O executor é um processo no computador do operador, autenticado normalmente no Codex com a conta ChatGPT existente. Ele busca trabalho por conexão de saída com o banco, executa uma solicitação por vez e persiste a resposta. As credenciais ChatGPT não são enviadas à Vercel nem aos usuários. Não há chave OpenAI API, fallback pago, túnel público, servidor novo ou contratação de serviços. Continuam valendo a disponibilidade e os limites do plano conectado, além dos limites dos serviços que o projeto já utiliza. Isto documenta o funcionamento técnico; não é uma afirmação de aprovação contratual de uma oferta comercial ou de franquia ilimitada.

## Disponibilidade

O computador executor precisa permanecer ligado e conectado. Se ele ficar offline, mensagens continuam na fila e o chat informa essa condição. Ao atingir um limite identificado pelo Codex, o executor pausa quinze minutos antes de tentar novamente; não troca para API paga. Se a autenticação exigir renovação, o operador precisa entrar novamente pelo fluxo oficial do Codex. Não há promessa de disponibilidade 24 horas enquanto o executor depender de um computador pessoal.

Inicialização: `npm run codex:support`. A configuração de dados pode ser fornecida por `ADSNAP_SUPPORT_ENV_FILE` (arquivo local ignorado pelo Git) ou por `DATABASE_URL` no ambiente. O processo precisa do Node 24 e das dependências do checkout. Não forneça chaves OpenAI API: o conector recusa esse modo. O comando `--once` atende uma solicitação para verificação e encerra.

## Operações

- Buscar campanhas por PI, cliente ou nome, consultar tentativas e capturas atuais.
- Consultar o estado de cadastros GAM, inclusive falhas anteriores à criação da campanha.
- Pesquisar e ler trechos das fontes explicitamente autorizadas para explicar falhas e propor análise técnica.
- Preparar reprocessamento ou prévia modificada para confirmação no próprio chat. Não anuncia sucesso ao enfileirar; os resultados acompanham os estados persistidos dos jobs existentes.
- Prévia modificada exige aviso e confirmação específicos, campanha atualmente falhando com erro de confirmação do criativo, preview GAM compatível e nenhuma execução ativa. O pipeline de captura existente continua validando a identidade do criativo e registrando `MODIFIED_PREVIEW`.
- Bugs de código podem ser registrados como análise técnica. Esta versão não executa testes arbitrários de código fornecido por usuários e não publica alterações automaticamente. Comandos operacionais anteriores e o modo pessoal permanecem em opções separadas.

## Isolamento e confiabilidade

Conversas pertencem ao usuário do Adsnap. Todas as rotas verificam a sessão e o usuário ativo no banco; confirmações também verificam a posse da conversa. As tabelas têm RLS habilitada e não concedem acesso aos papéis públicos do Supabase. Solicitações têm chave de idempotência, limite diário por usuário, no máximo uma pendente por conversa, fila limitada e executor único com lease. Respostas atrasadas de execuções expiradas não substituem o histórico nem são repetidas automaticamente.

Cada resposta usa um thread efêmero do Codex, com apenas o histórico daquela conversa e ferramentas MCP específicas do Adsnap. O diretório de trabalho é vazio. Shell, execução unificada, navegador, imagem, hooks, subagentes, memória e plugins/aplicativos pessoais são desabilitados. Antes de enviar o prompt, o executor confere o inventário **daquele thread** e recusa conexões herdadas. Eventos de ferramentas não autorizadas interrompem a tarefa.

As ferramentas expostas consultam dados redigidos, leem apenas uma lista fixa de fontes ou gravam propostas pendentes. Elas não executam comandos fornecidos pelo modelo. O processo Codex e seu filho MCP não recebem credenciais do banco; apenas o processo operador consulta o banco. O MCP usa uma capacidade temporária limitada à tarefa e um endpoint interno de loopback. Esse endpoint não é exposto à rede dos usuários. Links de preview completos, tokens e caminhos de imagens não são incluídos nos diagnósticos enviados ao modelo.

Confirmações de operações bloqueiam as linhas de ação e campanha, revalidam veiculação/status e criam jobs atomicamente. Repetir a confirmação não cria nova captura. Ações em andamento, concluídas, com falha e aguardando análise têm estados distintos. Histórico anterior de falhas é preservado.

## Publicação e verificação

Aplicar a migração aditiva `prisma/manual-migrations/20261103_shared_codex_support.sql` no banco antes de iniciar o executor. Ela é idempotente e não altera as tabelas de campanha/captura existentes. Publicar o frontend e as rotas no projeto Vercel existente e iniciar o executor a partir de um checkout estável da mesma versão.

Testes: `npm test`, `npm run typecheck:support`, `node --import tsx tests/support-store.integration.cjs <URL-do-banco-isolado>`. O smoke `node --import tsx test-support/support-ui-smoke.mjs` usa um executor sintético explícito em CI. `--real-plus` usa o Codex real e sua franquia, sempre com banco e servidor de teste locais; nunca deve apontar para produção. Os testes recusam bancos fora do loopback e do nome `adsnap_worker_test`.

Referências: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [configuração de ferramentas](https://learn.chatgpt.com/docs/config-file/config-reference), [autenticação](https://learn.chatgpt.com/docs/auth).
# Consultas operacionais e tempo de resposta

Cada pergunta recebe um panorama novo do banco, carregado em paralelo com a inicialização do Codex. Ele inclui perfil atual do usuário, PIs cadastrados e em veiculação, registros por formato/dispositivo, prints de hoje e históricos por status, filas e estado do executor de suporte. Os totais abrangem todos os registros, independentemente dos limites das páginas de detalhe.

As consultas `adsnap_list_campaigns`, `adsnap_list_captures` e `adsnap_worker_status` aceitam filtros e paginação com total e próximo offset. Formatos usam os rótulos cadastrados, preservando o identificador para filtros, sem reintroduzir validação por dimensão. O diagnóstico mostra metadados e auditorias dos prints; não afirma inspecionar uma imagem sem vê-la. Jobs históricos não comprovam que um processo worker esteja online.

Em veiculação significa PI com pelo menos um registro não arquivado, com voo vigente na data civil de Brasília e sem estado encerrado/pausado/cancelado. Falha de print não encerra o voo. Registros sem período são contados à parte. O contexto distingue PIs de registros por formato, e configuração administrativa só é retornada a admin consultado novamente no banco. Senhas, tokens, caminhos privados de armazenamento e conversas de terceiros não são expostos.

O atendimento escolhe raciocínio `low` somente quando suportado pelo modelo padrão da própria conta; caso contrário mantém o padrão anunciado no catálogo. A fila é consultada a cada segundo após um ciclo vazio. Logs registram duração da execução sem conteúdo de mensagens. Os tempos dependem da rede, da fila e da disponibilidade do Plus; não há troca para API paga.
