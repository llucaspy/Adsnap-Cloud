# Orders: salvamento automático e frequência de prints

Pedidos de cadastro de Order agora são salvos e agendados pelo worker, sem aprovação adicional para os itens válidos. O formulário de Orders, o chat Nexus e o modo Comandos seguem o mesmo comportamento. O worker finaliza como `JOB_GAM_SAVED`; as telas e notificações mostram “salva e agendada”, sem lembretes de aprovação.

- Nova Order sem indicação de tipo: `PRIVADO` e `DAILY`, com prints diários dentro do período de veiculação.
- Pedido ao Nexus como gov/governo/federal: `GOV_FEDERAL` e `BOUNDARY`, com prints no início e no fim. A escolha permanece se a URL for enviada depois.
- Uma nova solicitação sem tipo não herda um gov antigo da memória.

O tipo é verificado contra o pedido real na conversa e persistido no job. Um parâmetro DAILY antigo não transforma uma campanha federal em diária na finalização. Campanhas ficam com agendamento habilitado e respeitam os horários configurados e as datas civis de Brasília. Uma captura não prova que a campanha está sendo veiculada pelo servidor de anúncios.

Campanhas e conclusão do job são gravadas na mesma transação. Cancelar antes da gravação impede o salvamento; notificações com falha não desfazem um cadastro concluído. Reenvios reutilizam os registros existentes, sem criar formatos duplicados. Uma mudança explícita de tipo em uma Order já salva pode reenfileirar o mesmo job; uma mudança conflitante durante processamento é recusada para não salvar na classificação errada.

Itens realmente inválidos/bloqueados ficam como pendência; os formatos válidos já são salvos. Períodos ausentes ou inválidos não são ativados silenciosamente. Campanhas pausadas ou encerradas intencionalmente não são reabertas pelo importador. Capturas preservam as validações de segurança e de identidade do criativo. Nenhuma lógica nova de mapeamento de dimensões foi introduzida.

Essa alteração vale para o processamento das Orders. Rascunhos históricos não são convertidos em massa sem uma nova solicitação; ao reenviar uma Order pendente, o mesmo job pode retomar o fluxo automático.
