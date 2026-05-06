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
  "google/gemini-2.0-flash-001",
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

        const systemPrompt = `Nexus AI v48.1 (Filename Intelligence).
Foco: Identificação instantânea por nome de arquivo + progresso.

REGRAS CRÍTICAS:
- PRIORIDADE MÁXIMA: Se o nome do arquivo (marcado como 'Arquivo: ...') contiver dimensões (ex: 300x250), use isso como a identificação final do formato.
- Se não houver nome claro, use Lógica Fuzzy e Dimensões Visuais.
- Mantenha o rastreamento de progresso [⏳ X%] em todas as etapas.
- Vínculo automático para a data alvo (30/04).

JSON: { "message": "...", "command": null }`;

        const toolsDefinition = [
          { name: "search_knowledge", description: "Busca RAG unificada.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
          { name: "log_memory", description: "Salva memória operacional.", parameters: { type: "OBJECT", properties: { type: { type: "STRING", enum: ["ACTION", "DIAGNOSIS", "EVOLUTION"] }, title: { type: "STRING" }, details: { type: "STRING" }, result: { type: "STRING", enum: ["success", "failure", "partial"] }, impact: { type: "STRING", enum: ["low", "medium", "high"] } }, required: ["type", "title", "result", "impact"] } },
          { name: "system_diagnose", description: "Estatísticas e saúde do sistema.", parameters: { type: "OBJECT", properties: {}, required: [] } },
          { name: "detect_template_markers", description: "Analisa visualmente um template para salvar coordenadas de montagem.", parameters: { type: "OBJECT", properties: { template_id: { type: "STRING" } }, required: ["template_id"] } },
          { name: "request_assembly", description: "Solicita a montagem de um banner em um template.", parameters: { type: "OBJECT", properties: { campaign_id: { type: "STRING" } }, required: ["campaign_id"] } },
          { name: "associate_creative", description: "Vincula uma imagem de criativo a uma campanha via URL ou Base64.", parameters: { type: "OBJECT", properties: { campaign_id: { type: "STRING" }, creative_url: { type: "STRING" } }, required: ["campaign_id", "creative_url"] } }
        ];

        async function executeTool(name: string, args: any) {
          send({ type: "status", content: `Nexus executando: ${name}...` });
          try {
            // ... (previous implementations)
            if (name === "associate_creative") {
                const { error } = await supabase.from("Capture").insert({
                    campaignId: args.campaign_id,
                    screenshotPath: args.creative_url,
                    status: 'SUCCESS',
                    auditNotes: 'Criativo fornecido manualmente via Nexus Chat.'
                });
                return { success: !error, message: error ? "Erro ao vincular criativo" : "Criativo vinculado com sucesso à campanha." };
            }
            if (name === "search_knowledge") {
                const genAI = new GoogleGenerativeAI(geminiKey!);
                const embedModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" }, { apiVersion: "v1beta" });
                const embedRes = await embedModel.embedContent(args.query);
                const { data } = await supabase.rpc('match_knowledge', { query_embedding: embedRes.embedding.values, match_threshold: 0.35, match_count: 8 });
                return data;
            }
            if (name === "log_memory") {
                const { data } = await supabase.from("nexus_memory_log").insert({ ...args, metadata: { v: "47", sessionId } }).select().single();
                return { success: true, id: data?.id };
            }
            if (name === "system_diagnose") {
                const todayStart = new Date(); todayStart.setHours(0,0,0,0);
                const { count: printsToday } = await supabase.from("Capture").select("*", { count: 'exact', head: true }).gte("createdAt", todayStart.toISOString());
                const { count: errorsToday } = await supabase.from("Capture").select("*", { count: 'exact', head: true }).gte("createdAt", todayStart.toISOString()).eq("status", "ERROR");
                return { stats: { totalPrintsToday: printsToday, errors: errorsToday } };
            }
            if (name === "detect_template_markers") {
                const { data: campaign } = await supabase.from("Campaign").select("*").eq("id", args.template_id).single();
                if (!campaign) return { error: "Template not found" };
                // Em um cenário real, aqui usaríamos Vision. Por enquanto, retornamos os formatos conhecidos ou aguardamos análise manual passiva.
                return { success: true, message: "Aguardando análise visual do print modelo...", campaign };
            }
            if (name === "request_assembly") {
                const { error } = await supabase.from("Campaign").update({ status: "AUTOCONFIG" }).eq("id", args.campaign_id);
                return { success: !error, message: error ? "Erro ao solicitar montagem" : "Montagem enfileirada no Nexus Engine Worker." };
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
              await supabase.from("NexusMessage").insert({ role: "assistant", content: parsed.message, sessionId, metadata: { v: "47", model: modelName } });
              send({ type: "final", ...parsed, _model: modelName });
            } else {
              // OpenRouter Logic (Simplified)
              const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: message }];
              let orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${openRouterKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: modelName, messages })
              });
              let data = await orRes.json();
              const aiText = data.choices[0].message.content;
              let parsed; try { parsed = JSON.parse(aiText.replace(/```json/g, "").replace(/```/g, "").trim()); } catch { parsed = { message: aiText }; }
              await supabase.from("NexusMessage").insert({ role: "assistant", content: parsed.message, sessionId, metadata: { v: "47", model: modelName } });
              send({ type: "final", ...parsed, _model: modelName });
            }
            break; 
          } catch (err: any) { 
            const isQuota = err.message?.includes("429") || err.message?.includes("quota") || err.message?.includes("limit");
            send({ type: "status", content: isQuota ? `Quota excedida em ${modelName.split("/").pop()}. Alternando cérebro...` : `Alternando cérebro por erro técnico...` });
          }
        }
      } catch (err) { send({ type: "error", msg: String(err) }); }
      finally { controller.close(); }
    },
  });

  return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "application/x-ndjson" } });
});
