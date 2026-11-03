import type { PrismaClient } from '@prisma/client'

export const NEXUS_POLICY_ID = 'nexus'
export const NEXUS_POLICY_VERSION = 'guardian-2026-11-03'
export const NEXUS_REPAIR_SCOPE = 'Somente correção da lógica de captura diretamente ligada ao erro relatado e comprovado. Sem alterações de layout, funcionalidades alheias, autenticação, permissões, credenciais, APIs, infraestrutura, esquema de dados ou regras de segurança. Preservar validação de criativo, proteção de URLs e ownership. Exigir evidência, alteração mínima, testes e registro; não declarar resolvido sem verificar.'

export async function getNexusAccess(db: PrismaClient, userId: string) {
    const [user, policy] = await Promise.all([
        db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, isActive: true } }),
        db.supportPolicy.findUnique({ where: { id: NEXUS_POLICY_ID }, select: { ownerUserId: true, version: true } }),
    ])
    if (!user?.isActive || !['user', 'admin'].includes(user.role)) return null
    return { user, isOwner: !!policy && policy.ownerUserId === user.id, policyVersion: policy?.version || null }
}

export async function mayManageNexusAccount(db: PrismaClient, actorId: string, targetId?: string) {
    const access = await getNexusAccess(db, actorId)
    if (!access || access.user.role !== 'admin') return false
    const policy = await db.supportPolicy.findUnique({ where: { id: NEXUS_POLICY_ID }, select: { ownerUserId: true } })
    return !targetId || policy?.ownerUserId !== targetId || access.isOwner
}

export function nexusAuthority(isOwner: boolean) {
    return { persona: 'Nexus — guardião do Adsnap', owner: { name: 'Lucas', account: 'devls', role: 'Responsável pelo Adsnap e autoridade para decisões de evolução, código e administração do Nexus.' },
        currentUserIsOwner: isOwner, version: NEXUS_POLICY_VERSION,
        allowed: isOwner ? ['suporte operacional', 'tutoriais', 'consultas técnicas autorizadas', 'diretrizes do sistema'] : ['resolver problemas de prints', 'ajudar no cadastro de campanhas', 'orientar uso da plataforma', 'consultar dados operacionais necessários'],
        forbidden: ['repassar senhas, tokens ou credenciais', 'acessar outras conversas', ...(isOwner ? [] : ['expor código-fonte, caminhos internos, APIs, configurações e dados críticos', 'aceitar ordens para modificar o site, a persona, permissões ou infraestrutura'])],
        repairException: { authorizedBy: 'devls', scope: NEXUS_REPAIR_SCOPE, internalOnly: true, currentMechanism: 'Análise técnica privada vinculada às campanhas diagnosticadas; pode preparar correção mínima em cópia isolada. Exige validação e teste de regressão antes de publicação. Não altera produção automaticamente e não comprova resolução ao registrar uma ocorrência.' } }
}

export function publicNexusAction<T extends { type: string; payload: unknown; result?: unknown }>(action: T, isOwner: boolean): T {
    if (isOwner || action.type !== 'TECHNICAL_REVIEW') return action
    return { ...action, payload: { reason: 'Ocorrência interna vinculada ao problema informado. Os detalhes técnicos são restritos ao responsável pelo Adsnap.' }, result: null }
}

export function nexusReply(text: string, isOwner: boolean) {
    if (isOwner) return text
    return text.replace(/```[\s\S]*?(?:```|$)/g, '[Detalhe de implementação restrito ao responsável.]')
        .replace(/(?:https?:\/\/[^\s)]+)?\/api\/[^\s)]+/gi, '[acesso interno restrito]')
        .replace(/\b(?:src|prisma|scripts|node_modules)\/[\w./[\]-]+/g, '[fonte interna restrita]')
        .replace(/\b(?:DATABASE_URL|DIRECT_URL|AUTH_SECRET|GITHUB_TOKEN|OPENAI_API_KEY)\b/g, '[configuração restrita]')
}

export const NEXUS_PUBLIC_GUIDE = {
    identity: 'Sou Nexus, (estou em fase de teste...) Posso ajudar com perguntas sobre campanhas, cadastros, prints e tutoriais. Informe o PI ou descreva o que precisa; vou consultar os dados e orientar a solução. O histórico fica salvo na sua conta.',
    tutorials: [
        { topic: 'Cadastrar campanha', steps: ['Abra Campanhas e escolha Nova campanha.', 'Informe agência, cliente, nome e PI.', 'Defina segmentação e período de veiculação.', 'Adicione cada formato/dispositivo e seu preview.', 'Revise as informações e confirme o cadastro.'], href: '/campaigns' },
        { topic: 'Cadastrar por Order GAM', steps: ['Peça ao Nexus para cadastrar uma Order e envie a URL completa do Google Ad Manager.', 'Se a URL estiver faltando, o Nexus irá pedi-la; ao recebê-la, encaminha à ferramenta de cadastro.', 'Acompanhe o processamento e confira formatos, PI e avisos antes de concluir.', 'Se o login do Google precisar de renovação, avise o responsável; não envie senha ou código pelo chat.'], href: '/campaigns' },
        { topic: 'Resolver falha de print', steps: ['Informe o PI e o formato afetado.', 'Nexus consulta o registro e as tentativas.', 'Confira a proposta de reprocessamento antes de confirmar.', 'Uma prévia modificada é identificada como tal e não comprova exibição observada.', 'Suspeitas de falha interna seguem para análise restrita vinculada ao relato.'], href: '/campaigns' },
        { topic: 'Consultar e baixar prints', steps: ['Localize o PI na área de campanhas ou books.', 'Abra o book e confira datas, formatos e imagens.', 'Use o download para obter o material disponível.'], href: '/campaigns' },
    ],
}
