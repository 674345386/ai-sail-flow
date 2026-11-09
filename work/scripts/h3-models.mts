import { MinimaxH3Client } from '../../server/minimax-h3';
process.loadEnvFile('.env');
const c = new MinimaxH3Client();
const m = await c.listModels();
console.log(JSON.stringify(m, null, 2).slice(0, 6000));
