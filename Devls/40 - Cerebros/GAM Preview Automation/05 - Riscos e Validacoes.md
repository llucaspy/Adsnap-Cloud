# Riscos e Validacoes

Atualizado em: 2026-06-18

## Riscos principais

- Preview 300x600 cadastrado como 300x250.
- Preview 300x250 cadastrado no slot errado de 300x250.
- Criativo mobile cadastrado como desktop.
- Preview vazio ou sem renderizacao real.
- Link expirado ou dependente de sessao.
- Line item com varios criativos, mas o crawler pegar so o primeiro.
- GAM mudar labels/selectors da interface.
- Datas de veiculacao lidas da Order quando o Line Item tem datas especificas diferentes.
- Cadastro duplicado do mesmo criativo.
- Asset HTML5 em camadas confundido com imagem estatica completa.
- Slot com dimensao correta fotografado antes de o criativo estabilizar.

## Validacoes minimas antes de salvar

- URL e HTTP acessivel.
- Preview abre no Playwright.
- Existe elemento visual candidato.
- Dimensao renderizada bate com formato.
- Device esperado bate com formato.
- Seletor configurado existe ou fallback encontra candidato coerente.
- Dados basicos de campanha estao preenchidos.
- Datas de veiculacao fazem sentido.
- Asset direto e realmente uma imagem unica, nao uma camada numerada.
- Slot permanece visualmente valido depois da janela minima de renderizacao.

## Validacao visual desejada

Antes de criar a campanha, gerar um preview temporario da captura e mostrar para revisao.

O operador deve conseguir ver:

- formato detectado;
- formato selecionado;
- dimensao medida;
- selector/ad unit;
- screenshot de amostra.

## Criterio de bloqueio

Bloquear cadastro automatico quando:

- dimensao nao bate;
- mais de um formato possivel existe;
- nenhum criativo renderiza;
- preview depende de login de forma instavel;
- nao ha data de veiculacao confiavel.
