# Nexus: Orders e aprendizado persistente

O suporte recebe pedidos de cadastro de Order GAM. Sem URL, Nexus pede a URL completa; depois de recebê-la, usa a ferramenta real de cadastro. A URL é restrita ao host HTTPS do Google Ad Manager e guarda somente os identificadores públicos de rede e Order. Tokens e parâmetros extras não entram na conversa. Uma Order não pode ser inventada pela ferramenta: a URL precisa ter sido enviada pelo próprio usuário na conversa atual.

O chat e o modo Comandos usam o mesmo serviço de cadastro, com trava de concorrência por rede/Order, reaproveitamento de jobs ativos e deduplicação de disparos simultâneos. Cadastro enfileirado não significa campanha já concluída. A resposta informa o estado do job e se o worker foi acionado. Credenciais ficam somente no processo servidor, fora do ambiente do modelo; não há ferramenta de chamada arbitrária de APIs.

## Memória

Após respostas concluídas, Nexus guarda temas recorrentes e preferências explícitas em uma memória persistente da própria conta. Quando uma operação de captura tem resultado confirmado, pode guardar uma lição operacional revisada. Os textos são de um catálogo limitado: o modelo e o usuário não podem gravar instruções arbitrárias, segredos, código, URLs privadas, PIs, contagens ou estados transitórios nessa memória.

A cada pergunta, a memória é consultada junto com o panorama atual. Serve para adaptar orientações e recuperar procedimentos úteis; números e estados continuam vindo do banco. A memória não muda autoridade, permissões nem a persona, não substitui evidências e não treina os pesos do modelo. Cada conta enxerga somente sua memória, sem compartilhar aprendizados pessoais entre usuários.

O usuário pode perguntar “O que você lembra das minhas perguntas?” e pedir “Apague minha memória”. A exclusão é limitada à conta, não apaga o histórico e cria uma barreira para que eventos antigos não recriem silenciosamente os aprendizados apagados. Preferências novas podem ser aprendidas em perguntas posteriores.

SupportMemory tem RLS e revogação de acesso dos papéis de navegador. A origem é uma resposta concluída e é excluída em cascata quando a origem/conta é removida. Conteúdo inesperado no banco é ignorado; chaves reconhecidas sempre retornam o texto revisado atual.
