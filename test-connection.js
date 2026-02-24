require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Testing connection to:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
    try {
        const { data, error } = await supabase.storage.listBuckets();
        if (error) {
            console.error('ERROR:', error.message);
            process.exit(1);
        } else {
            console.log('SUCCESS: Buckets found ->', data.map(b => b.name).join(', '));
            process.exit(0);
        }
    } catch (e) {
        console.error('CRITICAL ERROR:', e.message);
        process.exit(1);
    }
}

run();
