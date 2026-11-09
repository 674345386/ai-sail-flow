import fs from 'node:fs';
process.loadEnvFile('.env');
const key = process.env.GEMINI_API_KEY!;
const base = (process.env.SOP_GEMINI_BASE_URL || '').replace(/\/+$/, '').replace(/\/v\d+[a-z]*$/i, '');
const url = `${base}/v1beta/models/gemini-3.8-flash:generateContent`;
const bytes = fs.readFileSync(process.argv[2]!).toString('base64');
const body = {
  contents: [{ role: 'user', parts: [
    { inline_data: { mime_type: 'audio/mp4', data: bytes } },
    { text: '只听这段 13.5 秒音频。用中文简短回答：1) 有没有人声说话或唱歌？2) 有音乐吗？3) 按时间顺序列出你能听到的声音事件（大致秒数）4) 有没有技术问题（削波、爆音、突然中断、噪声）？只描述你真实听到的内容。' },
  ] }],
  generation_config: { temperature: 0, max_output_tokens: 800 },
};
const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
console.log('HTTP', res.status);
const json: any = await res.json();
const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('\n');
console.log(text || JSON.stringify(json).slice(0, 1200));
