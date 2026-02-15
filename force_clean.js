import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.DB_URL, process.env.DB_KEY);
const BUCKET_NAME = 'whatsapp-sessions';

(async () => {
    console.log("--- FORCE CLEANING SESSION ---");

    // 1. Check if bucket exists
    const { data: bucket, error: bucketError } = await supabase.storage.getBucket(BUCKET_NAME);
    if (bucketError) {
        console.log(`[Check] Bucket error: ${bucketError.message}`);
    } else {
        console.log(`[Check] Bucket found.`);
    }

    // 2. List files
    const { data: files, error: listError } = await supabase.storage.from(BUCKET_NAME).list();
    if (files && files.length > 0) {
        console.log(`[List] Found files:`, files.map(f => f.name));
        
        // 3. Delete 'session.zip' if exists
        const sessionFile = files.find(f => f.name === 'session.zip');
        if (sessionFile) {
            console.log(`[Delete] Removing session.zip...`);
            const { data: delData, error: delError } = await supabase.storage
                .from(BUCKET_NAME)
                .remove(['session.zip']);
            
            if (delError) console.error(`[Delete] Failed:`, delError);
            else console.log(`[Delete] Success:`, delData);
        } else {
            console.log(`[Delete] session.zip not found in list.`);
        }
    } else {
        console.log(`[List] Bucket is empty or listing failed.`);
    }

    // 4. Double check
    const { data: filesAfter } = await supabase.storage.from(BUCKET_NAME).list();
    const stillExists = filesAfter?.some(f => f.name === 'session.zip');
    
    if (stillExists) {
        console.error("❌ CRITICAL: Session still exists after deletion attempt!");
    } else {
        console.log("✅ CLEANUP COMPLETE. Session is GONE.");
    }
})();
