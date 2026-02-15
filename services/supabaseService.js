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

    const TEMP_SYNC_PATH = './.wwebjs_auth_temp';
    console.log("[Supabase] Pushing session to database...");
    
    try {
        // Hapus temp lama kalo ada
        if (fs.existsSync(TEMP_SYNC_PATH)) {
            fs.rmSync(TEMP_SYNC_PATH, { recursive: true, force: true });
        }
        
        // Copy folder ke temp buat nge-zip (biar gak kena EBUSY)
        // Kita pake try-catch per file biar kalo ada yang kelock (kayak LOCK file) gak bikin se-proses gagal
        fs.mkdirSync(TEMP_SYNC_PATH, { recursive: true });
        const copyFiles = (src, dest) => {
            const files = fs.readdirSync(src);
            for (const file of files) {
                const srcFile = path.join(src, file);
                const destFile = path.join(dest, file);
                const stat = fs.statSync(srcFile);
                if (stat.isDirectory()) {
                    fs.mkdirSync(destFile, { recursive: true });
                    copyFiles(srcFile, destFile);
                } else {
                    try {
                        fs.copyFileSync(srcFile, destFile);
                    } catch (e) {
                        // Skip kalo file lagi dipake (EBUSY)
                        console.log(`[Supabase] Skiping busy file: ${file}`);
                    }
                }
            }
        };
        copyFiles(SESSION_PATH, TEMP_SYNC_PATH);

        const zip = new AdmZip();
        zip.addLocalFolder(TEMP_SYNC_PATH);
        const buffer = zip.toBuffer();
        const base64Zip = buffer.toString('base64');
        
        console.log(`[Supabase] Zip size: ${(buffer.length / 1024).toFixed(2)} KB`);

        const { error } = await supabase
            .from('whatsapp_sessions')
            .upsert({
                id: 'main-session',
                session_zip: base64Zip,
                last_sync: new Date().toISOString()
            });

        if (error) {
            console.error("[Supabase] ❌ Supabase Error Details:", JSON.stringify(error, null, 2));
            throw error;
        }
        console.log("[Supabase] ✅ Session pushed successfully.");
        
        // Bersihin temp
        fs.rmSync(TEMP_SYNC_PATH, { recursive: true, force: true });

    } catch (e) {
        console.error("[Supabase] ❌ Error pushing session:", e.message);
    }
}

module.exports = { pullSession, pushSession };
