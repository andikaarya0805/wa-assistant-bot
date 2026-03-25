import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import 'dotenv/config';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import NodeCache from 'node-cache';
import http from 'http';
import geminiService from './services/geminiService.js';
import qrcodeLogger from 'qrcode-terminal';
import fs from 'fs';

const port = process.env.PORT || 3001;
const sessionDir = 'baileys_auth';
const ownerName = process.env.OWNER_NAME || 'dika';

const msgRetryCounterCache = new NodeCache();

let messageQueue = [];
let isProcessingQueue = false;

// Global AFK storage
let globalAfkReason = null;

async function processQueue(sock) {
    if (isProcessingQueue || messageQueue.length === 0) return;
    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        const { remoteJid, messageText, pushName, isGroup } = messageQueue.shift();

        try {
            await sock.readMessages([{ remoteJid, id: 'processing', participant: remoteJid }]);
            await sock.sendPresenceUpdate('composing', remoteJid);

            const prompt = `Nama pengirim: ${pushName}. Jika kamu membalas, sesuaikan gaya bahasa dengan nama pengirim.\n\nPesan: ${messageText}`;
            
            // Pass correct parameters to Gemini Service
            const aiResponse = await geminiService.generateContent(
                prompt, 
                [], 
                ownerName, 
                true, 
                globalAfkReason || ""
            );

            await sock.sendMessage(remoteJid, { text: aiResponse });
            console.log(`[AI Responded] to ${pushName}: ${aiResponse.substring(0, 50)}...`);
        } catch (error) {
            console.error('[Error processing message]:', error.message);
            await sock.sendMessage(remoteJid, { text: 'Maaf, Ustad Roy lagi pusing (error).' });
        }

        // Delay to prevent spam (3 seconds)
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    isProcessingQueue = false;
}

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

const blocklistFile = 'blocklist.json';
let blocklist = new Set();
if (fs.existsSync(blocklistFile)) {
    try {
        blocklist = new Set(JSON.parse(fs.readFileSync(blocklistFile, 'utf-8')));
    } catch (e) {
        console.error('Failed to load blocklist:', e.message);
    }
}

function saveBlocklist() {
    fs.writeFileSync(blocklistFile, JSON.stringify([...blocklist]));
}

async function startBot() {
    console.log('Starting WhatsApp Baileys Bot...');

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), // Hide noisy logs
        printQRInTerminal: false, // We handle QR manually for links
        auth: state,
        msgRetryCounterCache,
        generateHighQualityLinkPreview: true,
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n--- BUKA LINK INI DI BROWSER BUAT SCAN QR ---');
            console.log(`Pencet CTRL + Klick Link: https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=300x300`);
            console.log('-------------------------------------------\n');
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to', lastDisconnect.error, 'reconnecting:', shouldReconnect);
            
            if (shouldReconnect) {
                setTimeout(startBot, 5000);
            } else {
                console.log('You are logged out! Please delete baileys_auth folder and scan again.');
                process.exit();
            }
        } else if (connection === 'open') {
            console.log('=================================');
            console.log('✅ WhatsApp Web Client is ready! (Baileys VM Edition)');
            console.log('=================================');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        
        const msg = m.messages[0];
        if (!msg.message) return;

        const remoteJid = msg.key.remoteJid;

        // Skip if blocked
        if (blocklist.has(remoteJid) && !msg.key.fromMe) return;

        const pushName = msg.pushName || 'Seseorang';
        const isGroup = remoteJid.endsWith('@g.us');

        // Extract text depending on message type
        let messageText = '';
        if (msg.message.conversation) {
            messageText = msg.message.conversation;
        } else if (msg.message.extendedTextMessage) {
            messageText = msg.message.extendedTextMessage.text;
        } else if (msg.message.imageMessage?.caption) {
            messageText = msg.message.imageMessage.caption;
        }
        
        if (!messageText) return;

        // WAJIB PAKE PREFIX (! ATAU .) UNTUK COMMANDS
        const hasPrefix = messageText.startsWith('!') || messageText.startsWith('.');

        // CEK APAKAH BOT (KITA) DI-TAG DI GRUP
        const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const isMentioned = mentionedJids.includes(myJid);

        // Kalau pesan dari HI (fromMe) tapi GAK ada prefix, abaikan
        // Ini biar gak terjadi looping kalau bot nge-repost pesan AI-nya sendiri
        if (msg.key.fromMe && !hasPrefix) return;

        console.log(`\nIncoming [${isGroup ? 'Group' : 'Direct'}]: ${pushName} (${remoteJid})`);
        console.log(`Content: ${messageText}`);

        // Skip emoji only
        const emojiRegex = /^[\p{Emoji}\s]+$/u;
        if (emojiRegex.test(messageText.trim())) {
            console.log('Skipping emoji only message.');
            return;
        }

        // Kalau nggak ada prefix, tetep bisa dibales AI kalo itu Direct Chat atau kalo di-TAG
        // Tapi kalo di Grup tanpa Tag & tanpa Prefix, abaikan (biar gak spam)
        if (!hasPrefix && isGroup && !isMentioned) {
            console.log('Skipping Group message: No prefix and not mentioned.');
            return;
        }

        console.log(`[Processing] ${pushName}: ${messageText}`);

        // AFK & Command logic
        try {
            // ADMIN ONLY (FROM ME)
            if (msg.key.fromMe) {
                if (messageText.startsWith('!block')) {
                    let target = remoteJid;
                    const arg = messageText.replace('!block', '').trim();
                    if (arg) {
                        target = arg.replace(/[^0-9]/g, '');
                        if (target.startsWith('0')) target = '62' + target.slice(1);
                        if (!target.endsWith('@s.whatsapp.net')) target += '@s.whatsapp.net';
                    }
                    blocklist.add(target);
                    saveBlocklist();
                    await sock.sendMessage(remoteJid, { text: `Target *${target}* berhasil di-block!` });
                    return;
                }
                if (messageText.startsWith('!unblock')) {
                    let target = remoteJid;
                    const arg = messageText.replace('!unblock', '').trim();
                    if (arg) {
                        target = arg.replace(/[^0-9]/g, '');
                        if (target.startsWith('0')) target = '62' + target.slice(1);
                        if (!target.endsWith('@s.whatsapp.net')) target += '@s.whatsapp.net';
                    }
                    blocklist.delete(target);
                    saveBlocklist();
                    await sock.sendMessage(remoteJid, { text: `Target *${target}* berhasil di-unblock!` });
                    return;
                }
                if (messageText === '!listblock') {
                    const list = blocklist.size > 0 ? [...blocklist].join('\n') : 'Kosong bro.';
                    await sock.sendMessage(remoteJid, { text: `Daftar Blocklist:\n${list}` });
                    return;
                }
            }

            if (messageText.startsWith('!afk')) {
                const reason = messageText.replace('!afk', '').trim() || 'Sedang sibuk/tidak aktif';
                globalAfkReason = reason;
                await sock.sendMessage(remoteJid, { text: `bos *${ownerName}* is AFK: ${reason}\n\n_Auto-Reply AI active globally._`});
                console.log(`[AFK On] globally: ${reason}`);
                return;
            }
            if (messageText === '!back') {
                if (globalAfkReason) {
                    globalAfkReason = null;
                    await sock.sendMessage(remoteJid, { text: `bos *${ownerName}* sudah kembali aktif!`});
                    console.log(`[AFK Off] globally.`);
                }
                return;
            }
        } catch (err) {
            console.error('[Error sending command response]:', err.message);
        }

        messageQueue.push({ remoteJid, messageText, pushName, isGroup });
        if (!isProcessingQueue) {
            processQueue(sock);
        }
    });
}

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Gemini WhatsApp Bot (Baileys VM) is running.\n');
});

server.listen(port, () => {
    console.log(`[HTTP] Server is running on port ${port}`);
    startBot();
});
