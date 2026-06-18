# Relatorios finais de Governo Federal

## Escopo

- Somente campanhas com `segmentation = GOV_FEDERAL` sao elegiveis.
- Os destinatarios sao configurados globalmente no Admin.
- Destinatarios iniciais:
  - opec.gov@metropoles.com
  - karoliny.sousa@metropoles.com

## Modos de envio

- Manual: o administrador usa `Enviar agora` na campanha desejada.
- Automatico: o worker envia no dia seguinte ao fim da veiculacao, no horario BRT configurado.
- Ativar o automatico nao envia campanhas encerradas antes da ativacao.

## Anexos

- Todos os prints `SUCCESS` dentro do periodo da campanha sao baixados pelo worker.
- Os arquivos sao organizados por data e formato dentro de um ZIP.
- O limite seguro por e-mail e 16 MB de arquivos antes da compactacao, considerando o overhead do Gmail.
- Campanhas maiores sao divididas em e-mails numerados para respeitar o limite do provedor.

## Seguranca operacional

- Vercel apenas enfileira; o GitHub Actions monta e envia os anexos.
- O envio usa o mesmo SMTP Gmail do projeto Dash (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
- O historico usa a chave unica `PI + data final`.
- Cada parte enviada e persistida antes de continuar para reduzir duplicidade em retomadas.
- Reenvios manuais incrementam a versao.
- O automatico tenta novamente no maximo tres vezes.
