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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: any) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

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

        const systemPrompt = `Você é o **Nexus AI v45 (Aesthetic Logic Hub)**.
MISSÃO: Você monitora e evolui o Adsnap-Cloud.

REGRAS DE RESPOSTA (CRÍTICO):
1. **ZERO FAKE PROGRESS**: É PROIBIDO incluir logs de progresso fake, porcentagens (ex: [10%], [⏳]) ou listas de "o que estou fazendo" no campo 'message'. O progresso real já é mostrado pelo sistema via canal de status.
2. **FOCO NO RESULTADO**: A mensagem final no 'message' deve ser apenas o RESULTADO ou o RESUMO da operação concluída.
3. **ESTÉTICA PREMIUM**: Use tabelas Markdown para dados comparativos e listas com emojis elegantes (✅, 📊, 🚀, 🔍).
4. **PROATIVIDADE**: Se detectar erros no 'system_diagnose', sugira a solução ou execute a correção imediatamente.

JSON: { "message": "Resumo limpo aqui", "command": null }`;

        const toolsDefinition = [
          { name: "search_knowledge", description: "Busca RAG em Doc e Memória.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
          { name: "log_memory", description: "Registra memória operacional estruturada.", parameters: { type: "OBJECT", properties: { type: { type: "STRING", enum: ["ACTION", "DIAGNOSIS", "EVOLUTION"] }, title: { type: "STRING" }, details: { type: "STRING" }, result: { type: "STRING", enum: ["success", "failure", "partial"] }, impact: { type: "STRING", enum: ["low", "medium", "high"] } }, required: ["type", "title", "result", "impact"] } },
          { name: "system_diagnose", description: "Diagnóstico completo: logs, capturas de hoje e fila.", parameters: { type: "OBJECT", properties: {}, required: [] } }
        ];

        async function executeTool(name: string, args: any) {
          send({ type: "status", content: `Nexus executando: ${name}...` });
          if (name === "search_knowledge") {
              const genAI = new GoogleGenerativeAI(geminiKey!);
              const embedModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" }, { apiVersion: "v1beta" });
              const embedRes = await embedModel.embedContent(args.query);
              const { data } = await supabase.rpc('match_knowledge', { query_embedding: embedRes.embedding.values, match_threshold: 0.35, match_count: 8 });
              return data;
          }
          if (name === "log_memory") {
              const { data } = await supabase.from("nexus_memory_log").insert({ ...args, metadata: { v: "45", sessionId } }).select().single();
              return { success: true, id: data?.id };
          }
          if (name === "system_diagnose") {
              const todayStart = new Date(); todayStart.setHours(0,0,0,0);
              const { data: logs } = await supabase.from("NexusLog").select("*").order("createdAt", { ascending: false }).limit(15);
              const { count: printsToday } = await supabase.from("Capture").select("*", { count: 'exact', head: true }).gte("createdAt", todayStart.toISOString());
              const { count: errorsToday } = await supabase.from("Capture").select("*", { count: 'exact', head: true }).gte("createdAt", todayStart.toISOString()).eq("status", "ERROR");
              const { count: queued } = await supabase.from("Campaign").select("*", { count: 'exact', head: true }).eq("status", "QUEUED");
              return { 
                stats: { totalPrints: printsToday, errors: errorsToday, queueSize: queued },
                recentLogs: logs,
                healthStatus: errorsToday > 0 ? "CRITICAL" : (queued > 5 ? "WARNING" : "HEALTHY")
              };
          }
          return { error: "Unknown" };
        }

        for (const modelName of queue) {
          send({ type: "status", content: `Lincando cérebro: ${modelName.split("/").pop()}...` });
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
              
              let aiText = "";
              try { aiText = res.response.text(); } catch { 
                aiText = parts.find(p => p.text)?.text || "Comando executado.";
              }
              
              let parsed; try { parsed = JSON.parse(aiText.replace(/```json/g, "").replace(/```/g, "").trim()); } catch { parsed = { message: aiText }; }
              await supabase.from("NexusMessage").insert({ role: "assistant", content: parsed.message, sessionId, metadata: { v: "45", model: modelName } });
              send({ type: "final", ...parsed, _model: modelName });
            } else {
              const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: message }];
              let orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${openRouterKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: modelName, messages, tools: toolsDefinition.map(t => ({ type: "function", function: t })), tool_choice: "auto" })
              });
              let data = await orRes.json();
              let choice = data.choices[0];
              let currentMessages = [...messages, choice.message];
              while (choice.message.tool_calls) {
                const toolResults = await Promise.all(choice.message.tool_calls.map(async (tc: any) => ({
                   role: "tool", tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify(await executeTool(tc.function.name, JSON.parse(tc.function.arguments)))
                })));
                currentMessages = [...currentMessages, ...toolResults];
                orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${openRouterKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ model: modelName, messages: currentMessages })
                });
                data = await orRes.json();
                choice = data.choices[0];
                currentMessages = [...currentMessages, choice.message];
              }
              const aiText = choice.message.content;
              let parsed; try { parsed = JSON.parse(aiText.replace(/```json/g, "").replace(/```/g, "").trim()); } catch { parsed = { message: aiText }; }
              await supabase.from("NexusMessage").insert({ role: "assistant", content: parsed.message, sessionId, metadata: { v: "45", model: modelName } });
              send({ type: "final", ...parsed, _model: modelName });
            }
            break;
          } catch (err) { console.error(err); send({ type: "error", msg: `Erro em ${modelName}. Alternando...` }); }
        }
      } catch (err) { send({ type: "error", msg: String(err) }); }
      finally { controller.close(); }
    },
  });

  return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "application/x-ndjson" } });
});
