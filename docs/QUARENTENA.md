# Quarentena e diagnóstico de capturas

A página `/quarantine` reúne tarefas de captura que terminaram em `FAILED`, inclusive as que levaram a campanha à quarentena. O filtro padrão mostra campanhas ainda com falhas; o histórico inclui tarefas antigas de campanhas recuperadas. A busca aceita cliente, PI e nome da campanha. Cada tarefa tem um diagnóstico em `/quarantine/{jobId}`; campanhas legadas sem tarefas continuam acessíveis na seção de pendências antigas.

## Investigação e reprocessamento

O diagnóstico mostra motivo registrado, orientação baseada no texto do erro, tentativas, horários de Brasília, execução e eventos técnicos. As novas tentativas registram `jobId`, `runId`, número, limite de tempo e resultado. Um início sem conclusão pode indicar interrupção ou falha no registro; não se presume sucesso. Eventos antigos por campanha não são apresentados como um histórico exato de tentativas. A configuração da campanha exibida é a atual, não um snapshot histórico.

Uma falha sem imagem não ganha uma imagem de evidência fictícia nem reutiliza um print anterior como se fosse da falha. A classificação do erro é uma pista de investigação, não uma causa comprovada. O mapeamento de dimensões continua fora da lógica de captura.

Administradores podem reprocessar uma campanha em `FAILED` ou `QUARANTINE`. A ação autentica o usuário novamente no servidor. O estado de falha é revalidado sob a trava de enfileiramento para impedir reabrir uma campanha já recuperada ou criar tarefas duplicadas em pedidos simultâneos. Uma nova tarefa é criada e a ocorrência anterior é preservada. A interface distingue enfileiramento de confirmação do disparo imediato do GitHub.

## Telegram

O worker reconcilia tarefas terminais dos últimos sete dias, em lotes de até 20, com registros duráveis em `NexusLog`. A identidade `capture-incident-{jobId}` impede criar duas ocorrências para a mesma tarefa. Essa reconciliação também cobre uma queda entre a gravação da falha e a preparação da notificação.

No fim do ciclo, mensagens pendentes são enviadas em lotes limitados por 40 segundos. Cada requisição ao Telegram tem timeout de 10 segundos; o fallback para texto simples também é limitado. A mensagem contém cliente, PI, campanha, formato, dispositivo, número de tentativas, motivo redigido e botão para abrir o diagnóstico autenticado. O switch `Settings.telegramAlertsEnabled` é respeitado; token e destino seguem a configuração existente.

Uma rejeição de envio mantém o registro pendente para outro ciclo. O aceite da API e a deduplicação persistida permitem marcar o envio como confirmado; isso não confirma leitura pelo destinatário. A entrega é ao menos uma vez: uma queda após o aceite externo e antes de persistir o reconhecimento pode produzir duplicata. Não se promete entrega instantânea: o envio depende da execução do worker no GitHub e da disponibilidade do Telegram. Pendências antigas podem ser notificadas após habilitar os alertas.

Os resumos e erros são redigidos antes da notificação; parâmetros privados são omitidos do contexto da página. Detalhes técnicos completos continuam restritos a administradores. Não há nova tabela, serviço pago ou alteração de credenciais neste recurso.

## Verificação

Há testes isolados de entrega aceita/rejeitada, transporte indisponível, switch desligado, deduplicação, sigilo, associação das tentativas e autorização. As integrações com PostgreSQL verificam a reconciliação real e pedidos concorrentes de reprocessamento, além das garantias existentes da fila. O smoke de UI verifica busca, navegação, diagnóstico por tentativa e controle de reprocessamento em 1365 e 390 pixels. Os testes usam banco e navegador locais e não enviam alertas sintéticos ao chat de produção.
