Crie um fundo animado em canvas que reproduza o comportamento visual do efeito de partículas radiais usado em interfaces modernas. O sistema deve simular um campo vetorial radial com leve rotação, onde centenas de partículas orientadas se movem em torno de um centro virtual da tela e respondem suavemente ao movimento do cursor.

Estrutura do sistema:

Utilize um único canvas HTML ocupando 100% da viewport.

O canvas deve ser renderizado usando requestAnimationFrame para garantir atualização contínua a aproximadamente 60fps.

Quantidade de partículas:

Inicialize entre 700 e 900 partículas.

Cada partícula deve possuir as seguintes propriedades internas:

* posição x
* posição y
* velocidade vx
* velocidade vy
* ângulo de orientação
* tamanho base
* profundidade (depth factor)
* cor
* distância ao centro
* velocidade angular

Distribuição inicial das partículas:

As partículas devem ser distribuídas radialmente ao redor do centro da tela.

Use coordenadas polares:

* escolha um ângulo aleatório entre 0 e 2π
* escolha um raio aleatório entre 0 e metade da diagonal da tela

Converta para coordenadas cartesianas:

x = centerX + cos(angle) * radius
y = centerY + sin(angle) * radius

Orientação inicial:

Cada partícula deve apontar aproximadamente na direção radial (para fora do centro), mas com pequena variação aleatória.

Campo vetorial base:

O movimento das partículas deve seguir um campo vetorial radial com leve rotação tangencial.

Para cada frame:

1. calcule o vetor da partícula em relação ao centro da tela

dx = particle.x - centerX
dy = particle.y - centerY

2. calcule a distância ao centro

dist = sqrt(dx² + dy²)

3. normalize esse vetor

nx = dx / dist
ny = dy / dist

4. calcule o vetor tangencial perpendicular

tx = -ny
ty = nx

5. combine os vetores radial e tangencial

flowX = nx * radialStrength + tx * swirlStrength
flowY = ny * radialStrength + ty * swirlStrength

radialStrength deve ser pequeno (exemplo 0.02)

swirlStrength deve ser menor ainda (exemplo 0.01)

Isso cria o efeito de partículas apontando para fora enquanto giram levemente ao redor do centro.

Atualização de velocidade:

Use interpolação suave para atualizar a velocidade da partícula.

particle.vx += (flowX - particle.vx) * 0.05
particle.vy += (flowY - particle.vy) * 0.05

Atualize posição:

particle.x += particle.vx * depth
particle.y += particle.vy * depth

Sistema de profundidade:

Cada partícula deve ter um fator de profundidade entre 0.5 e 1.5.

Esse fator deve afetar:

* velocidade
* tamanho
* opacidade

Partículas com depth maior parecem mais próximas.

Interação com o mouse:

Capture continuamente a posição do cursor usando mousemove.

Defina um raio de influência de aproximadamente 180px.

Para cada partícula dentro desse raio:

1. calcule vetor do cursor até a partícula

dx = particle.x - mouseX
dy = particle.y - mouseY

2. calcule distância

d = sqrt(dx² + dy²)

3. normalize vetor

nx = dx / d
ny = dy / d

4. calcule intensidade

force = (interactionRadius - d) / interactionRadius

5. aplique força de repulsão

particle.vx += nx * force * 0.3
particle.vy += ny * force * 0.3

Essa força deve se dissipar naturalmente pelo sistema de interpolação.

Desenho das partículas:

As partículas não devem ser círculos.

Cada partícula deve ser desenhada como um pequeno segmento orientado na direção de sua velocidade.

Calcule o ângulo:

angle = atan2(particle.vy, particle.vx)

Comprimento do traço:

entre 2px e 6px dependendo do depth.

Use lineTo para desenhar o segmento alinhado com esse ângulo.

Sistema de cores:

As cores devem variar suavemente dependendo da posição angular da partícula em torno do centro.

Calcule o ângulo polar da partícula:

theta = atan2(dy, dx)

Use esse ângulo para mapear cores em um espectro circular:

* azul
* roxo
* vermelho
* laranja
* amarelo

Interpole suavemente entre essas cores.

Isso cria o efeito de gradiente radial colorido visto no fundo.

Motion trails:

Não limpe o canvas completamente.

Use um fill com alpha baixo (exemplo rgba(255,255,255,0.05)) para criar rastros suaves de movimento.

Reinserção de partículas:

Se uma partícula sair muito além da área visível, reposicione-a novamente próxima ao centro usando nova coordenada polar aleatória.

Performance:

Evite objetos temporários dentro do loop de renderização.

Use arrays simples e cálculos diretos para manter desempenho alto.

Resultado esperado:

O fundo deve parecer composto por centenas de pequenos traços coloridos organizados radialmente que apontam para fora do centro e se movem em padrões suaves e orgânicos. O sistema deve reagir ao movimento do cursor criando perturbações fluidas no campo de partículas, semelhante ao comportamento visual encontrado em interfaces modernas de alta qualidade.
