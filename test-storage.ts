import 'dotenv/config'
import { supabase } from './src/lib/supabase'
import fs from 'fs'

async function testUpload() {
    console.log('Testing Supabase Storage upload...')

    // Create a tiny dummy image (1x1 transparent PNG)
    const dummyImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

    const { data, error } = await supabase.storage
        .from('screenshots')
        .upload('test/dummy-1.png', dummyImage, {
            contentType: 'image/png',
            upsert: true
        })

    if (error) {
        if (error.message.includes('bucket not found')) {
            console.error('ERROR: Bucket "screenshots" does not exist. Please create it in Supabase dashboard.')
        } else {
            console.error('Upload error:', error)
        }
        return
    }

    console.log('Upload successful!', data)

    const { data: { publicUrl } } = supabase.storage
        .from('screenshots')
        .getPublicUrl('test/dummy-1.png')

    console.log('Public URL:', publicUrl)
}

testUpload()
