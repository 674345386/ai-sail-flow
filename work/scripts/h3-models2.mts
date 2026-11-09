import { MinimaxH3Client } from '../../server/minimax-h3';
process.loadEnvFile('.env');
const c = new MinimaxH3Client();
const m: any = await c.listModels();
for (const item of m.data) {
  console.log('MODEL', item.id);
  console.log(JSON.stringify(item.parameters, null, 1).slice(0, 2500));
}
