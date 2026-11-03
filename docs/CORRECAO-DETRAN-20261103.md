# DETRAN-DF / PI 385592 — recuperação do preview atual

## Causa confirmada

Quatro registros ativos estavam sem captura: Billboard desktop, Halfpage desktop, Retângulo mobile e banner horizontal mobile. A atualização dos links não removeu a causa: o carregador Space/00px retornava HTTP 403 com HTML dentro do runner. O SDK da CDN retornava 200, mas o criativo não era entregue. Diagnóstico sem captura: execução 41696224541.

## Recuperação restrita

A recuperação depende da opção de campanha compositionBox.allowVerifiedPackagePreview=true, desabilitada por padrão. Ela será habilitada somente nos quatro registros desta solicitação. Captura nativa confirmada continua com OBSERVED; se faltar conteúdo, a recuperação exige um preview GAM e inspeciona apenas o slot selecionado e seus frames.

O reconhecimento exige o SDK da Space e um único criativo. A resposta do carregador deve declarar campanha, criativo e placement iguais aos da tag e apontar o documento correspondente na CDN. Se o carregador responder 403 ou vazio, a consulta do pacote público pelo ID da própria tag exige que o HTML declare a mesma base de recursos e uma raiz reconhecida. Conteúdo divergente, destino estranho, identidade ambígua, credenciais na URL e documentos sem confirmação são recusados.

Os IDs são obtidos novamente do preview em cada execução. Não há cache de um pacote antigo ao alterar o link. A evidência registra packagePreview com o ID do criativo Space, ID do criativo GAM, documento e origem da descoberta. Esse caminho é MODIFIED_PREVIEW, não prova de veiculação observada.

O template BannerBolt desta campanha usa #palco. O renderizador passa a medir também essa raiz no próprio documento para preservar o criativo completo. Não consulta tamanhos de catálogo nem seleciona anúncios por dimensão.

## Verificações

O teste de navegador cobre troca de preview/criativo, bloqueio 403, resposta vazia, ausência de habilitação e anúncio de outro slot. Os testes do parser recusam identidades e destinos divergentes. A reprodução de leitura encontrou os quatro pacotes usando os previews atualizados.

A suíte completa local de referência passou com 126 testes; o cenário adicional de resposta vazia foi submetido ao teste de navegador e ao CI da publicação. Typecheck e lint dos arquivos novos passaram. A conclusão da recuperação requer conferir arquivos, hashes e jobs dos quatro registros na nuvem, registrada separadamente após o reprocessamento.
