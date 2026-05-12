
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

        const VISION_WIDTH = 1024;
        const processedImage = await sharp(originalBuffer)
            .resize(VISION_WIDTH)
            .jpeg({ quality: 80 })
            .toBuffer();
        
        const base64Image = processedImage.toString('base64');
        const scaleFactor = 1920 / VISION_WIDTH;

        const prompt = `Analise esta captura de tela.
        Identifique o retângulo vermelho que marca o espaço do anúncio ${format}.
        Retorne APENAS um objeto JSON com as coordenadas [x, y, width, height] desse retângulo em pixels.
        
        IMPORTANTE: O arquivo de imagem agora tem largura de ${VISION_WIDTH}px.
        Responda as coordenadas BASEADAS NOS PIXELS REAIS DESTA IMAGEM que você está vendo agora.`;

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
            
            // 2. Scale coordinates back to 1920p original resolution
            const scaledResult: AdBox = {
                x: Math.round(rawResult.x * scaleFactor),
                y: Math.round(rawResult.y * scaleFactor),
                width: Math.round(rawResult.width * scaleFactor),
                height: Math.round(rawResult.height * scaleFactor)
            };

            console.log(`[VisionService] Detected and scaled box:`, scaledResult);
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
