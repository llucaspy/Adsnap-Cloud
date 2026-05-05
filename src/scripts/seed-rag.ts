import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiKey = process.env.GEMINI_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(geminiKey);

async function seed() {
  console.log('Reading NEXUS_KNOWLEDGE.md...');
  const content = fs.readFileSync('./NEXUS_KNOWLEDGE.md', 'utf-8');
  
  const sections = content.split('##').filter(s => s.trim().length > 0);
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

  for (const section of sections) {
    const text = '##' + section;
    const title = section.split('\n')[0].trim();
    console.log(`Processing section: ${title}`);

    try {
      const result = await model.embedContent(text);
      const embedding = result.embedding.values;

      const { error } = await supabase.from('NexusKnowledge').upsert({
        content: text,
        embedding: embedding,
        metadata: { title, updated_at: new Date().toISOString() }
      }, { onConflict: 'content' });

      if (error) console.error(`Error saving ${title}:`, error);
      else console.log(`Saved ${title} successfully.`);
    } catch (e) {
      console.error(`Failed to embed ${title}:`, e);
    }
  }
  console.log('Seeding complete!');
}

seed();
