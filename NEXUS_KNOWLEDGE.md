# Nexus AI: Base de Conhecimento Central 🧠

Este documento serve como a "Bíblia" técnica do Adsnap Cloud, projetada para ser consumida pelo Nexus AI via RAG (Retrieval-Augmented Generation).

---

## 1. Arquitetura do Sistema
- **Frontend**: Next.js 14 (App Router) com Tailwind CSS.
- **Backend/Database**: Supabase (PostgreSQL) com Prisma ORM.
- **Engine Inteligente**: Nexus Engine hospedado em Edge Functions e acionado via GitHub Actions (para tasks de longa duração como Playwright).
- **IA**: Arquitetura Multi-Cérebro (Gemini 2.0 Flash como primário, Hy3 Tencent e Qwen Alibaba como fallbacks via OpenRouter).
- **Embeddings**: `gemini-embedding-001` (3072 dimensões) para busca semântica.
- **Auto-Evolução**: Capaz de ler e propor atualizações para seu próprio código-fonte.

## 2. Gestão de Campanhas e PIs
- **PI (Proposta de Inserção)**: O identificador mestre. Uma única PI pode ter múltiplos formatos e criativos.
- **Formatos Comuns**:
  - Desktop: 300x250, 728x90, 970x90, 970x250, 300x600.
  - Mobile: 320x50, 320x100, 300x250.
- **Status da Campanha**:
  - `PENDING`: Criada, aguardando início.
  - `QUEUED`: Enfileirada para captura.
  - `PROCESSING`: Captura em andamento no GitHub.
  - `SUCCESS`: Print capturado e salvo com sucesso.
  - `ERROR`: Falha técnica.
  - `QUARANTINE`: Falha persistente (após 3 tentativas).

## 3. O Engine de Captura (Nexus Engine)
A captura não é apenas um "screenshot", é um processo de 3 etapas:
1. **Aquecimento (Warm-up)**: O browser (Playwright) realiza um scroll inteligente para carregar banners "lazy-load".
2. **Detecção**: Um script injetado busca o banner ideal baseado em dimensões e visibilidade.
3. **Composição Estética**: O print é inserido em frames premium (iPhone 14 Pro para mobile, Windows 11 para desktop) e salvo no Supabase Storage.

## 4. Troubleshooting e Diagnóstico
- **Erro de Seletor**: Sites mudam o DOM. Se o print falhar, o Nexus deve sugerir verificar se o ID do banner mudou.
- **Timeout**: Se a página demorar mais de 60s, o Nexus aborta para poupar recursos.
- **Zero Captures**: Se uma campanha ativa não tem prints de hoje, pode ser um problema de agendamento ou o link de preview expirou no GAM (Google Ad Manager).

## 5. Multi-Cérebro e Resiliência
- **Cascata de Modelos**: Se o Gemini (Google) atingir limite de quota (Erro 429), o Nexus chaveia automaticamente para Hy3 (Tencent) ou Qwen (Alibaba) sem interrupção.
- **Seletor de Modelo**: O usuário pode forçar um modelo específico enviando `modelChoice` no corpo da requisição.

## 6. Auto-Evolução Supervisionada
- **get_nexus_source**: Permite ao Nexus ler seu código `index.ts`.
- **evolve_nexus**: Permite ao Nexus sugerir melhorias. Por segurança, a proposta é enviada ao Antigravity (Arquiteto) antes de ser aplicada em produção.

## 7. Regras de Negócio e Segurança
- **RBAC**: Somente administradores (`admin`) podem criar usuários ou gerenciar cargos.
- **Arquivamento**: Campanhas com `isArchived: true` devem ser ignoradas em relatórios de saúde.
- **AdOps vs Prints**: Prints são evidências visuais. Métricas AdOps (impressões/cliques) vêm de outra integração e são independentes.
