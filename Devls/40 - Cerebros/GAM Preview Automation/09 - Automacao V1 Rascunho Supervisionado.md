# Automacao V1 - Rascunho Supervisionado

Atualizado em: 2026-06-17

## Decisao de arquitetura

A primeira automacao oficial nao cadastra direto sem revisao. Ela cria um rascunho supervisionado a partir da Order do GAM.

Fluxo:

1. operador cola link da Order do GAM;
2. sistema cria job `JOB_GAM_PENDING`;
3. worker abre o GAM com sessao autenticada;
4. crawler extrai order, line items, criativos, tamanhos e previews;
5. planner converte dados crus em rascunho Adsnap;
6. rascunho fica em `JOB_GAM_REVIEW`;
7. operador carrega o rascunho no Novo Setup;
8. cadastro final usa o botao normal de ativacao.

## Arquivos criados

- `src/lib/gamImportPlanner.ts`
  - contem as regras GAM -> Adsnap;
  - escolhe PI;
  - limpa nome de campanha;
  - infere agencia/segmentacao;
  - mapeia dimensao para formato Adsnap;
  - duplica `300x250` para mobile;
  - forca `320x50` e `320x100` para `metropoles.com/saude`.

- `src/lib/gamImportWriter.ts`
  - cria campanhas a partir de rascunho aprovado;
  - deduplica por `externalCampaignId`, formato, device e URL;
  - preserva `externalAuthUrl` com link da Order.

- `src/scripts/gam-import-supervised.ts`
  - executor local para testar uma Order via terminal;
  - por padrao apenas imprime rascunho;
  - so cadastra se rodar com `--apply`.

## Arquivos alterados

- `src/lib/gamCrawlerService.ts`
  - deixa de retornar `DETECTED`;
  - passa a buscar criativos por line item;
  - extrai tamanho real do criativo;
  - gera preview com base correta:
    - home: `metropoles.com`;
    - formatos 320 mobile: `metropoles.com/saude`.

- `src/app/actions.ts`
  - aceita `externalCampaignId` e `externalAuthUrl` em `createMultipleCampaigns`;
  - cria jobs de rascunho via `requestGamImportDraft`;
  - lista rascunhos via `getGamImportDrafts`;
  - aplica rascunho via `createCampaignsFromGamDraftAction`.

- `src/components/CreateCampaignFlow.tsx`
  - adiciona painel `Importar GAM`;
  - carrega rascunho no wizard;
  - mantem revisao humana antes de salvar.

- `src/scripts/worker.ts`
  - job GAM agora gera `JOB_GAM_REVIEW`;
  - nao cria campanhas diretamente.

## Credenciais

Nao salvar login/senha em arquivo versionado.

Opcoes seguras:

- usar uma sessao local persistida em `.gam-session/`;
- passar `GAM_USER` e `GAM_PASS` apenas no ambiente de execucao;
- usar `GAM_USER_DATA_DIR` para apontar uma sessao local ja autenticada.

`.gam-session/` foi adicionada ao `.gitignore`.

## Regra critica

O rascunho pode conter entradas `review`. Isso nao e erro.

Exemplo: `300x250` mobile entra como `review` porque e uma duplicacao operacional deliberada, nao um formato separado vindo do GAM.

Itens sem regra ou sem formato Adsnap devem ir para `blockedItems`.

## Aprendizado da Order 4097107199

Em 2026-06-17, o primeiro job de producao retornou `Cliente Desconhecido` com zero formatos. A causa foi uma falsa deteccao de sessao: `https://admanager.google.com/home` e uma pagina publica e nao prova que o usuario esta autenticado.

Regras adicionadas:

- testar login pela URL da rede `https://admanager.google.com/{networkCode}`;
- reconhecer os campos atuais `identifierId` e `Passwd`;
- nunca transformar zero line items em `JOB_GAM_REVIEW`;
- nunca aceitar rascunho com zero `mediaEntries` e zero `blockedItems`;
- senha de app do Gmail nao autentica o GAM no navegador;
- GitHub Actions usa runner descartavel e pode exigir 2FA em cada execucao, mesmo com usuario e senha validos.

Conclusao arquitetural: a automacao desassistida precisa de uma sessao de navegador persistente em ambiente controlado ou de uma integracao oficial que nao dependa do login web. Nao armazenar codigos de backup nem tentar contornar 2FA.

## Criativo confiavel e variacao geografica

O preview on-site do GAM pode conter os IDs corretos de line item e criativo e, ainda assim, o fornecedor terceirizado `00px` entregar outra campanha por regras proprias de geolocalizacao ou segmentacao. Validar apenas URL, status HTTP e dimensao nao garante que o print tenha a identidade visual certa.

Fluxo seguro aprendido com a Order 4097107199:

1. abrir o preview autenticado do criativo no GAM;
2. localizar nos frames internos o asset com a dimensao exata do formato;
3. preferir o asset servido por `cdn.00px.net` quando houver;
4. salvar `creativeAssetUrl` no rascunho e em `Campaign.compositionBox`;
5. abrir a pagina e executar normalmente o scroll e a deteccao do slot;
6. injetar novamente o asset confiavel no slot depois do scroll final, pois o GPT pode atualizar o anuncio durante a navegacao;
7. validar visualmente a marca e a mensagem do criativo, nao apenas o tamanho.

Depois que `creativeAssetUrl` foi salvo, as coletas diarias nao precisam autenticar novamente no GAM. A sessao persistente continua necessaria para importar novas Orders ou atualizar criativos.

## Sessao remota sem servidor dedicado

Em 2026-06-18, a sessao GAM passou a ser reutilizavel em runners descartaveis:

1. o login supervisionado acontece uma vez no perfil local `.gam-session/`;
2. o Playwright exporta cookies e storage state, incluindo IndexedDB;
3. o estado e cifrado com AES-256-GCM antes de sair do processo;
4. somente o blob cifrado e enviado para `adsnap-private/gam/{networkCode}/storage-state.enc`;
5. o bucket do Supabase deve permanecer privado;
6. o GitHub Actions baixa e decifra o estado em memoria;
7. o crawler abre um contexto efemero autenticado e, ao terminar, grava a sessao renovada;
8. se o Google invalidar os cookies, o job retorna `GAM_SESSION_EXPIRADA` e exige novo login supervisionado.

A chave e derivada de `GAM_SESSION_ENCRYPTION_KEY` quando configurada. Como compatibilidade, o worker pode deriva-la de `SUPABASE_SERVICE_ROLE_KEY`, que ja existe apenas nos ambientes protegidos. Nenhum cookie, senha ou estado descriptografado deve ser versionado ou salvo em bucket publico.

Teste validado com a Order 4097107199: um contexto sem perfil local restaurou 173 cookies do Supabase, encontrou o line item 7335019398, extraiu os quatro assets e renovou a sessao remota.
