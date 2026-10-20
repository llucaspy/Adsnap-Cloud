# Correção das regressões de captura

## Falhas reproduzidas

- PI 000: os previews mobile de 320x50 e 320x100, na editoria Mundo, usavam o seletor global de Saúde. A confirmação estrita do alvo impedia ambos de gerar imagens.
- Criativos HTML5: anúncios visíveis compostos por camadas `background-image` não eram reconhecidos como conteúdo pelo validador, mesmo com as imagens carregadas. Foram reproduzidas 18 ocorrências das campanhas PI 279733 / 279.733.
- Retângulo desktop: o cadastro compartilhado apontava para o slot mobile `home-quadrado-0`, oculto no desktop. A alternativa responsiva existente anteriormente estava condicionada a dimensões e tinha sido removida junto com o mapeamento.

## Correção

O seletor de um slot GPT por editoria pode ser resolvido para a mesma posição na editoria da URL atual, somente quando o alvo cadastrado está ausente e existe um único slot registrado com identidade e caminho de unidade compatíveis. O inicializador assíncrono do GPT é aguardado por até cinco segundos. Seletores personalizados não recebem fallback genérico; um alvo existente e visível continua sendo respeitado.

O slot de retângulo mobile `home-quadrado-0`, quando oculto no desktop, pode usar a posição responsiva desktop `home-quadrado-1`, desde que ela esteja registrada no GPT e visível. A decisão usa dispositivo e identidade do slot, sem consultar dimensões cadastradas nem procurar anúncios arbitrários.

O validador reconhece camadas de fundo CSS visíveis, substanciais e com imagem decodificada/pixels confirmados. Imagens de fundo transparentes, quebradas, ocultas ou fora do recorte não aprovam um slot vazio. A prova temporária usa a mesma política de rede/CSP do documento e é removida antes do print. Imagens sem CORS usam a verificação existente de opacidade renderizada; o CSP não é relaxado. A composição final e a captura observada continuam separadas nos metadados.

Não foi reintroduzido mapeamento por largura/altura ou inferência de dispositivo pelo tamanho. As proteções de rede, sandbox, posse da tarefa, confirmação de armazenamento e cancelamento permanecem.

## Verificação antes da publicação

- 112 testes locais aprovados, com oito novos testes para as regressões e suas negativas.
- 12 integrações com PostgreSQL real isolado aprovadas.
- Build local de produção, typecheck do worker e lint focado aprovados.
- Os dois previews do PI 000 geraram imagens reais do portal com o código atual; os banners 320x50 e 320x100 foram conferidos visualmente.
- 18/18 capturas de previews reais de PI 279733 / 279.733 passaram com HTML5 e camadas CSS.
- Uma captura real de retângulo desktop confirmou o uso da posição responsiva correta.

Essas capturas de portal usaram banco e provider de armazenamento simulados, com imagens locais. Isso confirma seleção e renderização; não é apresentado como execução/upload cloud. Os resultados reais do worker de produção são registrados separadamente após publicar e reprocessar os alvos.

## Recuperação

Reprocessar primeiro os dois formatos ausentes do PI 000 e confirmar o armazenamento das imagens. Em seguida, recuperar somente os registros afetados ainda dentro do flight: 18 HTML5 e cinco retângulos desktop. Uma sexta ocorrência de retângulo tem flight encerrado em 05/10 e não deve ser reaberta pelo lote de recuperação. Os demais erros históricos de junho/julho permanecem como histórico e não comprovam regressão desta publicação.
