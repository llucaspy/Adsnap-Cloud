# Fila de captura: mudanças e validação

## Garantias implementadas

- Enqueue serializa requisições na linha da campanha, em transação curta, mesmo antes de existir um job. Só atualiza a campanha após verificar/inserir a fila. Preserva jobs anteriores.
- Claim trava a campanha com `SKIP LOCKED` e reserva job/campanha na mesma transação. Não reserva campanha já PROCESSING ou retirada da fila. Uma campanha não ganha dois processamentos simultâneos mesmo se houver jobs duplicados históricos.
- `runId` único por ciclo e `attempts` cercam resultados antigos. `captureOwnership.ts` verifica posse/lease e bloqueia Campaign→WorkerJob na transação final. O ACK SUCCESS ocorre junto de Capture+Campaign no caminho de captura.
- Finish, retry e recuperação condicionam a escrita ao dono, tentativa e estado. Recuperação usa contagem realmente alterada; não ressuscita SUCCESS a partir de leitura antiga.
- Fallback legado não captura campanha que tenha job ativo, inclusive agendado para o futuro.
- Parsers rejeitam frações/valores inválidos. Reserva apenas capacidade imediata. Timeout fica abaixo do lease com margem e é limitado pelo tempo restante do ciclo. O workflow configura orçamento interno de 15 minutos e limite externo de 30 minutos, incluindo preparação e encerramento.
- Após os logs do lote, cada item revalida se ainda há tempo para sua execução. Reservas que não iniciaram voltam à fila com fence de dono/tentativa, desfazendo os incrementos de tentativa; não iniciam captura de 1ms nem entram em repetição de claim/liberação no mesmo ciclo. O resumo distingue esse adiamento como DEFERRED.
- Resultado persistido com falha na leitura do ACK não provoca nova captura. Contadores separam sucesso, falha terminal, reenfileiramento, posse perdida e resultado sem confirmação.
- Falhas operacionais de limpeza, enqueue direcionado, agendamento, backfill, recuperação e claim aparecem no resumo FAILED e reprovam o processo CI. Ciclo vazio é IDLE; encerramento por orçamento ou com retentativa pendente é DEFERRED, inclusive quando outros itens tiveram sucesso.
- Gmail, alertas de métricas e relatórios automáticos foram retirados do worker de captura conforme escopo. Seus serviços/rotas permanecem no projeto. Processamento de importação GAM foi preservado para compatibilidade.
- Recuperação no último dia só inclui campanhas agendadas, respeita horário/política e não renova jobs FAILED/QUARANTINE. A busca percorre páginas de 250 campanhas com cursor determinístico. Execução direcionada não enfileira globalmente a agenda.
- Limpeza fora do período trava campanha antes do job, preserva posse ativa e pedidos manuais; cancela somente origens automáticas conhecidas. Não restaura uma campanha com fila manual para estado incompatível.
- Painel usa snapshot consistente, distingue histórico de fila ativa, agrupa eventos pelo run e mantém identidade do job. Detalhes autenticados mostram tentativas, período, reserva e erros redigidos. Um desaparecimento na consulta limitada não gera aviso falso de conclusão.

## Testes realizados

`node --test tests/worker-hardening.test.cjs`: **15/15 regressões** usando as funções TS reais com banco/integradores falsos. Inclui falhas entre etapas, posse antiga, concorrência, orçamento, retentativa pendente e resumo CI.

`node tests/worker-postgres.integration.cjs postgresql://adsnap_test@127.0.0.1:55473/adsnap_worker_test`: **10/10 integrações com PostgreSQL real**, Prisma 5.22.0 e pool de cinco conexões. O harness recusa host externo e nome de banco diferente de `adsnap_worker_test`; não lê `.env`, não executa worker principal e remove somente fixtures que ele criou com prefixo `audit_queue_`.

Os testes reais cobrem 20 enqueues concorrentes→1 job; claims simultâneos com histórico duplicado→1 processamento; rollback do claim quando falha a campanha; rejeição de finish/retry/liberação antigos; recuperação versus conclusão concorrente; fila futura bloqueando legado; devolução de reserva não iniciada com tentativas restauradas; e commit atômico Capture+Campaign+ACK com falha injetada e reexecução rejeitada. Resultado em `worker-postgres-results.json`.

Os dois casos adicionais verificam recuperação de fechamento sem ressuscitar quarentena/manual e limpeza preservando pedido manual/posse ativa. A regressão completa `npm test` passou **83/83**, incluindo Chromium real para visibilidade, transparência, conteúdo sem CORS e CSP restritiva. O smoke visual/funcional usa build de produção local, com API autenticada e páginas em 1365px/390px. Fixtures locais não comprovam captura em portal real.

Após o rollback da exigência de AUTH_SECRET (dois testes retirados) e a correção de ciclo com retry (um teste novo), o CI final desta etapa passa **82/82**. A alteração de configuração de sessão não deve ser anunciada como entregue: o fallback legado permanece até provisionar uma chave privada na Vercel. Os testes cloud posteriores, incluindo PNG com hash verificado e falha terminal real, estão em `REGISTRO-DE-PUBLICACOES.md`.

O gate independente `tests/review-cycle-health.test.ts` passou **2/2**, verificando falha de agendamento refletida em FAILED e tempo gasto nos logs após claim impedindo início fora do orçamento.

O servidor de teste usa `America/Sao_Paulo`. O teste descobriu que comparações raw com colunas Prisma `timestamp` UTC eram influenciadas pelo timezone da sessão. Os parâmetros de data e `now()` das SQLs de claim/ownership agora usam UTC explícito. O timezone do servidor não foi alterado para ocultar o problema.

`tsc --noEmit --incremental false` e `tsc --project tests/tsconfig.worker.json`: ambos passaram. O segundo inclui o worker que o tsconfig normal exclui.

## Banco e publicação

Não há coluna nova obrigatória nem migração destrutiva. O arquivo manual `20261014_worker_claim_safety.sql` contém somente um índice parcial concorrente opcional e uma consulta diagnóstica comentada de duplicatas. Não foi aplicado em produção. A correção funciona sem o novo índice.

Não adicionar índice UNIQUE sobre jobs ativos sem revisar o histórico e as solicitações futuras; não apagar jobs existentes para forçar uma migração. A exclusividade usa o lock da campanha. Durante publicação, evitar executar worker antigo e novo ao mesmo tempo; conservar o grupo de concorrência Actions e confirmar que implantação do painel e próxima execução do worker usam o mesmo commit.

Limite: as integrações acima são componentes reais da fila em banco local isolado, não operação cloud e2e. A revisão de captura/armazenamento e a verificação de produção fazem parte de etapas próprias da entrega. Nenhuma dependência paga ou serviço adicional é exigido pelas correções de fila.
