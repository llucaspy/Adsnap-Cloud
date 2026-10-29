# Captura El niño — PI 332992

## Diagnóstico

Doze registros sem captura esgotaram duas tentativas com CREATIVE_NOT_CONFIRMED. Os seletores eram localizados. A reprodução em Chromium com o proxy de captura mostrou o slot vazio e ERR_BLOCKED_BY_ORB no carregador de anúncio da Space/00px.

A inspeção de rede identificou HTTP 403 com HTML na requisição do script feita com o User-Agent padrão HeadlessChrome. Repetir a mesma requisição, alterando somente o User-Agent para Chrome desktop, retornou HTTP 200 e JavaScript do criativo. A captura local de Billboard passou com o perfil desktop corrigido. Mobile já utiliza um perfil de dispositivo e também foi capturado na reprodução.

Durante a validação do Halfpage também foi identificado deslocamento do slot durante o carregamento tardio da página. A validação podia continuar consultando o mesmo alvo fora da viewport sem reposicioná-lo.

## Alteração

- Desktop usa um perfil Chrome cuja versão vem do Chromium instalado, sem versão fixa. Mobile conserva o perfil de dispositivo existente.
- Se a validação indicar SLOT_NOT_VISIBLE durante a espera, reposiciona o próprio elemento dentro do orçamento existente e tenta confirmar seu conteúdo novamente.
- A validação imediatamente anterior ao screenshot também permite essa recuperação limitada.
- Nenhuma dimensão de catálogo participa da seleção. Não há relaxamento de sandbox, controle de rede, restrições de iframe ou confirmação de conteúdo. Um anúncio vazio continua sem gerar SUCCESS.

## Testes

A suíte local passou com 119 testes. A integração com navegador inclui servidor que recusa HeadlessChrome, exige o perfil iPhone em mobile e desloca um anúncio após a primeira rolagem. Permanecem as verificações que recusam slots vazios e anúncios de outros alvos. Typecheck do worker aprovado.

O resultado de produção deve ser conferido nos 12 registros após o deploy e o reprocessamento direcionado. Reprodução local usa navegador/código reais e banco/storage falsos, sem escrever capturas em produção.
