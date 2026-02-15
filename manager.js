import makeWASocket, { 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    jidDecode 
} from '@whiskeysockets/baileys';

import pino from 'pino';
import express from 'express';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import openRouterService from './services/openRouterService.js';
import { pullSession, pushSession, deleteSession } from './services/supabaseService.js';
const aiService = openRouterService;

const app = express();
const PORT = process.env.PORT || 8000;
const SESSION_PATH = './baileys_auth';

// --- Data Storage ---
const users = {};
const cooldowns = new Map();
const errorSilence = new Map();

const getUser = (id) => {
    if (!users[id]) users[id] = {
        isAfk: false,
        interactedUsers: new Set()
    };
    return users[id];
};

const userObj = getUser('system'); // Global system state

// --- Helpers ---
const decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
        const decode = jidDecode(jid) || {};
        return decode.user && decode.server && `${decode.user}@${decode.server}` || jid;
    }
    return jid;
};

// --- Connection Logic ---
let isConnecting = false;

async function startBot() {
    if (isConnecting) return;
    isConnecting = true;

    console.log("[System] Initializing Baileys Bot (ESM Mode)...");
    let hasQR = false;
    
    try {
        // 1. Pull Session from Supabase
        await pullSession();

        const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: [process.env.OWNER_NAME || "𝚍𝚞𝚖𝚙𝚒𝚢𝚎𝚢", "Chrome", "20.0.04"],
            markOnlineOnConnect: true,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr && !hasQR) {
                hasQR = true;
                console.log("[System] Scan QR Code required...");
                qrcode.generate(qr, { small: true });
                const qrLink = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=300x300`;
                console.log(`[Link Alternatif] ${qrLink}`);
            }

            if (connection === 'close') {
                isConnecting = false;
                const error = lastDisconnect?.error;
                const statusCode = error?.output?.statusCode || error?.statusCode;
                
                // Reconnect on everything except Logout (401)
                let shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                console.log(`[System] Connection Closed!`);
                console.log(`[System] - Status: ${statusCode}`);
                console.log(`[System] - Message: ${error?.message}`);
                console.log(`[System] - Reconnect: ${shouldReconnect}`);

                // Handle Logout (401) or Conflict (440) or Restart Required (515)
                if (
                    statusCode === DisconnectReason.loggedOut || 
                    statusCode === 440 || 
                    statusCode === 515
                ) {
                    console.log(`[System] Critical Error (${statusCode}). Clearing session to force fresh login...`);
                    if (fs.existsSync(SESSION_PATH)) fs.rmSync(SESSION_PATH, { recursive: true, force: true });
                    await deleteSession(); // Clear from Supabase too
                    shouldReconnect = true; // Force reconnect after clearing
                }

                if (shouldReconnect) {
                    console.log("[System] Reconnecting in 5 seconds...");
                    setTimeout(() => startBot(), 5000);
                }
            } else if (connection === 'open') {
                isConnecting = false;
                console.log('🚀 WhatsApp Bot is Ready! (Baileys Mode)');
                // Sync session to Supabase immediately
                await pushSession();
            }
        });

        // Debounced Creds Update to avoid spamming Supabase
        let credsTimeout;
        sock.ev.on('creds.update', async () => {
            await saveCreds();
            clearTimeout(credsTimeout);
            credsTimeout = setTimeout(async () => {
                console.log("[System] Periodic session sync to Supabase...");
                await pushSession();
            }, 30000); // 30 seconds debounce
        });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const senderJid = msg.key.remoteJid;
        const isMe = msg.key.fromMe;
        const body = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || "";
        
        const isGroup = senderJid.endsWith('@g.us');
        const senderNumber = decodeJid(senderJid);

        // --- Commands (Owner only) ---
        const cmd = body.trim().toLowerCase();
        if (isMe) {
            if (cmd === '!afk') {
                userObj.isAfk = true;
                console.log(">> AFK Mode Activated");
                await sock.sendMessage(senderJid, { text: '🔇 **AFK Mode ON**. Bot bakal bales chat otomatis.' });
                return;
            }
            if (cmd === '!back') {
                userObj.isAfk = false;
                userObj.interactedUsers.clear();
                console.log(">> AFK Mode Deactivated");
                await sock.sendMessage(senderJid, { text: '🔊 **AFK Mode OFF**. Bot berhenti bales chat.' });
                return;
            }
        }

        // --- AFK Response Logic ---
        if (!userObj.isAfk || isMe) return;

        // Bot behavior: Reply to DM or Tagged in Group
        const botId = decodeJid(sock.user.id);
        const isTagged = body.includes(`@${botId.split('@')[0]}`);

        if (isGroup && !isTagged) return;

        // Rate Limiting & Error Silence
        const now = Date.now();
        if (errorSilence.has(senderNumber) && now < errorSilence.get(senderNumber)) return;
        if (cooldowns.has(senderNumber) && (now - cooldowns.get(senderNumber)) < 5000) return;
        cooldowns.set(senderNumber, now);

        console.log(`[Userbot] Processing chat from ${senderNumber}: ${body.substring(0, 50)}...`);

        const ownerName = process.env.OWNER_NAME || "𝚍𝚞𝚖𝚙𝚒𝚢𝚎𝚢";
        const isFirstMessage = !userObj.interactedUsers.has(senderNumber);

        try {
            const reply = await aiService.generateContent(body, ownerName, isFirstMessage);
            if (isFirstMessage) userObj.interactedUsers.add(senderNumber);
            await sock.sendMessage(senderJid, { text: reply }, { quoted: msg });
        } catch (e) {
            console.error(`[AI Error]:`, e.message);
            if (e.message?.includes('429')) errorSilence.set(senderNumber, now + 60000);
        }
        });
    } catch (e) {
        isConnecting = false;
        console.error("[System] startBot Fatal Error:", e.message);
        setTimeout(() => startBot(), 10000);
    }
}

// Start bot
startBot();

// --- Health Check ---
app.get('/health', (req, res) => res.json({ status: 'alive', mode: 'baileys' }));
app.listen(PORT, () => console.log(`Health server running on port ${PORT}`));

// Global Error Handling
process.on('uncaughtException', (err) => console.error('CRASH:', err));
process.on('unhandledRejection', (reason) => console.error('REJECTION:', reason));
