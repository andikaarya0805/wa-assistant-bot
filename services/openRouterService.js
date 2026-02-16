import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = "openrouter/free"; 

const BASE_PROMPT = "Roleplay: Lo adalah asisten pribadi yang santai, gaul, dan to-the-point khas anak Jaksel/Jakarta. \nGaya Bicara: Pake 'lo-gue', jangan kaku, jangan baku. Kalo nolak request (kayak minta PAP), tolak dengan candaan atau sarkas halus.\n\nIMPORTANT: Jawab langsung pesannya. JANGAN TULIS 'Respon:', 'Gaya:', 'Instruksi:', atau label apapun. Langsung jawabannya aja.";

export async function generateContent(userText, ownerName = "Bos", isFirstMessage = true) {
  let instruction = "";

  if (isFirstMessage) {
    instruction = `Tugas: Jawab pesan ini sebagai Assistant Manager dari ${ownerName} yang lagi AFK. Kenalan singkat dulu (misal: "Halo, gue asisten manager ${ownerName}..."), abis itu langsung jawab pesannya.`;
  } else {
    instruction = `Tugas: ${ownerName} masih AFK. Lanjut ngobrol santai aja. Gausah ngenalin diri lagi. Langsung jawab to the point.`;
  }

  const systemMessage = `${BASE_PROMPT} \n\n${instruction}`;

  if (!userText) return "Waduh, pesannya kosong nih bro.";

  const payload = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content: systemMessage
      },
      {
        role: "user",
        content: userText
      }
    ],
    temperature: 0.7,
    max_tokens: 800
  };

  try {
    const response = await axios.post(OPENROUTER_URL, payload, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://github.com/Start-to-Excellence/telegram-gemini-bot',
        'X-Title': 'Telegram Userbot AI'
      }
    });

    if (
      response.data &&
      response.data.choices &&
      response.data.choices.length > 0 &&
      response.data.choices[0].message &&
      response.data.choices[0].message.content
    ) {
      return response.data.choices[0].message.content;
    } else {
      console.error("OpenRouter Invalid Response:", JSON.stringify(response.data));
      return "Sorry bro, lagi error nih AI-nya. (Invalid Response)";
    }

  } catch (error) {
    if (error.response) {
      const errMsg = JSON.stringify(error.response.data || {});
      console.error('Error calling OpenRouter API (Response Data):', errMsg);
      if (error.response.status === 429) {
          return "Lagi sibuk banget servernya (Rate Limit 429). Tunggu bentar.";
      }
      return `Error API: ${error.response.status} - ${errMsg.substring(0, 100)}...`;
    } else {
      console.error('Error calling OpenRouter API (Message):', error.message);
      return `Error System: ${error.message}`;
    }
  }
}

export default { generateContent };
