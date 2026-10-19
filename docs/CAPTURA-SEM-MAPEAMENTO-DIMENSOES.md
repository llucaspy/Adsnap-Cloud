# Captura sem mapeamento de dimensões — 19/10/2026

Solicitação explícita do responsável: retirar da lógica o mapeamento/validação de dimensões. Esta política substitui a exigência anterior de correspondência entre tamanho cadastrado e renderizado, preservada como registro histórico nos relatórios anteriores.

## Comportamento

- O catálogo de formatos fornece seletor e rótulo. Largura e altura cadastradas não selecionam, bloqueiam nem aprovam a captura.
- Capturas funcionam sem largura/altura cadastradas e sem interpretar nomes como `300x250`.
- O seletor explícito continua identificando o alvo. Não há troca automática de slot baseada no tamanho ou fallback especial 300×250 entre Home 0/Home 1.
- Na ausência de seletor, a detecção usa marcações de anúncios e conteúdo visível. Fotos editoriais comuns não entram como substitutos por terem um tamanho semelhante.
- O dispositivo vem de `campaign.device`; a largura/altura do formato não determina desktop/mobile.
- A captura aguarda conteúdo carregado e visível no alvo, revalidado antes do screenshot. Slots vazios, transparentes, ocultos ou sem conteúdo confirmado continuam sem sucesso automático.
- Iframes menores dentro do slot são aceitos quando contêm conteúdo visível. A geometria real é usada para visibilidade, posicionamento e composição de previews, sem comparação com uma tabela de formatos.
- Captura observada, preview modificado e montagem continuam identificados. Posse, cancelamento, uploads imutáveis, sandbox e política de rede permanecem em vigor.

## Regressões

O teste com Chromium real cobre os três casos encontrados no PI 000: imagem 973×243 em slot 970×243; imagem 726×87 em slot 970×87; iframe/imagem 217×180 dentro de slot 375×250. Esses casos passam independentemente das dimensões registradas no catálogo.

Também cobre dimensões ausentes, detecção automática sem formato cadastrado, conteúdo carregado com atraso, recusa de foto editorial, slot explícito vazio e seletor ausente sem troca por outro anúncio. Testes separados mantêm a recusa de frame fora do alvo, transparência, clipping e imagens sem conteúdo confirmado.

## PI 000

A retirada da comparação resolve o bloqueio dos três previews com tamanhos diferentes. Os dois seletores de Saúde cadastrados para páginas Mundo continuam um problema independente; este release não muda seletores globais nem inventa correspondência por dimensão.
