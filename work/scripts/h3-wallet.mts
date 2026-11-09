import { MinimaxH3Client } from '../../server/minimax-h3';
process.loadEnvFile('.env');
const c: any = new MinimaxH3Client();
try { const w = await (c as any).request('/wallet'); console.log('WALLET', JSON.stringify(w)); } catch (e:any) { console.log('WALLET ERR', e.message); }
const m: any = await c.listModels();
for (const item of m.data) {
  const { parameters, parameter_constraints, ...rest } = item;
  console.log('MODEL', JSON.stringify(rest));
}
