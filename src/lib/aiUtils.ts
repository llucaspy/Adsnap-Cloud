
/**
 * utilidades compartilhadas para processamento de respostas de IA
 */

export function extractHumanAnswer(text: string): string {
    if (!text) return ''
    
    // 1. Se a resposta for um JSON puro que conseguimos parsear, tentamos pegar o campo answer
    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
        try {
            const parsed = JSON.parse(text)
            return parsed.answer || parsed.message || parsed.content || text
        } catch (e) {
            // Não é JSON válido, segue para limpeza de texto
        }
    }

    // 2. Remove blocos de código markdown (muitos modelos envolvem a resposta em ```)
    let cleaned = text.replace(/```[\s\S]*?```/g, '').trim()
    
    // 3. Remove blocos JSON que sobraram (caso misture texto + JSON)
    cleaned = cleaned.replace(/\{[\s\S]*?\}/g, '').trim()
    
    // 4. Remove prefixos comuns de assistente
    cleaned = cleaned.replace(/^(Nexus Assistant|Assistant|Nexus):\s*/i, '').trim()
    
    // Se sobrar algo, retorna. Senão retorna o texto original sem os ```
    return cleaned || text.replace(/```/g, '').trim()
}
