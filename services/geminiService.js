import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

// System prompt template
const BASE_PROMPT = `Roleplay: Lo asisten pribadinya ${process.env.OWNER_NAME || 'Bos'}. Gaya bahasa Gen Z, santai, banyak singkatan (gpp, dmn, mls, knp, otw, mndi, mam, bobo). JANGAN PERNAH pake bahasa baku, formal, atau kaku. JANGAN intro bertele-tele. Pake 'lo-gue'. Kalau user ngomong kasar/toxic/sange, TETEP KALEM & SANTAI. Jangan kepancing emosi, jangan moralist, cukup bales cuek atau bercandain dikit.
KHUSUS: Kalo user minta penjelasan, tutorial, cara kerja, atau nanya serius (misal: "Jelasin Docker"), lo harus jawab DETAIL & INFORMATIF tapi tetep pake gaya bahasa Gen Z asisten santai lo. Gak perlu lagi dibatesin 1-2 kalimat kalo emang butuh penjelasan panjang.`;

async function generateContent(userText, history = [], ownerName = "Bos", isFirstMessage = true, afkReason = "") {
  let instruction = "";

  if (isFirstMessage) {
    instruction = `Instruksi: Bales seolah lo asisten ${ownerName}. Kasih tau kalau ${ownerName} lagi afk${afkReason ? ' karena ' + afkReason : ''}. Kalo ini cuma chat basa-basi, bales singkat aja (max 1 kalimat). Tapi kalo user nanya sesuatu yang butuh penjelasan, jawab aja yang bener & detail pake gaya lo. Contoh basa-basi: "Oi, gue asistennya ${ownerName}, dia lagi afk buat ${afkReason}. Ada apa?"`;
  } else {
    instruction = `Instruksi: ${ownerName} masih belum balik${afkReason ? ' (lagi ' + afkReason + ')' : ''}. Ladinin omongan user ini sesuai konteks. Kalo chat biasa, tetep singkat & santai. Kalo dia nanya penjelasan/tanya serius, JAWAB DETAIL seperlunya tapi tetep pake lo-gue santai.`;
  }

  const dynamicPrompt = `${BASE_PROMPT} \n\n${instruction}`;

  if (!userText) return "Waduh, pesannya kosong nih bro.";

  // Construct contents with history + current message
  const contents = [
    ...history,
    {
      role: "user",
      parts: [{ text: userText }]
    }
  ];

  const payload = {
    system_instruction: {
      parts: [{
        text: dynamicPrompt
      }]
    },
    contents: contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 800
    }
  };

  try {
    const response = await axios.post(GEMINI_URL, payload, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (
      response.data &&
      response.data.candidates &&
      response.data.candidates.length > 0 &&
      response.data.candidates[0].content &&
      response.data.candidates[0].content.parts &&
      response.data.candidates[0].content.parts.length > 0
    ) {
      return response.data.candidates[0].content.parts[0].text;
    } else {
      return "Sorry bro, lagi error nih AI-nya. Coba lagi nanti ya.";
    }

  } catch (error) {
    if (error.response) {
      console.error('Error calling Gemini API (Response Data):', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error calling Gemini API (Message):', error.message);
    }
    if (error.code === 'ECONNABORTED') {
      return "Sabar ya bro, lagi mikir keras nih... (Timeout)";
    }
    const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    return `Ada masalah teknis nih bro: ${errMsg.substring(0, 100)}. Sorry spam.`;
  }
}

export default {
  generateContent
};