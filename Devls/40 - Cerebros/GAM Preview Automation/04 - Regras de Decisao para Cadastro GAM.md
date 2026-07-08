# Regras de Decisao para Cadastro GAM

Atualizado em: 2026-07-08

## Regra principal

Nunca cadastrar um preview do GAM sem confirmar o formato correspondente no Adsnap.

## Pipeline ideal

1. Abrir setup/order/line item no GAM.
2. Extrair metadados:
   - order id;
   - cliente;
   - agencia;
   - nome da campanha;
   - datas de veiculacao;
   - line items;
   - criativos;
   - tamanhos dos criativos;
   - ad units ou slots.
3. Gerar ou coletar preview URL de cada criativo.
4. Para cada preview:
   - abrir no navegador;
   - validar que renderiza;
   - medir elemento principal;
   - comparar com os formatos do Adsnap.
5. Se houver match unico, preselecionar formato.
6. Se houver multiplos matches, pedir revisao humana.
7. Se nao houver match, bloquear cadastro automatico ou marcar como pendente.
8. So depois criar campanhas no Adsnap.

## Dedupe recomendado

Evitar duplicidade por uma chave composta conceitual:

- order id;
- line item id;
- creative id;
- dimensao;
- preview URL.

## Status inicial recomendado

Para campanhas importadas do GAM:

- criar em `PENDING` ou `ACTIVE` conforme decisao do fluxo;
- salvar `segmentation=PRIVADO` como padrao fixo;
- se for para print diario, salvar `isScheduled=true`;
- salvar `scheduledTimes` padrao definido pelo operador;
- salvar `flightStart` e `flightEnd` vindos do GAM.

## Regra de segmentacao padrao

Toda Order importada do GAM deve nascer como `PRIVADO`, inclusive quando o nome da Order, agencia ou anunciante contiver termos como federal, estadual ou interno.

A segmentacao so muda quando o usuario escolhe explicitamente outra opcao no setup/revisao. O robo pode inferir agencia para preencher contexto operacional, mas nao deve inferir `segmentation`.

Pontos do sistema que seguem esta regra:

- `src/lib/gamImportPlanner.ts`: rascunho GAM usa `DEFAULT_GAM_SEGMENTATION = 'PRIVADO'`;
- `src/lib/gamJobProcessor.ts`: jobs sem segmentacao solicitada recebem `PRIVADO`;
- `src/lib/gamImportWriter.ts`: antes de criar/atualizar campanhas, normaliza a segmentacao;
- `src/components/CreateCampaignFlow.tsx`: painel de importacao GAM inicia em `Privado`;
- `src/app/nexus/actions.ts` e `src/lib/telegramBot.ts`: Orders enviadas por chat ou Telegram registram `requestedSegmentation=PRIVADO`.

## Regra de seguranca operacional

Se o robo nao tiver certeza do formato, nao deve inventar. Deve mostrar uma tela de revisao.

## Regra do site de preview

Ao gerar preview "No site" no Google Ad Manager, usar `metropoles.com` como site/ambiente de preview.

Nao confundir com a URL de clique do anunciante. Exemplo observado:

- URL de clique do criativo: `https://www.caesb.df.gov.br/`
- site correto para preview/captura: `metropoles.com`

## Regra de validacao pos-preview

Depois de gerar a URL `google_preview`, abrir a URL no mesmo device em que o Adsnap vai capturar e validar se o selector do formato existe na pagina.

Validar selector sozinho nao e suficiente. O robo precisa medir o elemento real renderizado no slot e comparar com a dimensao do formato escolhido no Adsnap.

Se o selector do formato existir, mas o iframe/criativo medido estiver com outra dimensao, o cadastro deve ser bloqueado ou marcado para revisao humana. Isso evita cadastrar um link de `300x600` em formato `300x250`, ou aceitar um slot vazio/lazy-load como sucesso.

Exemplo aprendido na sessao CAESB:

- O preview `320x50` em `metropoles.com` renderizou em slots de home.
- O formato Adsnap existente `Banner horizontal mobile` aponta para `div-gpt-ad-saude-horizontal-1`.
- Como esse selector nao existe na home, o cadastro automatico precisa bloquear ou pedir decisao humana antes de criar a campanha.

## Regra para formatos mobile 320

Para formatos `320x50` e `320x100`:

- usar o preview "No site" com `metropoles.com/saude`;
- cadastrar no Adsnap com os formatos mobile ja configurados:
  - `Banner horizontal mobile (320x50)`;
  - `Banner horizontal grande mobile (320x100)`;
- abrir e capturar sempre em device mobile;
- aguardar alguns segundos para lazy load se o banner nao aparecer imediatamente;
- o selector esperado para estes formatos hoje e `div-gpt-ad-saude-horizontal-1`.

Esses formatos nao aparecem no desktop; se o robo abrir em desktop, a validacao sera enganosa.

## Regra para 300x250

Formatos `300x250` precisam ser adicionados no sistema tambem como `mobile`.

No cadastro automatico, quando houver criativo `300x250`:

- validar/cadastrar pelo menos uma entrada mobile;
- usar preview base `metropoles.com`;
- nao precisa gerar link personalizado por editoria como acontece com `320x50` e `320x100`;
- usar o selector Adsnap apropriado para o slot escolhido (`home-quadrado-0` ou `home-quadrado-1`, ambos aceitos quando o operador disser que qualquer um funciona);
- abrir o preview em contexto mobile para garantir que o iframe `300x250` aparece antes de salvar.

Mesmo quando o container mobile medir largura maior que `300`, a validacao pode aceitar se a altura estiver correta em `250` e houver iframe/criativo visivel compativel com o formato.
