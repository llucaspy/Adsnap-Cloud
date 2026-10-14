# Registro de publicações — captura Adsnap

## 14/10/2026 — implementação iniciada

Baseline: `2f9fd474345e9a50a76c517e0a24b4984d81d12c`.

Autorização: responsável autorizou publicar as mudanças aprovadas e conferir os resultados no serviço online. Plano: [PLANO-E-OBJETIVO.md](PLANO-E-OBJETIVO.md).

Branch: `codex/worker-hardening-20261014`.

Escopo preparado: logs autenticados/redigidos; segredo de sessão obrigatório; fila transacional e confirmação por dono/tentativa; recuperação e agenda; validação real de conteúdo/formato; upload com identidade única; diagnóstico de job e painel responsivo; workflow com orçamento e regressão automatizada. Scripts diagnósticos legados passam a receber GitHub token por ambiente, sem credencial no fonte. Nenhuma credencial foi revogada.

Validação local anterior ao envio:

- `npm test`: 83/83, com casos independentes e Chromium real.
- PostgreSQL isolado: 10/10, incluindo concorrência, rollback, posse antiga, recuperação e agenda.
- TypeScript do worker e build de produção: aprovados.
- Smoke da build em 1365px e 390px: 4/4; screenshots sintéticas em `evidence/worker-release-local`.
- Verificação visual do coordenador corrigiu compressão do texto no celular; nova execução do smoke passou.
- Revisão independente encontrou falhas e gerou testes próprios. O último bloqueador (CSP) foi corrigido e passou; o agente atingiu limite de uso antes de novo parecer final. Ver `GATE-TECNICO-RELEASE.md`.

Estado deste registro: pronto para CI remoto. **Nenhum deploy desta etapa confirmado ainda.** O SHA, CI remoto e verificações do serviço online serão acrescentados após a publicação.

Não houve migração nem leitura de segredo do banco de produção. O índice opcional continua sem aplicação. Hashes identificam buffers, mas o raw físico continua pendente; não declarar a etapa 4 concluída.

## Integração da primeira entrega

PR #1: https://github.com/llucaspy/Adsnap-Cloud/pull/1. Commit da implementação: `42f714e44286cab6cf492437c7f8c2d3d98af339`. Integração em main: `e7d44a55f71fc73f704ede022e3fbb6f8f716f41`.

Ambas as execuções remotas de Capture regression (push e PR) passaram: regressão, PostgreSQL 18 isolado, tipos do worker, build e navegação nas telas. Preview Vercel passou. Antes do merge, main ainda estava no baseline e nenhum worker estava em execução/espera. Deploy de produção ainda em conferência neste registro.

Uma checagem adicional do coordenador encontrou classificação ambígua quando um ciclo apenas reenfileirava tentativas. Correção complementar: ciclo com retry pendente fica DEFERRED e o painel exibe a contagem aguardando nova tentativa; não anuncia SUCCESS parcial. Falhas terminais/operacionais continuam FAILED. O teste novo passou junto aos 14 casos anteriores do worker (15/15). O workflow de regressão passa a executar no PR e em main, evitando a duplicação por push no branch + PR.

## Correção urgente de compatibilidade da sessão

O deploy `e7d44a55f71fc73f704ede022e3fbb6f8f716f41` ficou pronto e `/api/nexus/logs` passou a retornar 401/no-store sem sessão. Porém, o login legítimo retornou 500 com `AUTH_SECRET is required`. A verificação prévia do coordenador não comprovava a existência de uma chave configurada; a inferência registrada no gate estava incorreta.

Correção: restaurar somente a resolução da chave de sessão que já era usada no baseline; preservar proteção/redação dos logs, fila, captura, diagnóstico e validação do payload da sessão. A exigência da chave e seus dois testes foram retirados desta entrega. Isso restaura compatibilidade, mas **não corrige a chave pública legada**: provisionar uma chave privada em AUTH_SECRET na Vercel e retirar o fallback continua pendente. Não é correto anunciar autenticação integralmente endurecida antes dessa configuração. Nenhuma chave/token foi revogado ou trocado.

O coordenador não tem sessão autenticada no painel Vercel. A correção segue pelo repositório já autorizado e terá login real retestado após deploy.

## Login restaurado e primeiro teste online

Hotfix PR #3: `da4092c7511fae677f04bdd19d2e65d475a84166`, integrado em `d41f13c40eacbdd1244ab91b176d0303135d65a5`. Regressão local 81/81 após retirar os dois testes da exigência de chave; CI remoto também passou. O deploy Vercel terminou e o login legítimo voltou a responder 200, com cookie de sessão. O login também foi conferido pela interface. A pendência AUTH_SECRET permanece; a integração Vercel foi localizada, mas ainda não está instalada/conectada nesta sessão.

PR #2 de classificação dos ciclos: CI completo passou sobre `59028bf07d7deb67e864c6f47e58a4d194dc2d7f` (82 testes após integrar o hotfix), integrado em `846516f24aaa198e68a6960f3ce43808a8ab975e`. Deploy Vercel confirmado pronto.

Teste online direcionado do modelo PI 000/mobile: um job, uma tentativa, duração do ciclo 30.874ms. A validação recusou `TARGET_DIMENSION_MISMATCH` (pedido 300×250; iframe 217×180; container 375×250), não fez upload e manteve a evidência anterior. O job voltou para retry com limite de duas tentativas. A página real de diagnóstico abriu pelo link do painel, sem 404, exibindo motivo, horário e tentativas.

O run inicial ainda classificou esse adiamento como SUCCESS apesar de zero imagens novas; isso confirmou em produção o problema que o PR #2 já corrigia. Os registros históricos são preservados. Uma execução posterior sobre o commit novo confere a tentativa restante e um controle positivo com imagem de preview já configurada. Não foi disparada a fila completa, email ou relatório publicitário.

Na inspeção do portal pelo navegador em viewport mobile, os containers também eram mais largos que o formato contratado e estavam sem iframe carregado naquele instante. Essa observação não prova o formato de todo anúncio servido pelo portal. Não foi relaxada a tolerância de dimensão nem transformado um slot vazio em evidência válida.

Uma correção de texto no diagnóstico passa a indicar “Sem reserva ativa” quando uma tentativa já ocorreu mas o runId foi liberado para retry; “Não iniciada” fica apenas para tarefa sem tentativa.

## Controle positivo e falha terminal confirmados

Execução: https://github.com/llucaspy/Adsnap-Cloud/actions/runs/38631005658, sobre `846516f24aaa198e68a6960f3ce43808a8ab975e`. Resultado persistido: **2 jobs reservados, 1 sucesso, 1 falha terminal, zero perda de posse e zero falha operacional**. O ciclo registrou FAILED no banco e o processo retornou erro no Actions, conforme esperado para o controle negativo; não tratou o sucesso parcial como sucesso integral.

O controle positivo gravou uma nova captura em 14/10/2026 às 20:20:41 UTC. O endpoint autenticado devolveu um PNG de 975.885 bytes, e seu SHA-256 correspondeu exatamente ao hash registrado em auditNotes. Metadados: `MODIFIED_PREVIEW`, validação `CONFIRMED / IMAGE_RENDERED_OPACITY_CONFIRMED`, `rawPreserved:false`. O arquivo foi inspecionado visualmente pelo coordenador. Não é prova de veiculação observada: trata-se do preview configurado, com imagem inserida no portal e moldura atual. A imagem real da campanha fica fora do Git público; somente estes resultados resumidos são versionados.

O modelo negativo esgotou a segunda tentativa sem upload de imagem incompatível. O job permanece no histórico como FAILED e a captura anterior foi preservada; não apagar esse histórico para esconder o resultado. Sua configuração/forma de uso como template precisa de revisão antes de uma nova tentativa manual. O agendamento não deve restaurar seu orçamento automaticamente.

Depois dos testes: sessão legítima 200/autenticada; `/api/nexus/logs` anônimo 401 com `private, no-store`; consulta autenticada 200; páginas reais de workers e job funcionais. Os avisos de hidratação do React observados no navegador também já ocorriam no baseline; não foram apresentados como aprovação de toda a interface.

Estado da entrega: captura cloud e armazenamento conferidos com controle positivo, recusa de formato e falha CI conferidas com controle negativo. Sem nova dependência paga, migração obrigatória ou necessidade de notebook ligado. **AUTH_SECRET privado, raw físico, retenção/capacidade e auditoria de egress/sandbox continuam pendentes.** O plano completo não está encerrado por esta primeira publicação.
