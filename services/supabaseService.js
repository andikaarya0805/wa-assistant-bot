const { createClient } = require('@supabase/supabase-js');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(process.env.DB_URL, process.env.DB_KEY);
const SESSION_PATH = './baileys_auth';

const BUCKET_NAME = 'whatsapp-sessions';

/**
 * Ensure bucket exists in Supabase
 */
async function ensureBucket() {
    try {
        const { data, error } = await supabase.storage.getBucket(BUCKET_NAME);
        if (error) {
            console.log(`[Supabase] Bucket '${BUCKET_NAME}' issue: ${error.message}`);
            console.log(`[Supabase] Mencoba membuat bucket baru...`);
            await supabase.storage.createBucket(BUCKET_NAME, { public: false });
        }
    } catch (e) {
        // Silent error
    }
}

/**
 * Download session from Supabase Storage and extract to local folder
 */
async function pullSession() {
    console.log("[Supabase] Pulling session from storage...");
    try {
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .download('session.zip');

        if (error) {
            console.log("[Supabase] ⚠️ No session found in storage or error:", error.message);
            return false;
        }

        const arrayBuffer = await data.arrayBuffer();
        const zip = new AdmZip(Buffer.from(arrayBuffer));
        
        if (!fs.existsSync(SESSION_PATH)) fs.mkdirSync(SESSION_PATH, { recursive: true });
        
        zip.extractAllTo(SESSION_PATH, true);
        console.log("[Supabase] ✅ Session pulled and extracted successfully.");
        return true;
    } catch (e) {
        console.error("[Supabase] ❌ Error in pullSession:", e.message);
        return false;
    }
}

/**
 * Zip local session folder and upload to Supabase Storage
 */
async function pushSession() {
    if (!fs.existsSync(SESSION_PATH)) {
        console.log("[Supabase] No session folder to push.");
        return;
    }

    console.log("[Supabase] Pushing session to storage...");
    
    try {
        await ensureBucket();

        const zip = new AdmZip();
        // Baileys session is just small JSON files, no need to filter like Chrome
        zip.addLocalFolder(SESSION_PATH);
        const buffer = zip.toBuffer();
        
        console.log(`[Supabase] Zip size: ${(buffer.length / 1024).toFixed(2)} KB`);

        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload('session.zip', buffer, {
                upsert: true,
                contentType: 'application/zip'
            });

        if (error) {
            console.error("[Supabase] ❌ Storage Error Details:", error);
            console.log("[Supabase] 💡 Tip: Pastikan pakai 'service_role' key di .env biar gak kena blokir RLS.");
            throw error;
        }
        const now = new Date().toLocaleTimeString();
        console.log(`[Supabase] ✅ Session uploaded (${now}) successfully.`);
        
    } catch (e) {
        console.error("[Supabase] ❌ Error pushing session:", e.message);
    }
}

module.exports = { pullSession, pushSession };
