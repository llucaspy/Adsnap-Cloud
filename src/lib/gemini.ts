
import { NexusBrainResult } from '../types/nexus'
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

    const systemPrompt = `Você é o Nexus AI, o cérebro operacional da Adsnap.
    Siga estritamente as ferramentas disponíveis e responda em JSON se for uma ação, ou texto natural se for conversa.
    
    Contexto do Usuário: ${prompt}
    
    CRITICAL: Diferencie "Captura" de "BI". BI = getCampaignBI. Captura = getCampaign ou runCapture.`

    async function callOpenRouter(text: string): Promise<string> {
        for (const model of MODELS) {
            try {
                console.log(`[Nexus AI] Tentando modelo reserva: ${model}...`)
                const controller = new AbortController()
                // Timeout curto de 6s por modelo para garantir que a cascata rode dentro do limite do Vercel Hobby
                const timeout = setTimeout(() => controller.abort(), 6000)
                
                const response = await fetch(OPENROUTER_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://adsnap.cloud', // Opcional, ajuda no ranking do OR
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
                } else {
                    console.warn(`[Nexus AI] Modelo ${model} indisponível (Status ${response.status}):`, data.error?.message)
                }
            } catch (err) {
                console.warn(`[Nexus AI] Falha crítica no modelo ${model}:`, err instanceof Error ? err.message : err)
            }
        }
        return ''
    }

    try {
        console.log('[Nexus AI] Iniciando processamento v51.0 (OpenRouter Cascade)...')
        const rawResult = await callOpenRouter(systemPrompt)
        
        if (!rawResult) {
            return { message: 'Nexus indisponível no momento (Quota OpenRouter esgotada).', success: false }
        }

        // Tenta extrair JSON de ação ou resposta direta
        const jsonMatch = rawResult.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
            try {
                const actionData = JSON.parse(jsonMatch[0])
                if (actionData.action) {
                    return {
                        action: actionData.action,
                        params: actionData.params || {},
                        answer: actionData.answer || 'Processando sua solicitação...',
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

        const humanMessage = extractHumanAnswer(rawResult)
        return { 
            message: humanMessage || "Entendido. Como posso ajudar mais?", 
            success: true 
        }

    } catch (error) {
        console.error('[Nexus AI] Fallback v51.0 ativado por erro:', error)
        return { message: 'Erro interno no núcleo neural v51.0.', success: false }
    }
}
