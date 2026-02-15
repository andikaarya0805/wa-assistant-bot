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
        
        // List folder yang mau di-skip total (SANGAT agresif buat hemat storage)
        const SKIP_FOLDERS = [
            'Cache', 'Code Cache', 'GPUCache', 'Service Worker', 
            'blob_storage', 'databases', 'VideoDecodeStats', 
            'GrShaderCache', 'DawnCache', 'Extension State',
            'File System', 'Session Storage', 'Previews',
            'WebStorage', 'Sync Data', 'Sessions', 'Crashpad',
            'OptimizationGuidePredictionModels', 'CacheStorage',
            'Storage', 'Persistent', 'IndexedDB', 'Local Extension Settings'
        ];

        const copyFiles = (src, dest) => {
            if (!fs.existsSync(src)) return;
            const files = fs.readdirSync(src);
            for (const file of files) {
                const srcFile = path.join(src, file);
                const destFile = path.join(dest, file);
                
                // Skip folders in list
                if (SKIP_FOLDERS.includes(file)) continue;
                
                // Skip generic heavy patterns
                const name = file.toLowerCase();
                if (name.includes('cache') || name.includes('logs') || name.includes('tmp')) continue;

                const stat = fs.statSync(srcFile);
                if (stat.isDirectory()) {
                    fs.mkdirSync(destFile, { recursive: true });
                    copyFiles(srcFile, destFile);
                } else {
                    // Hanya izinkan file essensial buat login (biasanya file kecil di Local Storage/root)
                    // Skip data database .ldb, .log, .blob yang bikin gendut
                    const FORBIDDEN_EXT = ['.ldb', '.log', '.blob', '.tmp', '.bak', '.old', '.db-journal'];
                    if (FORBIDDEN_EXT.some(ext => name.endsWith(ext)) || name === 'log' || name === 'log.old') {
                        continue;
                    }

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
            throw error;
        }
        console.log("[Supabase] ✅ Session uploaded to Storage successfully.");
        
        fs.rmSync(TEMP_SYNC_PATH, { recursive: true, force: true });

    } catch (e) {
        console.error("[Supabase] ❌ Error pushing session:", e.message);
    }
}

module.exports = { pullSession, pushSession };
