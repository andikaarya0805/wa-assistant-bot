const { pullSession } = require('./services/supabaseService');

(async () => {
    console.log("--- Supabase Session Bypass ---");
    const success = await pullSession();
    if (success) {
        console.log("--- SEKARANG LO BISA JALANIN: npm start ---");
    } else {
        console.log("--- Gagal narik session, silakan scan QR nanti ---");
    }
})();
