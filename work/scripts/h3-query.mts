import { MinimaxH3Client } from '../../server/minimax-h3';
process.loadEnvFile('.env');
const id = process.argv[2]!;
const c = new MinimaxH3Client();
try { const t = await c.query(id); console.log(JSON.stringify(t, null, 2).slice(0, 2000)); }
catch (e: any) { console.log('ERR', e.status, e.message); }
