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
  "gemini-1.5-flash",
  "google/gemini-2.0-flash-001", // via OpenRouter
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

        const systemPrompt = `Nexus AI v46 (Diagnostic & Multi-Brain).
Foco: Resultado proativo e estético. 

REGRAS:
- PROIBIDO fake logs/porcentagens ([10%], [⏳]) no campo 'message'.
- Se vir erros em 'system_diagnose', corrija-os.
- Resumo final limpo em Português-BR.
- Real-time updates via Ticking.

JSON: { "message": "Resumo aqui", "command": null }`;

        const toolsDefinition = [
          { name: "search_knowledge", description: "Busca RAG unificada.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
          { name: "log_memory", description: "Salva memória operacional.", parameters: { type: "OBJECT", properties: { type: { type: "STRING", enum: ["ACTION", "DIAGNOSIS", "EVOLUTION"] }, title: { type: "STRING" }, details: { type: "STRING" }, result: { type: "STRING", enum: ["success", "failure", "partial"] }, impact: { type: "STRING", enum: ["low", "medium", "high"] } }, required: ["type", "title", "result", "impact"] } },
          { name: "system_diagnose", description: "Estatísticas de hoje e saúde geral.", parameters: { type: "OBJECT", properties: {}, required: [] } }
        ];

        async function executeTool(name: string, args: any) {
          send({ type: "status", content: `Nexus executando: ${name}...` });
          try {
            if (name === "search_knowledge") {
                const genAI = new GoogleGenerativeAI(geminiKey!);
                const embedModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" }, { apiVersion: "v1beta" });
                const embedRes = await embedModel.embedContent(args.query);
                const { data } = await supabase.rpc('match_knowledge', { query_embedding: embedRes.embedding.values, match_threshold: 0.35, match_count: 8 });
                return data;
            }
            if (name === "log_memory") {
                const { data } = await supabase.from("nexus_memory_log").insert({ ...args, metadata: { v: "46", sessionId } }).select().single();
                return { success: true, id: data?.id };
            }
            if (name === "system_diagnose") {
                const todayStart = new Date(); todayStart.setHours(0,0,0,0);
                const { data: logs } = await supabase.from("NexusLog").select("*").order("createdAt", { ascending: false }).limit(10);
                const { count: printsToday } = await supabase.from("Capture").select("*", { count: 'exact', head: true }).gte("createdAt", todayStart.toISOString());
                const { count: errorsToday } = await supabase.from("Capture").select("*", { count: 'exact', head: true }).gte("createdAt", todayStart.toISOString()).eq("status", "ERROR");
                const { count: queued } = await supabase.from("Campaign").select("*", { count: 'exact', head: true }).eq("status", "QUEUED");
                return { 
                  stats: { totalPrintsToday: printsToday, errors: errorsToday, queueSize: queued },
                  recentLogs: logs,
                  status: errorsToday > 0 ? "CRITICAL" : (queued > 5 ? "WARNING" : "HEALTHY")
                };
            }
          } catch (e) { return { error: String(e) }; }
          return { error: "Unknown" };
        }

        for (const modelName of queue) {
          send({ type: "status", content: `Conectando ao cérebro: ${modelName.split("/").pop()}...` });
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
                aiText = parts.find(p => p.text)?.text || "Processamento concluído.";
              }
              
              let parsed; try { parsed = JSON.parse(aiText.replace(/```json/g, "").replace(/```/g, "").trim()); } catch { parsed = { message: aiText }; }
              await supabase.from("NexusMessage").insert({ role: "assistant", content: parsed.message, sessionId, metadata: { v: "46", model: modelName } });
              send({ type: "final", ...parsed, _model: modelName });
            } else {
              const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: message }];
              let orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${openRouterKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: modelName, messages, tools: toolsDefinition.map(t => ({ type: "function", function: t })), tool_choice: "auto" })
              });

              if (!orRes.ok) throw new Error(`OpenRouter HTTP ${orRes.status}`);

              let data = await orRes.json();
              if (data.error) throw new Error(data.error.message || "OpenRouter Error");

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
              await supabase.from("NexusMessage").insert({ role: "assistant", content: parsed.message, sessionId, metadata: { v: "46", model: modelName } });
              send({ type: "final", ...parsed, _model: modelName });
            }
            break; 
          } catch (err: any) { 
            console.error(err); 
            const isQuota = err.message?.includes("429") || err.message?.includes("quota") || err.message?.includes("limit");
            send({ type: "status", content: isQuota ? `Quota excedida em ${modelName.split("/").pop()}. Alternando cérebro...` : `Alternando cérebro por erro técnico...` });
            // Continue loop to next model
          }
        }
      } catch (err) { send({ type: "error", msg: String(err) }); }
      finally { controller.close(); }
    },
  });

  return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "application/x-ndjson" } });
});
