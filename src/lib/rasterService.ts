import sharp from 'sharp';

/**
 * Composites a creative image over a background template using Sharp for pixel-perfect rasterization.
 * 
 * @param backgroundUrl URL or Buffer of the background image (template)
 * @param creativeUrl URL or Buffer of the creative image
 * @param box Coordinates and dimensions { x, y, width, height } for placement
 * @returns Buffer of the finalized 1920x1080 PNG
 */
export async function compositeWithSharp(
    backgroundUrl: string, 
    creativeUrl: string, 
    box: { x: number; y: number; width: number; height: number }
): Promise<Buffer> {
    console.log(`[RasterService] Compositing: ${backgroundUrl?.substring(0, 50)}... + Creative`);

    try {
        // 1. Fetch images as buffers
        const [bgBuffer, creativeBuffer] = await Promise.all([
            fetchImage(backgroundUrl),
            fetchImage(creativeUrl)
        ]);

        // 2. Prepare the background (Ensure it's exactly 1920x1080)
        const bgBase = sharp(bgBuffer)
            .resize(1920, 1080, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } });

        // 3. Prepare the creative (Resize to fit the box precisely)
        const resizedCreative = await sharp(creativeBuffer)
            .resize({
                width: Math.round(box.width),
                height: Math.round(box.height),
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background for the creative if it doesn't fill the box
            })
            .toBuffer();

        // 4. Perform composition
        const finalImage = await bgBase
            .composite([{
                input: resizedCreative,
                left: Math.round(box.x),
                top: Math.round(box.y)
            }])
            .png()
            .toBuffer();

        console.log('[RasterService] Composition successful (1920x1080 PNG)');
        return finalImage;
    } catch (error) {
        console.error('[RasterService] Composition failed:', error);
        throw error;
    }
}

async function fetchImage(url: string): Promise<Buffer> {
    if (!url) throw new Error('Empty URL provided to fetchImage');
    
    // If it's already a public URL or valid absolute URL
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (err) {
        console.error(`[RasterService] Failed to fetch image from ${url}:`, err);
        throw err;
    }
}
