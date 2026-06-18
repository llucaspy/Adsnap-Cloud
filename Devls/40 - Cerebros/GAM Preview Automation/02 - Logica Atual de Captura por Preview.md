# Logica Atual de Captura por Preview

Atualizado em: 2026-06-18

Arquivo principal: `src/lib/captureService.ts`

## Como um preview vira print

1. O worker chama `processCampaign(campaignId)`.
2. O sistema carrega a campanha no banco.
3. O campo `campaign.url` e aberto pelo Playwright.
4. O campo `campaign.format` e usado para buscar uma regra em `Settings.bannerFormats`.
5. A regra do formato define:
   - `width`;
   - `height`;
   - `selector`.
6. Se nao encontrar regra, tenta interpretar `format` como string `largura x altura`.
7. Se nao conseguir obter largura e altura, a captura falha.
8. O navegador abre em modo desktop ou mobile.
9. Mobile faz scroll de aquecimento para carregar lazy-load.
10. Desktop tambem faz warm-up de slots: espera, rola a pagina ate areas mais baixas e volta ao topo.
11. A captura tenta primeiro o seletor explicito do formato.
12. Se o seletor existir, o robo mede `iframe`, `img`, `ins` e o proprio container antes de aceitar sucesso.
13. Se nenhum elemento medido bater com a dimensao esperada, o seletor e tratado como dimensao errada e cai para auto-deteccao.
14. Se o seletor falhar, roda auto-deteccao por elementos candidatos.
15. A auto-deteccao filtra elementos pelo tamanho esperado.
16. O candidato e centralizado na tela.
17. O sistema tira screenshot da tela inteira.
18. A imagem passa por composicao visual.
19. O resultado sobe para Supabase Storage.
20. Um registro `Capture` e criado.
21. A campanha recebe `lastCaptureAt` e status `SUCCESS`.

## Espera e estabilidade do criativo

Encontrar o slot e medir o tamanho correto nao significa que o criativo terminou de renderizar.

Antes do screenshot final, o capturador agora:

- espera no minimo 10 segundos depois de centralizar o slot;
- compara amostras visuais do proprio slot;
- encerra a espera quando o conteudo estabiliza;
- limita a espera a 18 segundos;
- desativa animacoes CSS no screenshot final para preservar um quadro completo.

No fallback sem seletor, a espera final passou para 12 segundos.

## Criativos HTML5 em camadas

Alguns fornecedores, como `creatives.adftech.com.br`, montam o banner com varios PNGs numerados. Nesses casos, `01.png` pode ser apenas o fundo, enquanto texto, pessoas, marca e chamadas ficam em outros arquivos.

Regra obrigatoria:

- nunca tratar um PNG numerado desse host como criativo completo;
- quando houver varias imagens candidatas, renderizar o preview real no site;
- injecao direta so e permitida para um asset estatico inequivoco.

Falha observada na PI `327201` Desenrola Brasil: o antigo fluxo injetou `01.png`, que era apenas um retangulo azul. A captura real do preview, apos a espera, mostrou o criativo completo em todos os formatos.

## Seletor antes de heuristica

O seletor do formato tem prioridade. Isso significa que o formato escolhido no cadastro direciona o robo para um slot especifico da pagina.

Depois da correcao da sessao CAESB, encontrar o seletor nao basta. O robo precisa confirmar que dentro daquele container existe um elemento visivel com a dimensao esperada do formato.

Exemplos:

- `970x250` so pode passar se medir iframe/container compativel com `970x250`;
- `728x90` pode aparecer dentro de um container maior, mas o iframe precisa ter altura de `90` e largura compativel;
- `300x250` mobile pode aparecer dentro de um container de largura maior, mas precisa preservar a altura de `250`;
- `320x50` precisa medir iframe real `320x50`.

## Heuristica de fallback

Quando o seletor falha, o script procura:

- `iframe`;
- `img`;
- `div[id*="google"]`;
- `ins`;
- `div[class*="ad"]`;
- `div[id*="banner"]`.

Depois compara tamanho do elemento com `width` e `height` esperados.

## Tolerancia

- Formatos normais: cerca de 10% de tolerancia.
- Formatos pequenos: cerca de 20% de tolerancia.
- Formatos horizontais pequenos podem aceitar container um pouco mais largo se a altura bater, porque o site centraliza alguns iframes dentro de containers maiores.

## Falha aprendida na sessao CAESB

Sintoma: a campanha era cadastrada e enviada para captura, mas nenhum print aparecia.

Causa: em alguns previews, principalmente `970x250` e `300x600`, o desktop nao carregava o slot correto antes da validacao. Em outros casos, o selector existia, mas o elemento medido nao correspondia ao formato esperado.

Fix aplicado:

- desktop tambem faz warm-up por scroll antes de validar slots;
- o fluxo de selector mede elementos internos antes de aceitar sucesso;
- se a dimensao estiver errada, o sistema registra o mismatch e usa a heuristica de fallback;
- o worker prioriza campanhas `QUEUED` e nao fica pegando campanhas antigas `PENDING` antes da fila nova.

## Consequencia

Se a URL preview renderizar um criativo de tamanho diferente do formato selecionado, o robo toma decisoes erradas:

- mira no selector errado;
- ignora o criativo certo;
- aceita fallback errado;
- centraliza a area errada;
- gera print final incorreto.
