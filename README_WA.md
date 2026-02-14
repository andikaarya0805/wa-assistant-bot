# Cara Pakai & Run wa-gemini-bot 🚀

Ikuti langkah ini buat jalanin bot WhatsApp lo secara lokal sebelum nanti di-deploy.

### 1. Persiapan Awal
Buka terminal/CMD lo, pastiin udah ada di folder `wa-gemini-bot`:
```bash
cd D:\dika\tugas\wa-gemini-bot
```

### 2. Install Bensin (Dependencies)
Jalanin perintah ini buat nginstall semua library yang dibutuhin (WhatsApp, AI, dll):
```bash
npm install
```

### 3. Cara Jalanin Bot
Ketik perintah ini buat mulai:
```bash
node manager.js
```

### 4. Login (Scan QR)
*   Tunggu beberapa detik sampe muncul **QR Code** gede di terminal lo.
*   Buka WhatsApp di HP lo -> **Settings** -> **Linked Devices** -> **Link a Device**.
*   Scan QR Code yang ada di terminal itu.
*   Kalau berhasil, terminal bakal muncul tulisan: `✅ WhatsApp Bot Ready!`.

### 5. Cara Penggunaan (Command)
Bot ini punya sistem saklar (AFK Mode). Lo bisa ketik ini di chat (bisa chat ke diri sendiri atau ke nomor bot):
*   `!afk` : Nyalain robot. Bot bakal mulai bales chat pribadi yang masuk otomatis pake gaya Gen Z.
*   `!back` : Matiin robot. Bot berhenti bales chat.

### 6. Tips Buat Deploy (Railway/Server)
Kalau mau di-deploy ke Railway atau server lain:
1.  **Gak Perlu Push Folder `.wwebjs_auth`**: Folder ini bakal kebuat otomatis buat nyimpen session login lo.
2.  **Puppeteer Buildpack**: Di server (kayak Railway/Koyeb), lo butuh install **Chromium/Chrome**. Pastiin lo tambah Buildpack atau instal `chromium` manual biar kodenya gak crash.
3.  **Persistence**: Karena `RemoteAuth` lebih ribet, paling gampang sementara pake `LocalAuth`. Tapi lo mungkin kudu scan ulang kalau server lo "restart" total dan folder `.wwebjs_auth`-nya ilang.

---
**Catatan Penting**: 
- Bot ini otomatis **ngabaiin grup** biar lo gak di-kick karena spam. 
- Filter media & emoji udah aktif biar hemat kuota Gemini.
- Jeda 10 detik antar chat biar aman dari banned WA.
