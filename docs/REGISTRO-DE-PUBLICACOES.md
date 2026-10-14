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

## Correção urgente de compatibilidade da sessão

O deploy `e7d44a55f71fc73f704ede022e3fbb6f8f716f41` ficou pronto e `/api/nexus/logs` passou a retornar 401/no-store sem sessão. Porém, o login legítimo retornou 500 com `AUTH_SECRET is required`. A verificação prévia do coordenador não comprovava a existência de uma chave configurada; a inferência registrada no gate estava incorreta.

Correção: restaurar somente a resolução da chave de sessão que já era usada no baseline; preservar proteção/redação dos logs, fila, captura, diagnóstico e validação do payload da sessão. A exigência da chave e seus dois testes foram retirados desta entrega. Isso restaura compatibilidade, mas **não corrige a chave pública legada**: provisionar uma chave privada em AUTH_SECRET na Vercel e retirar o fallback continua pendente. Não é correto anunciar autenticação integralmente endurecida antes dessa configuração. Nenhuma chave/token foi revogado ou trocado.

O coordenador não tem sessão autenticada no painel Vercel. A correção segue pelo repositório já autorizado e terá login real retestado após deploy.
