import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL_CASCADE = [
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
    const { message, sessionId, modelChoice } = body;

    const systemPrompt = `Você é o **Nexus AI**, núcleo multi-cerebral. 
Seu cérebro atual pode mudar dinamicamente. Use ferramentas: 'search_knowledge' (RAG), 'trigger_campaign_capture' (Print).
Responda sempre em PT-BR e no formato JSON: { "message": "...", "command": null }`;

    const toolsDefinition = [
      { name: "search_knowledge", description: "Busca técnica RAG.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
      { name: "search_campaigns", description: "Busca campanhas.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
      { name: "trigger_campaign_capture", description: "Dispara print.", parameters: { type: "OBJECT", properties: { campaignId: { type: "STRING" } }, required: ["campaignId"] } }
    ];

    async function executeTool(name: string, args: any) {
      if (name === "search_knowledge") {
          const genAI = new GoogleGenerativeAI(geminiKey!);
          const embedModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" }, { apiVersion: "v1beta" });
          const embedRes = await embedModel.embedContent(args.query);
          const { data } = await supabase.rpc('match_knowledge', { query_embedding: embedRes.embedding.values, match_threshold: 0.35, match_count: 5 });
          return data;
      }
      if (name === "search_campaigns") {
          const { data } = await supabase.from("Campaign").select("id, pi, campaignName, format").or(`pi.ilike.%${args.query}%,campaignName.ilike.%${args.query}%`).limit(10);
          return data;
      }
      if (name === "trigger_campaign_capture") {
          await supabase.from("Campaign").update({ status: 'QUEUED' }).eq("id", args.campaignId);
          return { success: true };
      }
      return { error: "Not implemented." };
    }

    const queue = modelChoice ? [modelChoice, ...MODEL_CASCADE.filter(m => m !== modelChoice)] : MODEL_CASCADE;

    for (const modelName of queue) {
      try {
        console.log(`[v38] Tentando modelo: ${modelName}`);
        
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
          let clean = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
          let parsed; try { parsed = JSON.parse(clean); } catch { parsed = { message: aiText, command: null }; }
          await supabase.from("NexusMessage").insert({ role: "assistant", content: parsed.message, sessionId, metadata: { model: modelName, v: "38" } });
          return new Response(JSON.stringify({ success: true, ...parsed, _model: modelName }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

        } else {
          // OpenRouter Flow
          const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: message }];
          const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${openRouterKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: modelName,
              messages,
              tools: toolsDefinition.map(t => ({ type: "function", function: t })),
              tool_choice: "auto"
            })
          });
          const data = await orRes.json();
          if (!data.choices) throw new Error(data.error?.message || "OpenRouter Error");
          
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
          let clean = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
          let parsed; try { parsed = JSON.parse(clean); } catch { parsed = { message: aiText, command: null }; }
          await supabase.from("NexusMessage").insert({ role: "assistant", content: parsed.message, sessionId, metadata: { model: modelName, v: "38" } });
          return new Response(JSON.stringify({ success: true, ...parsed, _model: modelName }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } catch (err) {
        console.error(`Falha no ${modelName}, tentando próximo...`, err);
        continue;
      }
    }
    return new Response(JSON.stringify({ error: "Todos os modelos falharam (incluindo fallbacks)." }), { status: 500, headers: corsHeaders });
  } catch (err) { return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders }); }
});
