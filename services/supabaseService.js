const { createClient } = require('@supabase/supabase-js');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(process.env.DB_URL, process.env.DB_KEY);
const SESSION_PATH = './.wwebjs_auth';

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
        // Silent error, biar lari ke catch di pushSession aja nanti
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

    const TEMP_SYNC_PATH = './.wwebjs_auth_temp';
    console.log("[Supabase] Pushing session to storage...");
    
    try {
        await ensureBucket();

        if (fs.existsSync(TEMP_SYNC_PATH)) {
            fs.rmSync(TEMP_SYNC_PATH, { recursive: true, force: true });
        }
        
        fs.mkdirSync(TEMP_SYNC_PATH, { recursive: true });
        
        // List folder yang benar-benar boleh dibuang (Cache & Junk)
        // IndexedDB kita skip karena kegedean (125MB+), kita andelin Local Storage & Cookies
        const SKIP_FOLDERS = [
            'Cache', 'Code Cache', 'GPUCache', 'blob_storage', 
            'VideoDecodeStats', 'GrShaderCache', 'DawnCache', 
            'Extension State', 'File System', 'Session Storage', 
            'Previews', 'Sync Data', 'Crashpad', 'IndexedDB',
            'OptimizationGuidePredictionModels', 'CacheStorage',
            'Persistent', 'Local Extension Settings',
            'MediaFoundationWidevineUtils', 'hyphen-data'
        ];

        const copyFiles = (src, dest) => {
            if (!fs.existsSync(src)) return;
            const files = fs.readdirSync(src);
            for (const file of files) {
                const srcFile = path.join(src, file);
                const destFile = path.join(dest, file);
                const name = file.toLowerCase();

                // 1. Skip if in global skip list
                if (SKIP_FOLDERS.includes(file)) continue;
                
                // 2. Skip anything with "cache" in name if it's not a storage folder
                if (name.includes('cache') && !name.includes('storage') && !name.includes('db')) continue;

                const stat = fs.statSync(srcFile);
                if (stat.isDirectory()) {
                    fs.mkdirSync(destFile, { recursive: true });
                    copyFiles(srcFile, destFile);
                } else {
                    // 3. Skip heavy browser junk files
                    // JANGAN skip .log atau .ldb buat folder sisa (Local Storage dkk) karena itu nyimpen kunci login
                    const JUNK_EXT = ['.tmp', '.bak', '.old', '.db-journal', '.blob'];
                    if (JUNK_EXT.some(ext => name.endsWith(ext))) continue;

                    try {
                        fs.copyFileSync(srcFile, destFile);
                    } catch (e) {}
                }
            }
        };
        copyFiles(SESSION_PATH, TEMP_SYNC_PATH);

        const zip = new AdmZip();
        zip.addLocalFolder(TEMP_SYNC_PATH);
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
        
        fs.rmSync(TEMP_SYNC_PATH, { recursive: true, force: true });

    } catch (e) {
        console.error("[Supabase] ❌ Error pushing session:", e.message);
    }
}

module.exports = { pullSession, pushSession };
