const express = require('express');
const qrcode = require('qrcode-terminal');
const {
    Client,
    LocalAuth
} = require('whatsapp-web.js');
const geminiService = require('./services/geminiService');
const openRouterService = require('./services/openRouterService');
const { pullSession, pushSession } = require('./services/supabaseService');
const aiService = openRouterService;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

// --- Process Monitoring ---
process.on('uncaughtException', (err) => console.error('CRASH:', err));
process.on('unhandledRejection', (reason) => console.error('REJECTION:', reason));

const fs = require('fs');

// Helper: Find Local Browser (Chrome/Edge) for Windows
const getLocalBrowserPath = () => {
    const paths = [
        // Windows
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        // Linux / Docker
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
    ];
    for (const path of paths) {
        if (fs.existsSync(path)) return path;
    }
    return null;
};

const browserPath = getLocalBrowserPath();
if (browserPath) console.log(`[System] Found local browser: ${browserPath}`);

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: browserPath || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-default-apps',
            '--mute-audio',
            '--hide-scrollbars',
            '--disable-features=IsolateOrigins,site-per-process', // Hemat RAM signifikan
            '--js-flags=--max-old-space-size=256' // Tanpa kutip ganda biar aman di shell
        ],
        headless: true,
        timeout: 90000 // Naikkan ke 90 detik
    },
    authTimeoutMs: 90000,
    qrMaxRetries: 10
});

// Event handling buat deteksi crash
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Fatal] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[Fatal] Uncaught Exception:', err);
});

client.on('qr', (qr) => {
    console.log('Scan QR Code ini untuk login WhatsApp:');
    qrcode.generate(qr, {
        small: true
    });
    
    // Fallback buat console yang berantakan (seperti Koyeb)
    const qrLink = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=300x300`;
    console.log(`\n[Link Alternatif] Kalau QR di atas berantakan, buka link ini buat scan:`);
    console.log(qrLink);
});

client.on('ready', async () => {
    console.log('✅ WhatsApp Bot Ready!');
    // Kasih jeda dikit biar file session bener-bener ketulis kelar
    console.log('[System] Menunggu 5 detik sebelum sync ke Supabase...');
    setTimeout(async () => {
        await pushSession();
    }, 5000);
});

// In-Memory Storage
const users = {};
const cooldowns = new Map();
const errorSilence = new Map();

const getUser = (id) => {
    if (!users[id]) users[id] = {
        isAfk: false,
        queue: [],
        isProcessingQueue: false,
        interactedUsers: new Set()
    };
    return users[id];
};

client.on('message_create', async (msg) => {
    const chat = await msg.getChat();
    const senderId = msg.from;
    const body = msg.body || "";
    const isGroup = chat.isGroup;

    // Debug Log
    console.log(`[Incoming] From: ${senderId} | Body: "${body}" | Type: ${msg.type} | FromMe: ${msg.fromMe}`);

    // Default system user
    const userObj = getUser('system');

    // --- COMMANDS (Only for owner) ---
    const cmd = body.trim().toLowerCase();
    if (msg.fromMe) {
        if (cmd === '!afk') {
            userObj.isAfk = true;
            console.log(">> AFK Mode Activated");
            return msg.reply('🔇 **AFK Mode ON**. Bot bakal bales chat otomatis.');
        }
        if (cmd === '!back') {
            userObj.isAfk = false;
            userObj.interactedUsers.clear();
            console.log(">> AFK Mode Deactivated");
            return msg.reply('🔊 **AFK Mode OFF**. Bot berhenti bales chat.');
        }
    }

    // --- DECISION LOGIC (Ignore if...) ---
    if (!userObj.isAfk) return;

    const isMentioned = msg.mentionedIds.includes(client.info.wid._serialized);
    const isStatus = msg.from === 'status@broadcast';

    // 1. Group check
    if (isGroup && !isMentioned) {
        console.log(`[Userbot] 🛡️ Ignored Group Chat (No Mention) from ${senderId}`);
        return;
    }

    // 2. Status/Broadcast check
    if (isStatus) {
        console.log(`[Userbot] 🛡️ Ignored Status Update from ${senderId}`);
        return;
    }

    if (msg.fromMe) return;

    console.log(`[Userbot] Decision: Processing incoming chat from ${senderId}${isGroup ? ' (Group Mention)' : ''}`);

    // --- FILTERING ---
    // 1. Media check
    if (msg.hasMedia || msg.type !== 'chat') {
        console.log(`[Userbot] Ignored media/non-chat from ${senderId}`);
        return;
    }

    // 2. Emoji-Only check
    const text = msg.body || "";
    const emojiRegex = /^[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{1F170}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F18E}\u{1F191}-\u{1F19A}\u{203C}\u{2049}\u{2122}\u{2139}\u{2194}-\u{2199}\u{21A9}-\u{21AA}\u{231A}-\u{231B}\u{2328}\u{2388}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{24C2}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2600}-\u{2604}\u{260E}\u{2611}\u{2614}-\u{2615}\u{2618}\u{261D}\u{2620}\u{2622}-\u{2623}\u{2626}\u{262E}-\u{262F}\u{2638}-\u{263A}\u{2640}\u{2642}\u{2648}-\u{2653}\u{265F}\u{2660}\u{2663}\u{2665}-\u{2666}\u{2668}\u{267B}\u{267E}-\u{267F}\u{2692}-\u{2697}\u{2699}\u{269B}-\u{269C}\u{26A0}-\u{26A1}\u{26A7}\u{26AA}-\u{26AB}\u{26B0}-\u{26B1}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26C8}\u{26CE}-\u{26CF}\u{26D1}\u{26D3}-\u{26D4}\u{26E9}-\u{26EA}\u{26F0}-\u{26F5}\u{26F7}-\u{26FA}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}-\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}-\u{2764}\u{27A1}\u{27B0}\u{27BF}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}\s]+$/u;

    if (text && emojiRegex.test(text)) {
        console.log(`[Userbot] Ignored emoji-only from ${senderId}`);
        return;
    }

    // --- QUEUEING ---
    userObj.queue.push({
        msg,
        senderId,
        text
    });
    console.log(`[Userbot] Message from ${senderId} queued.`);
    processQueue(userObj);
});

async function processQueue(userObj) {
    if (userObj.isProcessingQueue || userObj.queue.length === 0) return;
    userObj.isProcessingQueue = true;

    while (userObj.queue.length > 0) {
        const {
            msg,
            senderId,
            text
        } = userObj.queue.shift();

        try {
            if (!userObj.isAfk) continue;

            const now = Date.now();
            if (errorSilence.has(senderId) && now < errorSilence.get(senderId)) continue;
            if (cooldowns.has(senderId) && (now - cooldowns.get(senderId)) < 5000) continue;
            cooldowns.set(senderId, now);

            console.log(`[Userbot] Processing chat from ${senderId}: ${text}`);

            const ownerName = process.env.OWNER_NAME || "𝚍𝚞𝚖𝚙𝚒𝚢𝚎𝚢";
            const isFirstMessage = !userObj.interactedUsers.has(senderId);

            try {
                const reply = await aiService.generateContent(text, ownerName, isFirstMessage);
                if (isFirstMessage) userObj.interactedUsers.add(senderId);
                await msg.reply(reply);
            } catch (e) {
                console.error(`[Userbot] Error:`, e.message);
                if (e.message?.includes('429')) errorSilence.set(senderId, now + 60000);
            }

        } catch (err) {
            console.error("[Userbot] Queue Error:", err);
        }

        if (userObj.queue.length > 0) {
            console.log(`[Userbot] Waiting 10s...`);
            await new Promise(r => setTimeout(r, 10000));
        }
    }
    userObj.isProcessingQueue = false;
}

(async () => {
    // 1. Ambil session dari Supabase dulu
    await pullSession();

    // 2. Start WhatsApp Client
    client.initialize();
})();

app.get('/health', (req, res) => res.json({
    status: 'alive'
}));
app.listen(PORT, () => console.log(`Health server running on port ${PORT}`));