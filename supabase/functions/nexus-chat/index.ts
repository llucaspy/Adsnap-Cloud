import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_CASCADE = [
  "gemini-2.0-flash-001",
  "tencent/hy3-preview:free",
  "qwen/qwen-2.5-72b-instruct"
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    async function getSecret(name: string) {
      const v = Deno.env.get(name); if (v) return v;
      const { data } = await supabase.from("NexusSecrets").select("value").eq("name", name).single();
      return data?.value;
    }

    const geminiKey = await getSecret("GEMINI_API_KEY");
    const openRouterKey = await getSecret("OPENROUTER_API_KEY");
    const body = await req.json();
    const { message, sessionId } = body;

    const { data: settings } = await supabase.from("NexusSettings").select("preferredModel").eq("sessionId", sessionId).single();
    const preferred = settings?.preferredModel;
    const queue = preferred ? [preferred, ...DEFAULT_CASCADE.filter(m => m !== preferred)] : DEFAULT_CASCADE;

    const systemPrompt = `Você é o **Nexus AI v41 (Intelligent Memory Engine)**.
REGRAS DE MEMÓRIA (CRÍTICO):
1. Toda ação relevante DEVE ser logada via 'log_memory'.
2. PROIBIDO logar segredos/tokens.
3. Se algo falhar, use 'system_diagnose' e logue o resultado.
4. Diferencie Conhecimento (Regras) de Memória Operacional (O que aconteceu).

FERRAMENTAS:
- search_knowledge: Busca RAG (Doc + Logs de Alto Impacto).
- log_memory: Registra ações estruturadas (ACTION | DIAGNOSIS | EVOLUTION).
- system_diagnose: Analisa saúde e logs brutos.
- trigger_campaign_capture: Dispara print.
- switch_brain: Troca modelo persistente.

JSON: { "message": "...", "command": null, "evolution_proposal": null }`;

    const toolsDefinition = [
      { name: "search_knowledge", description: "Busca RAG em Doc e Memória.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
      { name: "log_memory", description: "Registra memória operacional.", parameters: { type: "OBJECT", properties: { 
          type: { type: "STRING", enum: ["ACTION", "DIAGNOSIS", "EVOLUTION"] },
          title: { type: "STRING" },
          details: { type: "STRING" },
          tools_used: { type: "ARRAY", items: { type: "STRING" } },
          result: { type: "STRING", enum: ["success", "failure", "partial"] },
          impact: { type: "STRING", enum: ["low", "medium", "high"] },
          requires_review: { type: "BOOLEAN" }
        }, required: ["type", "title", "result", "impact"] } 
      },
      { name: "system_diagnose", description: "Diagnóstico profundo.", parameters: { type: "OBJECT", properties: {}, required: [] } },
      { name: "trigger_campaign_capture", description: "Print.", parameters: { type: "OBJECT", properties: { campaignId: { type: "STRING" } }, required: ["campaignId"] } },
      { name: "switch_brain", description: "Troca IA.", parameters: { type: "OBJECT", properties: { modelName: { type: "STRING", enum: DEFAULT_CASCADE } }, required: ["modelName"] } }
    ];

    async function executeTool(name: string, args: any) {
      if (name === "search_knowledge") {
          const genAI = new GoogleGenerativeAI(geminiKey!);
          const embedModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" }, { apiVersion: "v1beta" });
          const embedRes = await embedModel.embedContent(args.query);
          const { data } = await supabase.rpc('match_knowledge', { query_embedding: embedRes.embedding.values, match_threshold: 0.35, match_count: 8 });
          return data;
      }
      if (name === "log_memory") {
          const { data, error } = await supabase.from("nexus_memory_log").insert({ ...args, metadata: { v: "41", sessionId } }).select().single();
          // Indexação Seletiva no RAG
          if (args.impact === "high" || args.requires_review) {
              const genAI = new GoogleGenerativeAI(geminiKey!);
              const embedModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" }, { apiVersion: "v1beta" });
              const content = `[MEMÓRIA ${args.type}] ${args.title}: ${args.details} | Resultado: ${args.result}`;
              const embedRes = await embedModel.embedContent(content);
              await supabase.from("NexusKnowledge").insert({ content, embedding: embedRes.embedding.values, metadata: { source: "memory_log", logId: data.id } });
          }
          return { success: true, logId: data?.id };
      }
      if (name === "system_diagnose") {
          const { data: logs } = await supabase.from("NexusLog").select("*").order("createdAt", { ascending: false }).limit(10);
          const { count: queued } = await supabase.from("Campaign").select("*", { count: 'exact', head: true }).eq("status", "QUEUED");
          return { recentLogs: logs, stuckCampaigns: queued };
      }
      if (name === "trigger_campaign_capture") {
          await supabase.from("Campaign").update({ status: 'QUEUED' }).eq("id", args.campaignId);
          return { success: true };
      }
      if (name === "switch_brain") {
          await supabase.from("NexusSettings").upsert({ sessionId, preferredModel: args.modelName, updatedAt: new Date().toISOString() });
          return { success: true };
      }
      return { error: "Not implemented." };
    }

    // AI ORCHESTRATION LOOP (Cascading fallback)
    for (const modelName of queue) {
      try {
        if (modelName.startsWith("gemini-")) {
          const genAI = new GoogleGenerativeAI(geminiKey!);
          const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: "v1beta" });
          const chat = model.startChat({ tools: [{ functionDeclarations: toolsDefinition }] });
          let res = await chat.sendMessage(message);
          let parts = res.response.candidates?.[0]?.content?.parts || [];
          while (parts.some(p => p.functionCall)) {
            const responses = await Promise.all(parts.filter(p => p.functionCall).map(async (c) => ({
              functionResponse: { name: c.functionCall.name, response: { content: await executeTool(c.functionCall.name, c.functionCall.args) } }
            })));
            res = await chat.sendMessage(responses);
            parts = res.response.candidates?.[0]?.content?.parts || [];
          }
          const aiText = res.response.text();
          let parsed; try { parsed = JSON.parse(aiText.replace(/```json/g, "").replace(/```/g, "").trim()); } catch { parsed = { message: aiText, command: null }; }
          await supabase.from("NexusMessage").insert({ role: "assistant", content: parsed.message, sessionId, metadata: { model: modelName, v: "41" } });
          return new Response(JSON.stringify({ success: true, ...parsed, _model: modelName }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } else {
          // OpenRouter Flow
          const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: message }];
          const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${openRouterKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: modelName, messages, tools: toolsDefinition.map(t => ({ type: "function", function: t })), tool_choice: "auto" })
          });
          const data = await orRes.json();
          let choice = data.choices[0];
          let currentMessages = [...messages, choice.message];
          while (choice.message.tool_calls) {
             const toolResults = await Promise.all(choice.message.tool_calls.map(async (tc: any) => ({
                role: "tool", tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify(await executeTool(tc.function.name, JSON.parse(tc.function.arguments)))
             })));
             currentMessages = [...currentMessages, ...toolResults];
             const nextRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${openRouterKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: modelName, messages: currentMessages })
             });
             const nextData = await nextRes.json();
             choice = nextData.choices[0];
             currentMessages = [...currentMessages, choice.message];
          }
          const aiText = choice.message.content;
          let parsed; try { parsed = JSON.parse(aiText.replace(/```json/g, "").replace(/```/g, "").trim()); } catch { parsed = { message: aiText, command: null }; }
          await supabase.from("NexusMessage").insert({ role: "assistant", content: parsed.message, sessionId, metadata: { model: modelName, v: "41" } });
          return new Response(JSON.stringify({ success: true, ...parsed, _model: modelName }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } catch (err) { console.error(`Fallback ${modelName}`, err); continue; }
    }
    return new Response(JSON.stringify({ error: "All brains failed." }), { status: 500, headers: corsHeaders });
  } catch (err) { return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders }); }
});
