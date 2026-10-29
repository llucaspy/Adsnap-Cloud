# Prévia HTML5 da campanha El niño

A correção do perfil desktop resolveu a reprodução local, mas o primeiro reprocessamento na nuvem ainda esgotou as tentativas dos 12 registros. Isso não foi considerado sucesso: nenhum print vazio foi aprovado.

## Diagnóstico operacional

O workflow oferece uma opção manual diagnose_network. Ela consulta apenas um ou dois registros explícitos, mede as respostas de rede no próprio runner e registra códigos HTTP, host e tipo de conteúdo em NexusLog, sem registrar URLs de preview ou credenciais. Não enfileira tarefas, não captura nem altera o status das campanhas. Pode comparar o carregador com um pacote público HTML5 identificado no preview.

## Pacote original

A reprodução local identificou cinco documentos HTML5 da Space/00px associados aos IDs de criativo dos previews desta campanha; o Retângulo é compartilhado pelos registros desktop/mobile. O documento deve ser confirmado como acessível no runner antes da recuperação por esse caminho.

O fluxo já existente creativeAssetUrl pode receber agora o index.html original do pacote, além de uma camada de imagem. O próprio HTML5 é renderizado e validado antes do raster; documentos HTTP inválidos ou vazios são recusados. O perfil desktop também se aplica a esse navegador auxiliar.

Este caminho produz MODIFIED_PREVIEW: o criativo original é renderizado e colocado no slot de uma prévia controlada. Não comprova veiculação observada. Os registros devem conservar essa distinção na evidência e a origem do pacote nos metadados da campanha.

## Validação

As fixtures verificam documento reconhecido, recusa de outros hosts e credenciais na URL, renderização real com evidência MODIFIED_PREVIEW e recusa de pacote vazio sem upload nem SUCCESS. A validação de produção será registrada separadamente depois da comparação de rede e do reprocessamento direcionado.

O diagnóstico na nuvem foi concluído na execução 40958120491: cdn.00px.net retornou o bootstrap JavaScript com HTTP 200, o carregador 00px.net retornou HTTP 403/HTML e o pacote original retornou HTTP 200 com IMAGE_DECODED. O diagnóstico não alterou a fila nem criou capturas.

O renderizador mede agora o retângulo do #banner no próprio HTML5, em vez de conservar a altura provisória do slot do portal. A fixture usa um placeholder de 300x250 e documento real de 300x600 e confirma rasterização integral de 300x600; o pacote vazio continua recusado. Isso usa geometria observada do documento, sem catálogo de dimensões. A reprodução ao vivo do Halfpage por esse caminho passou com MODIFIED_PREVIEW e IMAGE_DECODED.
