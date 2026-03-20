⚙️ 🧠 INSTRUÇÕES PARA O FLASH
Refatoração do Pipeline do Nexus (Eliminar Timeouts)
🎯 OBJETIVO

Eliminar o erro:

⏳ O servidor está demorando demais. Tente novamente.

fazendo:

respostas rápidas (<1s) para comandos operacionais

evitar bloqueio por IA

evitar encadeamento lento (AI → API → resposta)

🔴 PROBLEMA ATUAL (RESUMO)

Pipeline atual:

Frontend (25s timeout)
↓
processNexusCommand
↓
Gemini (até 22s)
↓
APIs externas (~10–15s)
↓
Resposta

👉 Resultado: 30s+ → timeout

✅ SOLUÇÃO GERAL

Implementar:

1. FAST PATH (sem IA)
2. AI como fallback (não bloqueante)
3. Paralelização de tarefas
4. Timeout global controlado
5. Cache com SWR
   🥇 ETAPA 1 — FAST PATH (CRÍTICO)
   📌 REGRA

Antes de chamar QUALQUER IA, detectar comandos operacionais.

🔧 IMPLEMENTAÇÃO

No topo de processNexusCommand:

const text = prompt.toLowerCase()

if (isOperationalCommand(text)) {
return await handleDirectCommand(text)
}
🔧 Criar função
function isOperationalCommand(text: string) {
return (
text.includes('status') ||
text.includes('resumo') ||
text.includes('campanhas') ||
text.includes('print') ||
text.includes('captur') ||
text.includes('baixar') ||
text.includes('download') ||
text.includes('agendar') ||
text.includes('parar')
)
}
🔧 Criar handler direto
async function handleDirectCommand(text: string): Promise<NexusResponse> {

    // STATUS
    if (text.includes('status') || text.includes('resumo')) {
        const count = await prisma.campaign.count({ where: { isArchived: false } })
        const scheduled = await prisma.campaign.count({ where: { isArchived: false, isScheduled: true } })

        return {
            message: `Status do Sistema:\n- ${count} campanhas\n- ${scheduled} agendadas`,
            success: true
        }
    }

    // CAPTURE ALL
    if (text.includes('captur') && (text.includes('tudo') || text.includes('todas'))) {
        const result = await runAllCaptures()

        return {
            message: `Captura iniciada para ${result.count} campanhas.`,
            success: true,
            actionPerformed: 'CAPTURE_ALL'
        }
    }

    return null

}
🎯 RESULTADO
Antes Depois
"status" → 15–25s "status" → <500ms
🥈 ETAPA 2 — NÃO BLOQUEAR COM IA
❌ REMOVER BLOQUEIO

REMOVER isso:

if (!brainResult.success && !brainResult.message) {
return erro
}
✅ SUBSTITUIR POR
let brainResult = null

try {
brainResult = await Promise.race([
nexusBrain(prompt),
timeout(8000)
])
} catch (err) {
console.log('[Nexus] AI falhou, usando fallback')
}
🎯 REGRA

👉 IA NUNCA pode bloquear resposta

🥉 ETAPA 3 — REDUZIR TEMPO DA IA
🔧 Alterar timeout:
timeout(8000) // antes 22000
🎯 REGRA

IA = auxiliar

não = gargalo

🧠 ETAPA 4 — PARALELIZAR (IMPORTANTE)
❌ HOJE
AI → depois API
✅ NOVO
const aiPromise = nexusBrain(prompt)
const dataPromise = getAggregatedAdOpsMetrics()

const [aiResult, dataResult] = await Promise.allSettled([
aiPromise,
dataPromise
])
🎯 RESULTADO

reduz tempo total em até 50%

💾 ETAPA 5 — CACHE SWR
🔧 Implementar padrão:
const cached = await getCachedMetrics()

if (cached) {
refreshMetricsInBackground()
return cached
}
🎯 REGRA

nunca esperar API lenta

sempre responder rápido

⏱️ ETAPA 6 — ALINHAR TIMEOUTS
📊 DEFINIR:
TOTAL: 20s
🔧 Ajustar:
Camada Tempo
Frontend 20s
AI 8s
APIs 10s
🔧 Frontend (NexusChat.tsx)
setTimeout(() => reject(new Error('Timeout')), 20000)
🧪 ETAPA 7 — LOG DE PERFORMANCE

Adicionar:

console.time('TOTAL')

console.time('AI')
...
console.timeEnd('AI')

console.time('API')
...
console.timeEnd('API')

console.timeEnd('TOTAL')
🧨 ETAPA 8 — FALLBACK FINAL

No final do handler:

return {
message: "Comando não reconhecido. Tente 'status', 'capturar tudo' ou 'baixar prints'.",
success: true
}
🚀 RESULTADO FINAL ESPERADO
Tipo de comando Tempo
status < 500ms
captura < 1s
download < 1s
AI complexo 5–10s
erro nunca timeout
🧠 NOVA ARQUITETURA
ANTES:
chat → AI → sistema

DEPOIS:
chat → router → (direto OU AI) → sistema
⚠️ REGRAS IMPORTANTES

IA nunca bloqueia fluxo

comandos simples nunca usam IA

tudo que é crítico tem fallback

tempo total < timeout frontend

💬 RESUMO FINAL PARA O FLASH

👉 Implemente isso:

Fast-path antes da IA

IA com timeout curto (8s)

fallback sempre ativo

paralelizar chamadas

cache imediato

Se ele fizer isso corretamente, o Nexus passa de:

❌ instável / timeout
para
✅ rápido / confiável / nível produção
