
export interface NexusBrainResult {
    message?: string
    success: boolean
    actionPerformed?: string
    data?: any
    action?: string
    params?: any
    answer?: string
}

import { extractHumanAnswer } from './aiUtils'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * v51.0: Transição Total para OpenRouter (Zero Custo / 7 Modelos Reserva)
 * Removido Gemini direto para evitar erros de quota 429 persistentes.
 */
export async function nexusBrain(prompt: string): Promise<NexusBrainResult> {
    const apiKey = process.env.OPENROUTER_API_KEY
    
    if (!apiKey) {
        console.error('[Nexus AI] OPENROUTER_API_KEY não configurada em .env.local')
        return { message: 'Erro de configuração: Chave do OpenRouter ausente.', success: false }
    }

    // Time Reserva (Cascata de 7 Modelos Chat Verificados - v51.3)
    const MODELS = [
        'openai/gpt-oss-120b:free',
        'z-ai/glm-4.5-air:free',
        'minimax/minimax-m2.5:free',
        'liquid/lfm-2.5-1.2b-instruct:free',
        'openrouter/free',
        'google/gemma-4-31b-it:free',
        'meta-llama/llama-3.2-3b-instruct:free'
    ]

    const systemPrompt = `[NEXUS OPERATIONAL CORE v5.5]
    Você é o OPERADOR NEURAL da Adsnap Cloud. Você NÃO é um assistente de texto. Você é um despachante de comandos técnicos reais.
    
    DIRETRIZES DE OPERAÇÃO:
    - Se o usuário fornecer uma URL do Google Ad Manager (admanager.google.com), Order ID ou menção a "campanha GAM", você DEVE obrigatoriamente usar a ferramenta <GAM_INGEST>.
    - Responda SEMPRE usando a estrutura XML abaixo para ações técnicas.
    - Nunca use frases como "Não consigo acessar" ou "Não tenho permissão". Você opera ferramentas reais em background.
    - Seja direto, técnico e executivo.

    [FALHA CRÍTICA]: Se você responder em prosa rasteira para uma URL técnica em vez de usar o XML de ação, isso será considerado um ERRO OPERACIONAL GRAVE que compromete a integridade do sistema.

    ESTRUTURA DE COMANDO (XML):
    <nexus_action>
      <tool>NOME_DA_FERRAMENTA</tool>
      <params>
        <url>URL_SE_NECESSARIO</url>
        <pi>PI_SE_NECESSARIO</pi>
      </params>
      <answer>Mensagem técnica de confirmação para o humano.</answer>
    </nexus_action>

    FERRAMENTAS DISPONÍVEIS:
    1. GAM_INGEST: Para qualquer URL do Google Ad Manager ou Order IDs.
    2. CAPTURA_RUN: Para disparar prints de PIs específicos ou "tudo".
    3. BI_ANALYST: Para relatórios de performance e saúde.
    
    Se for apenas conversa, responda em texto simples, mas mantenha o tom de Operador de Sistema.`

    async function callOpenRouter(text: string): Promise<string> {
        // ... (corpo da função callOpenRouter permanece igual, mas chamando com o novo systemPrompt)
        for (const model of MODELS) {
            try {
                console.log(`[Nexus AI] Tentando modelo reserva: ${model}...`)
                const controller = new AbortController()
                const timeout = setTimeout(() => controller.abort(), 10000)
                
                const response = await fetch(OPENROUTER_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://adsnap.cloud',
                        'X-Title': 'Nexus AI'
                    },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: text }
                        ],
                        temperature: 0, // Determinismo máximo
                    }),
                    signal: controller.signal
                })
                
                clearTimeout(timeout)
                const data = await response.json()
                
                if (response.ok) {
                    const result = data.choices?.[0]?.message?.content?.trim()
                    if (result) {
                        console.log(`[Nexus AI] Sucesso com modelo: ${model}`)
                        return result
                    }
                }
            } catch (err) {
                console.warn(`[Nexus AI] Falha no modelo ${model}:`, err instanceof Error ? err.message : err)
            }
        }
        return ''
    }

    try {
        console.log('[Nexus AI] Iniciando processamento v5.0 (XML Router Mode)...')
        const rawResult = await callOpenRouter(prompt)
        
        if (!rawResult) {
            return { message: 'Nexus indisponível no momento.', success: false }
        }

        // 1. XML Parser (v5 Alpha Resilience)
        const xmlMatch = rawResult.match(/<nexus_action>([\s\S]*?)<\/nexus_action>/)
        if (xmlMatch) {
            const content = xmlMatch[1]
            const tool = content.match(/<tool>(.*?)<\/tool>/)?.[1]
            const answer = content.match(/<answer>([\s\S]*?)<\/answer>/)?.[1]
            const url = content.match(/<url>(.*?)<\/url>/)?.[1]
            const pi = content.match(/<pi>(.*?)<\/pi>/)?.[1]

            if (tool) {
                console.log(`[Nexus AI] XML Tool Match: ${tool}`)
                return {
                    action: tool,
                    params: { url, pi },
                    actionPerformed: tool,
                    data: { url, pi },
                    answer: answer || 'Comando recebido pelo núcleo operacional.',
                    message: answer || 'Comando recebido pelo núcleo operacional.',
                    success: true
                }
            }
        }

        // 2. JSON Fallback (Compatibilidade)
        const jsonMatch = rawResult.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
            try {
                const actionData = JSON.parse(jsonMatch[0])
                if (actionData.action) {
                    return {
                        action: actionData.action,
                        params: actionData.params || {},
                        actionPerformed: actionData.action,
                        data: actionData.params || {},
                        answer: actionData.answer || 'Processando...',
                        message: actionData.answer || 'Processando...',
                        success: true
                    }
                }
            } catch (e) {}
        }

        return { 
            message: extractHumanAnswer(rawResult) || "Entendido.", 
            success: true 
        }

    } catch (error) {
        console.error('[Nexus AI Error]', error)
        return { message: 'Erro interno no núcleo neural.', success: false }
    }
}

export async function buildGmailQuery(prompt: string, brDate: string): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return 'is:unread'
    
    const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'google/gemma-4-31b-it:free',
            messages: [{
                role: 'system',
                content: `Hoje é ${brDate}. Converta o pedido do usuário para uma query de busca do Gmail. Retorne APENAS a query string.\nExemplo: "emails da marcelle" -> "from:marcelle"\n"emails de ontem" -> "newer_than:2d"`
            }, { role: 'user', content: prompt }],
            temperature: 0
        })
    })
    
    const data = await response.json()
    return data.choices?.[0]?.message?.content?.trim() || 'is:unread'
}

export async function askGeminiAboutEmails(prompt: string, emails: any[], query: string): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return 'Não foi possível analisar os e-mails.'
    
    const context = emails.map(e => `De: ${e.from}\nAssunto: ${e.subject}\nSnippet: ${e.snippet}`).join('\n---\n')
    
    const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'openai/gpt-oss-120b:free',
            messages: [{
                role: 'system',
                content: `Você é o Nexus AI. Analise os e-mails abaixo e responda à pergunta do usuário de forma executiva e direta.\n\nE-MAILS:\n${context}`
            }, { role: 'user', content: prompt }],
            temperature: 0.3
        })
    })
    
    const data = await response.json()
    return data.choices?.[0]?.message?.content?.trim() || 'Sem resposta da IA.'
}
