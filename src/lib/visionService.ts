
export interface AdBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const VISION_MODEL = 'google/gemini-flash-1.5-8b'; // Fast, vision-capable and free on OpenRouter

import sharp from 'sharp';

/**
 * Uses AI Vision to detect an advertisement placeholder (red rectangle or clear ad space)
 * in a background template image. Optimized for performance with local compression.
 */
export async function detectAdBoxViaVision(imageUrl: string, format: string): Promise<AdBox | null> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        console.error('[VisionService] OPENROUTER_API_KEY not configured');
        return null;
    }

    console.log(`[VisionService] Optimizing image for Vision Engine (Format: ${format})...`);

    try {
        // 1. Pre-process image to be lightweight (1024px wide, compressed JPEG)
        // This avoids timeouts and reduces OpenRouter/Gemini latency significantly.
        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
        const originalBuffer = Buffer.from(await res.arrayBuffer());

        const VISION_WIDTH = 960; // Exact 2.0 scale factor for 1920p (1920/960 = 2)
        const processedImage = await sharp(originalBuffer)
            .resize(VISION_WIDTH)
            .jpeg({ quality: 85 })
            .toBuffer();
        
        const base64Image = processedImage.toString('base64');
        const scaleFactor = 1920 / VISION_WIDTH;

        const prompt = `Analise esta captura de tela de um portal de notícias.
        O sistema marcou os espaços de publicidade com retângulos vermelhos.
        
        Sua tarefa: Localize o retângulo vermelho que corresponde ao formato ${format}.
        
        REGRAS CRÍTICAS:
        1. Se houver mais de um, escolha o que está mais bem posicionado para um banner ${format} (geralmente o topo ou meio da página).
        2. Ignore retângulos muito pequenos ou de formatos diferentes.
        3. Retorne as coordenadas [x, y, width, height] da ÁREA INTERNA do retângulo vermelho (desconsidere a espessura da linha vermelha).
        4. Retorne APENAS o JSON.
        
        IMPORTANTE: A imagem que você está vendo tem ${VISION_WIDTH}px de largura.
        Responda as coordenadas baseadas exatamente nos pixels que você vê agora.`;

        const apiResponse = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://adsnap.cloud',
                'X-Title': 'Nexus Vision'
            },
            body: JSON.stringify({
                model: VISION_MODEL,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { 
                                type: 'image_url', 
                                image_url: { url: `data:image/jpeg;base64,${base64Image}` } 
                            }
                        ]
                    }
                ],
                temperature: 0,
                response_format: { type: "json_object" }
            })
        });

        const data = await apiResponse.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) return null;

        try {
            const rawResult = JSON.parse(content.replace(/```json|```/g, ''));
            
            // 2. Scale coordinates back to 1920p original resolution (Exactly 2.0x)
            const scaledResult: AdBox = {
                x: Math.round(rawResult.x * scaleFactor),
                y: Math.round(rawResult.y * scaleFactor),
                width: Math.round(rawResult.width * scaleFactor),
                height: Math.round(rawResult.height * scaleFactor)
            };

            console.log(`[VisionService] Detected (Prompt Refined) and scaled box:`, scaledResult);
            return scaledResult;
        } catch (e) {
            console.error('[VisionService] Parse error:', content);
        }

        return null;
    } catch (error) {
        console.error('[VisionService] Critical Error:', error);
        return null;
    }
}
