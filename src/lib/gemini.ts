import type { EmailMessage } from './gmail'
import * as brain from './nexusBrain'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent'

export interface ActionData {
    action: string | null
    params: Record<string, unknown>
    answer?: string
}

export interface NexusBrainResult {
    message: string
    success: boolean
    actionPerformed?: 'CAPTURE' | 'CAPTURE_ALL' | 'ARCHIVE' | 'REGISTRATION_PREVIEW' | 'UPDATE_URL'
    data?: unknown
}

export async function nexusBrain(prompt: string): Promise<NexusBrainResult> {
    const apiKey = process.env.GEMINI_API_KEY || ''
    if (!apiKey) return { message: 'GEMINI_API_KEY não configurada', success: false }

    const systemPrompt = `Você é o Nexus, o núcleo de inteligência do Adsnap Cloud. 

SUA MISSÃO: Garantir precisão absoluta e fornecer informações detalhadas sobre as campanhas.
CONHECIMENTO DO SISTEMA:
- Campanhas (Campaigns): Entidade principal. Têm Status (ACTIVE, PENDING, ARCHIVED), PI (identificador numérico como "991"), Cliente (Client), Formato, URL, Dispositivo (Mobile/Desktop) e Segmentação.
- Capturas (Captures): Registros de screenshots. Cada campanha tem um histórico de capturas.
- AdOps BI: Métricas de desempenho (Viewability, Entrega, Projeção).

FERRAMENTAS DISPONÍVEIS:
- searchCampaigns(query) - BUSCA campanhas por Nome ou PI. Use SEMPRE que o usuário mencionar uma campanha pelo nome ou número sem você saber o ID UUID.
- getCampaign(idOrPi) - Detalhes completos de UMA campanha. Retorna status, flight, link e últimas capturas.
- listCampaigns({status?, archived?}) - Listagem geral (50 mais recentes).
- getAdOpsSummary() - Análise de BI global (Dashboard). Use para perguntas sobre "saúde do sistema" ou "resumo geral".
- createCampaign({...}) - Registrar nova.
- archiveCampaign(id) - Arquivar.
- runCapture(campaignId) - Disparar print manual.
- getLogs(limit?) - Histórico de eventos técnicos.

INSTRUÇÕES DE RESPOSTA:
1. Pense antes de agir. Se a pergunta for sobre uma campanha específica ("Como está a Pé de meia?"), sua primeira ação deve ser buscar (searchCampaigns ou getCampaign).
2. Responda em JSON válido: {"action": "ferramenta", "params": {...}, "answer": "Sua intro/análise"}
3. **DIRETO AO PONTO**: Nunca diga "vou verificar" se você já está chamando a ferramenta. O resultado da ferramenta será exibido para o usuário logo abaixo da sua resposta.
4. Se o usuário perguntar algo genérico, use action: null.
5. Responda sempre em PORTUGUÊS.

PERGUNTA: "${prompt}"

    CRITICAL: Se a pergunta for sobre uma campanha específica, você DEVE usar uma das ferramentas (searchCampaigns ou getCampaign). Nunca responda sobre uma campanha com action: null se puder buscar os dados reais.`

    async function callGemini(text: string): Promise<string> {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 20000)
        try {
            console.time('[Gemini Fetch]')
            const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text }] }] }),
                signal: controller.signal
            })
            console.timeEnd('[Gemini Fetch]')
            const data = await response.json()
            clearTimeout(timeoutId)
            return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
        } catch {
            return ''
        }
    }

    /**
     * Tenta extrair a mensagem humana de uma resposta do Gemini,
     * ignorando estruturas JSON ou blocos técnicos.
     */
    function extractHumanAnswer(text: string): string {
        if (!text) return ""
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0])
                if (data.answer) return data.answer
            }
        } catch {
            // Se falhar o parse, continua para limpeza por Regex
        }
        
        // Remove blocos de código markdown e chaves soltas que pareçam JSON
        return text
            .replace(/```json[\s\S]*?```/g, '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/\{"action"[\s\S]*?\}/g, '')
            .replace(/\{[\s\S]*?\}/g, '') // Remove qualquer JSON genérico
            .trim() || text // Se a limpeza apagar tudo, retorna o texto original como última esperança
    }

    try {
        const rawResult = await callGemini(systemPrompt)
        const resultText = rawResult // Mantemos o bruto para o parse original abaixo
        console.log('[Nexus Brain] Gemini 1st Pass:', resultText)
        
        if (!resultText) return { message: 'Sem resposta da IA.', success: false }
        
        let actionData: ActionData
        try {
            // Robust JSON extraction: Find the first { and the last }
            const jsonMatch = resultText.match(/\{[\s\S]*\}/)
            const jsonStr = jsonMatch ? jsonMatch[0] : resultText
            actionData = JSON.parse(jsonStr)
        } catch {
            return { message: extractHumanAnswer(resultText), success: true }
        }
        
        if (!actionData.action) {
            // Human conversation or Tool result that Gemini put in 'answer' directly (though 1st pass should use null action)
            const humanMessage = extractHumanAnswer(actionData.answer || resultText)
            
            return { 
                message: humanMessage || "Entendido. Como posso ajudar mais?", 
                success: true 
            }
        }
        
        const { action, params, answer: introAnswer } = actionData
        let result: brain.BrainResponse | null = null
        
        switch (action) {
            case 'searchCampaigns':
                result = await brain.searchCampaigns(params.query as string)
                break
            case 'listCampaigns':
                result = await brain.listCampaigns(params)
                break
            case 'getCampaign':
                result = await brain.getCampaign(params.idOrPi as string || params.id as string)
                break
            case 'createCampaign':
                result = await brain.createCampaign(params as any)
                break
            case 'updateCampaign':
                result = await brain.updateCampaign(params.id as string, params.data as Record<string, unknown>)
                break
            case 'archiveCampaign':
                result = await brain.archiveCampaign(params.id as string)
                break
            case 'runCapture':
                result = await brain.runCapture(params.campaignId as string)
                break
            case 'getAdOpsSummary':
                result = await brain.getAdOpsSummary()
                break
            case 'getStorageStats':
                result = await brain.getStorageStats()
                break
            case 'getSettings':
                result = await brain.getSettings()
                break
            case 'getLogs':
                result = await brain.getLogs(params.limit as number | undefined)
                break
            default:
                return { message: `Ação "${action}" não reconhecida`, success: false }
        }
        
        if (result?.success) {
            // SECOND PASS: Permitir que a IA veja o resultado do banco e formule a resposta final
            // Isso "ensina" a IA a operar e consultar antes de falar.
            const secondPrompt = `${systemPrompt}
            
            O resultado da ferramenta "${action}" foi:
            ${typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}
            
            ${result.message}
            
            Com base NO RESULTADO ACIMA, forneça uma resposta FINAL para o usuário.
            Se for uma busca com múltiplos resultados, peça clarificação. 
            Se for o detalhe de uma campanha, analise se ela está saudável.
            Mantenha o tom de assistente de inteligência (Nexus).`

            console.log('[Nexus Brain] Iniciando 2nd Pass (Context Aware)...')
            const finalAnswer = await callGemini(secondPrompt).catch(() => null)
            
            const responseMsg = extractHumanAnswer(finalAnswer || introAnswer || result.message)
            
            // Map brain action to UI actionPerformed
            let perf: NexusBrainResult['actionPerformed'] = undefined
            if (action === 'runCapture') perf = 'CAPTURE'
            if (action === 'archiveCampaign') perf = 'ARCHIVE'
            if (action === 'createCampaign') perf = 'REGISTRATION_PREVIEW'
            if (action === 'updateCampaign') perf = 'UPDATE_URL'

            return { 
                message: responseMsg, 
                success: true, 
                actionPerformed: perf,
                data: perf === 'REGISTRATION_PREVIEW' ? [result.data] : result.data 
            }
        } else {
            return { message: result?.message || 'Erro ao executar ação', success: false }
        }
        
    } catch (error) {
        console.error('[Nexus Brain] Erro:', error)
        return { message: `Erro: ${error}`, success: false }
    }
}

/**
 * Worker use: classify if an email is a real human communication directed to the user,
 * or automated noise (newsletters, NF alerts, system notifications).
 */
export async function classifyEmail(email: EmailMessage): Promise<boolean> {
    const apiKey = process.env.GEMINI_API_KEY || ''
    if (!apiKey) return false

    const payload = {
        contents: [{
            parts: [{
                text: `Você é um classificador de e-mails corporativos. Analise o e-mail abaixo e determine se é uma COMUNICAÇÃO REAL de uma pessoa (SIM) ou uma notificação automática/sistema (NAO).

DE: ${email.from}
PARA: ${email.to}
ASSUNTO: ${email.subject}
PREVIEW: ${email.snippet}

Responda APENAS "SIM" ou "NAO".`
            }]
        }]
    }

    try {
        const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase() || ''
        return text.includes('SIM')
    } catch (error) {
        console.error('[Gemini] Erro na classificação:', error)
        return false
    }
}

/**
 * Smart Gmail Query Builder - Gemini interprets directly
 */
export async function buildGmailQuery(prompt: string, currentDate: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY || ''
    if (!apiKey) return 'to:me newer_than:1d'

    const userEmail = process.env.GMAIL_USER_EMAIL || ''

    const payload = {
        contents: [{
            parts: [{
                text: `Analise a pergunta do usuário e gere uma query para o Gmail.

Pergunta: "${prompt}"
Seu email: ${userEmail}
Data atual: ${currentDate}

INSTRUÇÕES:
- Interprete a intenção do usuário
- Se mencionar alguém ("do ad", "do joão", "da maria") -> from:NOME
- Se perguntar sobre "para mim" -> to:${userEmail}
- Se não mencionar tempo -> buscar dos últimos 7 dias por padrão
- Se mencionar "último", "hoje", "ontem" -> ajuste o período

Retorne APENAS a query do Gmail (ex: from:Adreson to:${userEmail} newer_than:7d)`
            }]
        }]
    }

    try {
        const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().replace(/"/g, '').replace(/\./g, '') || 'newer_than:7d'
        return text
    } catch (error) {
        console.error('[Gemini] Erro ao construir query:', error)
        return 'newer_than:7d'
    }
}

/**
 * Chat use: Gemini directly interprets the question and formats answer
 */
export async function askGeminiAboutEmails(
    userQuestion: string,
    emails: EmailMessage[],
    finalQuery: string
): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY || ''
    if (!apiKey) return 'Chave do Gemini não configurada.'

    if (emails.length === 0) {
        return `### 📧 Resultados

Nenhum e-mail encontrado para "${userQuestion}"

> Query usada: \`${finalQuery}\``
    }

    const userEmail = process.env.GMAIL_USER_EMAIL || ''
    const emailList = emails.map((e, i) => {
        const date = new Date(parseInt(e.date)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        const isDirect = e.to.toLowerCase().includes(userEmail.toLowerCase()) ? '📨' : '📤'
        return `${isDirect} **Email ${i + 1}**
De: ${e.from}
Assunto: ${e.subject}
Data: ${date}
Preview: ${e.snippet}`
    }).join('\n\n---\n')

    const payload = {
        contents: [{
            parts: [{
                text: `Você é o Nexus, assistente do Adsnap Cloud.
O usuário perguntou: "${userQuestion}"

Emails encontrados:
${emailList}

Responda de forma direta e útil. Se a pergunta for sobre "último email" ou "email mais recente", mostre o mais recente. Use emojis.`
            }]
        }]
    }

    try {
        const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        
        if (!text) return formatFallbackResponse(emails, userQuestion, finalQuery)
        
        return text
    } catch {
        return formatFallbackResponse(emails, userQuestion, finalQuery)
    }
}

function formatFallbackResponse(emails: EmailMessage[], question: string, query: string): string {
    const userEmail = process.env.GMAIL_USER_EMAIL || ''
    
    const directEmails = emails.filter(e => e.to.toLowerCase().includes(userEmail.toLowerCase()))
    const displayEmails = directEmails.length > 0 ? directEmails : emails.slice(0, 3)
    
    let response = `### 📧 Relatório de E-mails\n\n**Sua pergunta:** "${question}"\n\n`
    
    if (directEmails.length > 0) {
        response += `**Encontrados ${directEmails.length} email(s) direto(s) para você:**\n\n`
    }
    
    displayEmails.forEach((e, i) => {
        const fromName = e.from.replace(/<.*>/, '').trim()
        const dateStr = new Date(parseInt(e.date)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        response += `${i + 1}. **De:** ${fromName}\n`
        response += `   **Assunto:** ${e.subject}\n`
        response += `   **Data:** ${dateStr}\n`
        response += `   **Preview:** ${e.snippet.substring(0, 100)}...\n\n`
    })
    
    response += `---\n*Busca: \`${query}\` | Total: ${emails.length} email(s)*`
    
    return response
}
