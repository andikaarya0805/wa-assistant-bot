import { pullSession, pushSession, deleteSession } from './services/supabaseService.js';
import fs from 'fs';
import path from 'path';

async function sync() {
    console.log("--- Manual Session Sync ---\n");
    
    const SESSION_PATH = './baileys_auth';
    const credsFile = path.join(SESSION_PATH, 'creds.json');

    if (!fs.existsSync(credsFile)) {
        console.error("❌ ERROR: No 'creds.json' found in ./baileys_auth.");
        console.log("👉 Please run 'npm start' first and make sure the bot says 'Ready!'.");
        process.exit(1);
    }

    console.log("📦 Zipping and pushing session to Supabase...");
    try {
        await pushSession();
        console.log("\n✅ SUCCESS! Session is now in the cloud.");
        console.log("👉 You can now STOP your local bot (Ctrl+C) and let Cloud Run take over.");
    } catch (e) {
        console.error("❌ Sync failed:", e.message);
    }
}

sync();
