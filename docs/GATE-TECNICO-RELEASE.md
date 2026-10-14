# Gate técnico independente — release de hardening

Data: 14/10/2026. Base: `2f9fd474345e9a50a76c517e0a24b4984d81d12c`; revisão sobre a árvore de trabalho `Adsnap-Cloud-hardening` antes do commit/publicação. Responsável: agente independente dos autores das implementações.

**Parecer independente original: REPROVADO provisoriamente por falha no controle positivo de imagem CDN com CSP.** O parecer e os achados abaixo foram preservados como registro da revisão.

**Atualização do coordenador em 14/10/2026:** a comparação dos buffers foi movida para uma página neutra descartável; a CSP do portal permanece aplicada. O teste independente que bloqueou a entrega passou na suíte completa de **83/83 testes**. Também passaram **10/10 integrações em PostgreSQL real**, typecheck específico do worker e build de produção. A conferência local das telas usa fixtures sintéticas em desktop e celular. Uma última repetição visual corrigiu compressão do texto da tarefa em telas pequenas.

O revisor independente atingiu o limite de uso da conta antes de emitir novo parecer. Portanto, os testes independentes passaram sob execução do coordenador, mas **não existe um segundo parecer final do agente**. A decisão de publicar este release incremental cabe ao coordenador, com registro do commit e verificações cloud separados. Este documento não comprova implantação.

## Método

Foram revistos código, diffs, testes autorais, resultados de PostgreSQL isolado e saídas paralelas de logs. O revisor criou testes próprios em `tests/review-*.test.ts`, usando fixtures sintéticas e chamadas das funções novas. Não acessou produção, arquivos de ambiente ou segredos; não alterou a implementação, fez commit ou publicou mudanças.

Os testes independentes de navegador usam Chromium e DOM reais, com fixtures inline ou dois servidores vinculados a `127.0.0.1`, sem acesso a destinos externos. Os de ciclo extraem funções do worker por AST, removem imports/inicialização e executam em VM com infraestrutura falsa. O teste de identidade executa `saveCapture` com banco/provider falsos: avalia identidade e limpeza, não uma API de armazenamento real.

## Achados da revisão e resolução

| Achado concreto | Correção revista | Estado |
|---|---|---|
| URL aninhada relativa ao protocolo mantinha assinatura em texto/JSON | Redação recursa também por URLs relativas; regressão própria passou | Resolvido |
| `getNexusActivity` e diagnóstico de DB ofereciam saídas paralelas de logs | Server action exige sessão e respeita perfil; debug exige admin, limita campos e não retorna stack; históricos são redigidos | Resolvido por revisão de código |
| Payload do painel entregava detalhes técnicos ao perfil comum apesar da restrição na API | Painel e páginas de job/campanha aplicam restrição no payload, além da redação | Resolvido por revisão de código |
| Iframe descendente transparente, conteúdo fora de slot recortado e imagem transparente recebiam CONFIRMED | Visibilidade considera ancestrais/clipping; frames são verificados antes de entrar; imagem transparente não é evidência confirmada | Quatro regressões próprias passaram |
| Limpeza de upload abortado podia atingir URI reutilizado por captura anterior | Filename UUID por tentativa e `upsert:false`; exclusão limitada ao objeto novo não confirmado | Regressão própria passou preservando duas capturas anteriores |
| Falha ao consultar agenda era absorvida e ciclo terminava saudável | Etapas operacionais alimentam `cycleErrors`; resumo FAILED e rejeição do ciclo | Regressão própria passou |
| Tempo gasto em logs após claim podia iniciar captura com deadline já vencido | Revalidação antes do item; reserva não iniciada é liberada por owner/tentativa e seus contadores são restaurados | Regressão própria passou; integração correspondente revista |
| Imagem CDN legítima sem CORS não podia ser lida por canvas | Verificação usa pixels renderizados, preserva estilos e não refaz request do asset | Controle positivo autoral passou |
| A comparação do fallback usava data URLs dentro da página anunciada e quebrava com CSP que as bloqueia | Comparação em contexto neutro descartável, encerrado em finally; política do portal preservada | Teste independente passou após correção, executado pelo coordenador |

## Segurança e diagnóstico

A rota de logs verifica sessão antes de ler o banco, limita o DTO, redige inclusive registros antigos e retorna headers privados/no-store em sucesso e erro. O usuário comum recebe resumos sem detalhes técnicos. Admin preserva run/job/etapa/tentativa e contexto técnico redigido. Os testes próprios também verificam que erro do provedor de sessão não vaza causa nem inicia leitura.

O segredo padrão publicado foi retirado de `auth.ts` e middleware; ambos usam `sessionSecret.ts`, que rejeita ausência e valor padrão conhecido. O coordenador relatou login legítimo em produção e verificação de que a sessão emitida não usa a chave padrão. O revisor não leu a chave implantada nem produziu sessão contra produção.

Redação por padrões reduz exposição, mas não constitui garantia universal contra qualquer segredo em texto arbitrário. Resumos, detalhes autorizados e payload operacional devem continuar separados; a revisão não certifica todas as rotas ou server actions do projeto.

## Fila, posse e transações

Foi revista a ordem de locks Campaign→WorkerJob em enqueue, claim, commit, retry e recuperação. A campanha é o mutex compartilhado mesmo antes de haver job. O claim evita campanha em processamento e jobs históricos duplicados concorrentes. A confirmação SUCCESS pertence à transação de Capture+Campaign+WorkerJob; dono antigo não pode confirmar/limpar nova posse. Queries raw de tempo usam UTC explícito, consistente com timestamps Prisma, sem depender do timezone da sessão.

O revisor leu a versão inicial com **8/8 integrações aprovadas em PostgreSQL real local**, com pool de cinco conexões: 20 enqueues concorrentes; claims simultâneos sobre histórico duplicado; rollback; owner antigo; recuperação versus conclusão; job futuro bloqueando legado; commit atômico/reexecução; liberação de item não iniciado. O coordenador acrescentou casos de recuperação de fechamento e limpeza de agenda: o relatório atual `worker-postgres-results.json` registra **10/10**. O revisor não repetiu a suíte contra o banco nem revisou formalmente os dois casos adicionais. Isso é evidência de integração da fila, não operação cloud ponta a ponta.

O índice adicional é opcional e não foi aplicado em produção. A exclusividade atual depende de todos os writers seguirem o mutex da campanha; uma futura constraint única exige análise do histórico. A publicação deve conservar a serialização do workflow e evitar mistura de worker antigo e novo.

## Limites para a liberação

O gate cobre um release incremental de segurança, posse, recuperação, diagnóstico e validação de presença/formato. Não certifica identidade comercial do anúncio apenas por pixels/DOM, fidelidade de toda campanha real, todas as datas/políticas legadas ou limite de capacidade gratuito.

- A captura pode ser observada, preview modificado ou montagem; esses estados não são equivalentes. Os metadados informam `rawPreserved:false`: o hash bruto não significa que o arquivo original esteja armazenado.
- O coordenador implementou recuperação de fechamento limitada a campanhas agendadas e elegíveis, sem renovar orçamento esgotado, e limpeza que preserva fila manual e posse ativa. Esses casos constam dos testes novos de agenda e PostgreSQL; permanecem fora do último parecer independente escrito.
- Não houve benchmark da nuvem, injeção de falha em provedor real, carga, teste de SSRF ou auditoria de egress/sandbox. Configurar budget não torna toda operação externa cancelável de maneira instantânea.
- A conferência visual de desktop/mobile e o smoke após deploy são gates separados. Build, typechecks, testes completos e registro do commit implantado devem ser concluídos pelo coordenador antes/depois da publicação conforme a etapa.

Os novos testes independentes devem permanecer na regressão do projeto. Falhas encontradas pelo gate não foram escondidas ou alteradas para aceitar a implementação; os autores corrigiram os comportamentos e o revisor repetiu os casos afetados.
