# Codex pessoal no chat do Adsnap

O modo pessoal conecta o navegador ao Codex CLI no próprio computador. A autenticação ChatGPT permanece no CLI: nenhuma chave de API ou credencial ChatGPT é enviada à Vercel. O uso desconta dos limites da conta conectada. O conector não permite autenticação por API key e consulta o catálogo da conta para selecionar seu modelo padrão, evitando herdar um modelo incompatível da configuração local.

## Usar

1. Instale o Codex CLI oficial e entre com `codex login` usando sua conta ChatGPT.
2. Na raiz desta cópia do projeto, execute `npm run codex:personal`.
3. Entre na sua sessão do Adsnap em https://adsnap-cloud.vercel.app.
4. Abra http://127.0.0.1:47831 e clique em **Conectar meu chat do Adsnap**. Se solicitado pelo navegador, permita acesso à rede local.
5. No chat **Codex pessoal**, escolha **Consultar código** ou **Editar cópia local** e envie a mensagem.

Para testar com o Adsnap local em http://localhost:3000, execute `npm run codex:personal -- --local`.

É necessário manter o computador e o conector ligados. Ctrl+C no terminal encerra o conector. O pareamento expira em até oito horas; reiniciar o conector gera outra credencial de pareamento. O botão de desconectar remove o pareamento desta aba, sem encerrar o processo local. A credencial de pareamento é uma capacidade temporária de acesso ao executor; compartilhe apenas com sua própria sessão.

## Escopo desta versão

- Conversas com contexto mantido pelo Codex e recuperação dos eventos enquanto o conector estiver ativo. Após reiniciar o conector, esta interface começa novas conversas; ainda não há um histórico central de tarefas no banco do Adsnap.
- Leitura de código e edição local em um worktree separado, baseado no HEAD do checkout ao iniciar a primeira conversa. Alterações ainda não commitadas do checkout original não são copiadas.
- A branch `codex/personal/<identificador>` e o worktree em `.test-infra/codex-personal/<identificador>` são preservados para revisão. O conector não executa limpeza destrutiva automática.
- Uma tarefa ativa por conector. Novas conversas compartilham a mesma cópia de trabalho nessa execução, incluindo alterações locais anteriores.
- A interface mostra mensagens, progresso, encerramento e solicitações de autorização. Pode interromper uma tarefa. Operações que peçam autorização são apresentadas no chat para autorizar uma vez ou recusar; pedidos de protocolo não implementados são recusados.
- Ainda não há ferramentas para consultar os dados vivos de campanhas, Drive ou logs de produção. O assistente deve declarar essa limitação. Não há publicação automática nem pipeline de PR/deploy integrado a esta versão.

## Controles

O HTTP escuta somente em 127.0.0.1:47831. Cada processo aceita somente a origem selecionada (produção ou localhost:3000), verifica Host e endereço de origem local e exige token aleatório de 256 bits nas operações. A página de pareamento não pode ser embutida em frames. O token vai no fragmento do link, removido da URL pelo cliente; não é enviado ao servidor do Adsnap e fica apenas em sessionStorage da aba. As respostas não são cacheadas.

O subprocesso recebe um conjunto mínimo de variáveis de ambiente, sem chaves de API ou credenciais do projeto. Ferramentas MCP, plugins e aplicativos configurados no Codex do operador são desativados para essas sessões. A política do Codex restringe escrita à cópia local e começa com rede desabilitada. O modo de consulta usa sandbox de leitura. A autenticação não é um isolamento físico de leitura do computador: este é um executor pessoal de código, a ser pareado somente com uma sessão confiável. Repositórios, respostas de ferramentas e conteúdo externo devem ser tratados como dados, não como autorização para novas ações.

## Referências

- https://learn.chatgpt.com/docs/app-server
- https://learn.chatgpt.com/docs/auth
- https://developers.openai.com/siwc/quickstart

A integração local pessoal usa a autenticação do Codex instalado. Isso não confirma elegibilidade para oferecer a franquia de uma conta Plus como um serviço compartilhado ou comercial. Para uma implantação central com vários usuários, é necessário avaliar a modalidade oficial de autenticação e cobrança antes de ativar.
