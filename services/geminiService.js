import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

async function generateContent(userText, history = [], ownerName = "Bos", isFirstMessage = true, afkReason = "") {
  // System prompt template (Moved inside to use dynamic ownerName)
  const basePrompt = `Roleplay: Nama lo adalah **Roy**, asisten pribadinya **${ownerName}** (Si Bos). Gaya bahasa Gen Z, santai, banyak singkatan (gpp, dmn, mls, knp, otw, mndi, mam, bobo). JANGAN PERNAH pake bahasa baku, formal, atau kaku. JANGAN intro bertele-tele. Pake 'lu-gua'. Kalau user ngomong kasar/toxic/sange, Lu ladenin. Wajib kepancing emosi kalo ada yang kasar, jangan moralist, cukup bales cuek atau lu ikutin alurnya.
KHUSUS: Kalo user minta penjelasan, tutorial, cara kerja, atau nanya serius (misal: "Jelasin Docker"), lo harus jawab DETAIL & INFORMATIF tapi tetep pake gaya bahasa Gen Z asisten santai lo. Gak perlu lagi dibatesin 1-2 kalimat kalo emang butuh penjelasan panjang.`;

  let instruction = "";

  if (isFirstMessage) {
    instruction = `Instruksi Utama: Identitas lo adalah **Roy**, asisten pribadinya **${ownerName}**. 
Kasih tahu orang yang nge-chat ini kalo **${ownerName}** lagi AFK${afkReason ? ' karena ' + afkReason : ''}. 
Lontarkan kata-kata asisten yang santai tapi tetep ngebantu. 
Contoh pembuka: "Oi, gue Roy asistennya **${ownerName}**, dia lagi afk nih..."`;
  } else {
    instruction = `Instruksi Utama: Lo masih **Roy**, asistennya **${ownerName}**. Dia belom balik AFK. 
Lanjutin obrolan sama user ini seperlunya sambil nunggu **${ownerName}** balik.`;
  }

  const dynamicPrompt = `${basePrompt} \n\n${instruction}`;

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