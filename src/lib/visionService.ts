
export interface AdBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const VISION_MODEL = 'google/gemini-flash-1.5-8b'; // Fast, vision-capable and free on OpenRouter

/**
 * Uses AI Vision to detect an advertisement placeholder (red rectangle or clear ad space)
 * in a background template image.
 */
export async function detectAdBoxViaVision(imageUrl: string, format: string): Promise<AdBox | null> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        console.error('[VisionService] OPENROUTER_API_KEY not configured');
        return null;
    }

    console.log(`[VisionService] Analyzing image for format ${format}...`);

    try {
        const prompt = `Analise esta captura de tela de um site.
        O sistema marcou o espaço de um anúncio ${format} com um retângulo vermelho.
        Retorne APENAS um objeto JSON com as coordenadas EXATAS [x, y, width, height] desse retângulo vermelho em relação ao tamanho total da imagem (pixel-based).
        
        IMPORTANTE:
        1. A imagem tem 1920x1080.
        2. Seja extremamente preciso nos pixels.
        3. O formato esperado é ${format}.
        
        Exemplo de resposta:
        {"x": 100, "y": 200, "width": 728, "height": 90}`;

        const response = await fetch(OPENROUTER_URL, {
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
                            { type: 'image_url', image_url: { url: imageUrl } }
                        ]
                    }
                ],
                temperature: 0,
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) {
            console.error('[VisionService] Empty response from AI');
            return null;
        }

        try {
            const result = JSON.parse(content.replace(/```json|```/g, ''));
            if (result.x !== undefined && result.y !== undefined) {
                console.log(`[VisionService] Detected box:`, result);
                return result as AdBox;
            }
        } catch (e) {
            console.error('[VisionService] Failed to parse JSON result:', content);
        }

        return null;
    } catch (error) {
        console.error('[VisionService] Error:', error);
        return null;
    }
}
