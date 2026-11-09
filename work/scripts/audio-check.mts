import fs from 'node:fs';
import { GoogleGenAI } from '@google/genai';
process.loadEnvFile('.env');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: process.env.SOP_GEMINI_BASE_URL ? { baseUrl: process.env.SOP_GEMINI_BASE_URL } : {} });
const bytes = fs.readFileSync(process.argv[2]!).toString('base64');
const response = await ai.models.generateContent({
  model: 'gemini-3.8-flash',
  contents: [{ role: 'user', parts: [
    { inlineData: { mimeType: 'audio/mp4', data: bytes } },
    { text: 'Listen to this 13.5s audio track. Answer briefly in Chinese: 1) Is there any human speech or singing? 2) Is there music? 3) List the distinct sound events in order with rough timestamps. 4) Any technical problems (clipping, clicks, abrupt cut-offs, noise)? Be literal about what you actually hear.' },
  ] }],
});
console.log(response.text);
