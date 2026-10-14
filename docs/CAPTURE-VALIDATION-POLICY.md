# Política de validação da captura — primeira publicação

## O que muda

- O formato precisa corresponder às dimensões cadastradas, com tolerância de 2% por eixo e mínimo de 2 CSS pixels para arredondamento.
- Um seletor explícito não pode continuar com dimensões incompatíveis nem trocar silenciosamente para outro anúncio da página.
- Ter uma caixa do tamanho correto ou uma screenshot acima de determinado tamanho em KB não comprova criativo. Esses atalhos foram removidos.
- Imagem carregada com pixels pintados, canvas pintado, vídeo com frame disponível, texto visível e conteúdo de iframe inspecionado são sinais aceitos. Criativos brancos e sem texto continuam válidos.
- Elementos transparentes, escondidos, fora do slot, recortados ou sem conteúdo confirmado não geram SUCCESS. A validação se repete depois do atraso configurado, imediatamente antes da screenshot.
- Frames aninhados são inspecionados com limites de profundidade e quantidade. Conteúdo inconclusivo retorna falha transitória classificada; a fila decide retentativas e eventual estado FAILED. Esta etapa não cria um novo fluxo de revisão humana no banco.

## Imagens de CDN sem CORS

Quando o navegador não permite ler os pixels da imagem por canvas, a verificação utiliza duas screenshots temporárias do mesmo elemento já carregado, sobre fundos preto e branco. A comparação separa pintura da imagem da transparência total. Os estilos de imagem e ancestrais são restaurados em `finally`; os buffers não são enviados ao storage.

O teste positivo usa dois servidores locais em origens diferentes, sem CORS. Confirma uma imagem branca opaca, recusa uma totalmente transparente, verifica restauração exata do HTML e comprova que a inspeção não solicita o asset novamente. Os buffers são decodificados em um contexto neutro descartável do mesmo Chromium, fechado em `finally`, para respeitar portais cuja CSP proíbe imagens `data:`. A CSP do portal não é desabilitada. Não há nova API paga nem duplicação dos arquivos armazenados.

Probes com erro, imagem muito pequena, pintura insuficiente ou estilos não suportados ficam inconclusivos. CSS masks/clip-path e canvas WebGL sem leitura segura não recebem confirmação automática. A política pode exigir ajustes por portal, baseados em evidências, sem reintroduzir os atalhos de dimensão/KB. Para imagens muito esparsas, a amostragem pode pedir nova conferência em vez de aceitar material vazio.

## Interrupção, posse e persistência

`saveCapture` verifica aborto e posse antes do upload e novamente dentro da transação que grava Capture, atualiza Campaign e confirma o WorkerJob. Chamadas antigas sem token não podem alterar uma campanha PROCESSING/com runId nem campanha com WorkerJob ativo. Retentativas de jobs estruturados pertencem exclusivamente à fila, sem multiplicação por retries internos.

Cada artefato tem chave PNG com UUID. O Supabase recebe `upsert:false`. Se uma tentativa abortar ou perder posse, a limpeza só pode remover o objeto exclusivo dessa tentativa, sem sobrescrever/apagar evidência anterior. Em falha ambígua de banco, o objeto é conservado para reconciliação; não é apagado às cegas.

Erros de log posteriores ao commit não transformam sucesso já confirmado em retentativa. Falhas transitórias não limpam a posse: a fila faz a transição com sua própria verificação. Quarentena é gravada sob posse e suas notificações só ocorrem após o commit.

## Integridade e origem

O artefato publicado continua com a moldura atual. `auditNotes` passa a registrar modo `OBSERVED`, `MODIFIED_PREVIEW` ou `ASSEMBLY`, hashes SHA-256 do buffer anterior à moldura e do arquivo final quando aplicável, e `rawPreserved:false`.

**Hash não equivale a preservar o arquivo bruto.** Nesta publicação não existe uma cópia física adicional do screenshot sem moldura. Para preview alterado, “raw” significa o buffer antes da moldura, já contendo a inserção identificada como MODIFIED_PREVIEW; não representa a página anterior à alteração. Preservação física do original e derivados sob demanda ficam para uma fase com orçamento de armazenamento/retenção definido.

A confirmação é de conteúdo visual e formato, não de identidade do anunciante, contrato ou veiculação real. Um preview inserido não comprova entrega do anúncio. Identidade automática confiável exige referência do criativo e política adicional.

## Verificação executada

- `tests/campaign-schedule.test.ts`: três regressões de data civil, data legada e virada de ano.
- `tests/capture-validation.test.ts`: controles Chromium reais de dimensões, slot vazio, branco legítimo, imagens quebradas/ocultas, canvas, texto, iframes aninhados e CDN sem CORS.
- `tests/review-creative-visibility.test.ts`: cinco controles independentes do gate, incluindo CSP restritiva, corrigidos sem relaxar as asserções.
- `tests/capture-commit.test.cjs`: dez casos de persistência/interrupção/ownership e integração do fluxo original com Chromium e servidor local. Banco/storage são mocks; o compositor decorativo é isolado nesse teste. Inclui duas capturas na mesma hora e aborto posterior preservando a primeira.

Locks/transações efetivos em Postgres, integrações de storage e a apresentação final em produção exigem seus checks próprios. Nenhum worker de produção foi disparado por estes testes.
