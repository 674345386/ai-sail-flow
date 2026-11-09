import { MinimaxH3Client } from '../../server/minimax-h3';
process.loadEnvFile('.env');
const c: any = new MinimaxH3Client();
const r = await (c as any).request('/generations?limit=15');
for (const t of r.data || []) console.log(t.id, t.status, t.model, t.parameters?.duration + 's', t.parameters?.resolution, 'charged', t.credits?.charged, 'note', t.note || '-', t.created_at);
