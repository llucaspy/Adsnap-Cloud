require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testUpload() {
    console.log('Testing Supabase Storage upload (Self-contained)...');

    const dummyImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

    const storagePath = `test/dummy-${Date.now()}.png`;

    const { data, error } = await supabase.storage
        .from('screenshots')
        .upload(storagePath, dummyImage, {
            contentType: 'image/png',
            upsert: true
        });

    if (error) {
        if (error.message.includes('bucket not found')) {
            console.error('ERROR: Bucket "screenshots" does not exist. Please create it manually in your Supabase dashboard (Storage > New Bucket).');
        } else {
            console.error('Upload error:', error.message);
        }
        return;
    }

    console.log('Upload successful!', data.path);

    const { data: { publicUrl } } = supabase.storage
        .from('screenshots')
        .getPublicUrl(storagePath);

    console.log('Public URL:', publicUrl);
}

testUpload();
