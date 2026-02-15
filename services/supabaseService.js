const { createClient } = require('@supabase/supabase-js');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(process.env.DB_URL, process.env.DB_KEY);
const SESSION_PATH = './.wwebjs_auth';

/**
 * Download session from Supabase and extract to local folder
 */
async function pullSession() {
    console.log("[Supabase] Pulling session from database...");
    const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('session_zip')
        .eq('id', 'main-session')
        .single();

    if (error || !data || !data.session_zip) {
        console.log("[Supabase] No session found or error:", error?.message || "Empty data");
        return false;
    }

    try {
        const zipBuffer = Buffer.from(data.session_zip, 'base64');
        const zip = new AdmZip(zipBuffer);
        
        if (!fs.existsSync(SESSION_PATH)) fs.mkdirSync(SESSION_PATH, { recursive: true });
        
        zip.extractAllTo(SESSION_PATH, true);
        console.log("[Supabase] ✅ Session pulled and extracted successfully.");
        return true;
    } catch (e) {
        console.error("[Supabase] ❌ Error extracting session:", e.message);
        return false;
    }
}

/**
 * Zip local session folder and upload to Supabase
 */
async function pushSession() {
    if (!fs.existsSync(SESSION_PATH)) {
        console.log("[Supabase] No session folder to push.");
        return;
    }

    console.log("[Supabase] Pushing session to database...");
    try {
        const zip = new AdmZip();
        zip.addLocalFolder(SESSION_PATH);
        const base64Zip = zip.toBuffer().toString('base64');

        const { error } = await supabase
            .from('whatsapp_sessions')
            .upsert({
                id: 'main-session',
                session_zip: base64Zip,
                last_sync: new Date().toISOString()
            });

        if (error) throw error;
        console.log("[Supabase] ✅ Session pushed successfully.");
    } catch (e) {
        console.error("[Supabase] ❌ Error pushing session:", e.message);
    }
}

module.exports = { pullSession, pushSession };
