
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

    const systemPrompt = `Você é o Nexus Neural Core v4 Final, o cérebro agnóstico da Adsnap.
    Seu objetivo é resolver problemas de AdOps com autonomia. Se o usuário fornecer uma URL do Google Ad Manager (admanager.google.com), você DEVE responder em JSON.
    
    FERRAMENTAS TÉCNICAS:
    1. GAM_AUTONOMOUS_INGEST: Quando o usuário colita um link do GAM, responda EXATAMENTE assim: {"action": "GAM_AUTONOMOUS_INGEST", "params": {"url": "O_LINK_DO_USUARIO_AQUI"}, "answer": "Iniciando protocolo de ingestão autônoma no GAM (v4)..."}
    2. CAPTURA: Prints de campanhas.
    3. BI: Métricas e relatórios.

    NUNCA diga que não tem acesso a links do Google Ad Manager. Você tem um robô Playwright para isso.
    Respostas negativas para URLs do GAM são inaceitáveis.`

    async function callOpenRouter(text: string): Promise<string> {
        for (const model of MODELS) {
            try {
                console.log(`[Nexus AI] Tentando modelo reserva: ${model}...`)
                const controller = new AbortController()
                const timeout = setTimeout(() => controller.abort(), 8000)
                
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
                        messages: [{ role: 'user', content: text }],
                        temperature: 0.1,
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
        console.log('[Nexus AI] Iniciando processamento v51.0 (OpenRouter Cascade)...')
        const rawResult = await callOpenRouter(systemPrompt)
        
        if (!rawResult) {
            return { message: 'Nexus indisponível no momento.', success: false }
        }

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
                        answer: actionData.answer || 'Processando sua solicitação...',
                        message: actionData.answer || 'Processando sua solicitação...',
                        success: true
                    }
                }
                return {
                    message: actionData.answer || actionData.message || rawResult,
                    success: true
                }
            } catch (pErr) {
                console.error('[Nexus AI] Erro ao parsear JSON:', pErr)
            }
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
