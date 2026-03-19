export async function classifyEmail(subject: string, snippet: string, from: string): Promise<boolean> {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) return false;

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const payload = {
        contents: [{
            parts: [{
                text: `
                    Analise o e-mail abaixo e determine se ele é uma CONVERSA DIRETA entre pessoas ou uma discussão relevante sobre campanhas de publicidade.

                    EXEMPLOS DE CONVERSAS (SIM):
                    - Discussão sobre propostas de mídia, adservers, peças ou criativos.
                    - Alguém perguntando sobre o status de um PI ou campanha.
                    - Negociações diretas ou dúvidas técnicas enviadas por uma pessoa.
                    - E-mails encaminhados (Fwd) que contêm propostas ou planos.

                    EXEMPLOS DE RUÍDO (NAO):
                    - Notificações automáticas de emissão de Nota Fiscal (NF).
                    - Newsletters comerciais genéricas.
                    - Alertas de sistema ou segurança.
                    - Confirmações automáticas de recebimento.

                    DE: ${from}
                    ASSUNTO: ${subject}
                    SNIPPET: ${snippet}

                    Responda APENAS "SIM" se for uma conversa direta relevante, ou "NAO" se for apenas ruído/automação.
                `
            }]
        }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase() || '';
        return text.includes('SIM');
    } catch (error) {
        console.error('Gemini Rest API Error:', error);
        return false;
    }
}
