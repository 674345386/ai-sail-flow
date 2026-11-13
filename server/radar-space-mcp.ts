import { createInterface } from 'node:readline';
import { z } from 'zod';
import { RADAR_PLATFORMS } from '../shared/radar';
const session = process.env.SOP_SPACE_SESSION || '', token = process.env.SOP_SPACE_TOKEN || '';
const base = process.env.SOP_SPACE_URL || 'http://127.0.0.1:4317';
const definitions = [
 {name:'get_research',description:'先读取当前空间的筛选条件、已有证据、图片和报告。',path:'',method:'GET',schema:z.object({})},
 {name:'inspect_sources',description:'检查来源接入能力；ready 不表示本次取得了数据。',path:'/sources',method:'GET',schema:z.object({})},
 {name:'search_radar',description:'按用户选择的研究方式与筛选条件执行真实检索与分析，结果自动显示在画布。可用 localOnly 仅分析已有证据。',path:'/search',method:'POST',schema:z.object({workflow:z.enum(['top','product','breakout','resonance','calendar']).default('top'),query:z.string().max(160).default(''),platforms:z.array(z.enum(RADAR_PLATFORMS)).min(1).max(7).optional(),region:z.enum(['US','GB','CA','DE','JP','SG']).default('US'),category:z.string().max(60).default('全部领域'),kind:z.enum(['all','video','image','news','search','product','event']).default('all'),days:z.union([z.literal(1),z.literal(7),z.literal(30)]).default(7),localOnly:z.boolean().default(false)})},
 {name:'read_report',description:'读取当前空间拥有的原始研究记录及证据，不重复采集。',path:'/runs',method:'GET',schema:z.object({runId:z.string().uuid()})},
 {name:'show_results',description:'把已有研究结果恢复到右侧画布。',path:'/show',method:'POST',schema:z.object({runId:z.string().uuid()})},
 {name:'get_calendar',description:'查看并展示目标市场未来 120 天的规则节点，节点不代表当前热度。',path:'/calendar',method:'POST',schema:z.object({region:z.enum(['US','GB','CA','DE','JP','SG']).default('US')})},
 {name:'identify_image',description:'通过已配置视觉模型提取本空间图片中的可见线索与关键词，不推断销量或热度。',path:'/identify',method:'POST',schema:z.object({imageId:z.string().uuid()})},
 {name:'save_report',description:'保存基于已取得证据的综合报告到画布。包括事实、传播假设、选题、缺口和验证建议。只有日历证据时 runIds 可以为空。',path:'/report',method:'POST',schema:z.object({title:z.string().min(1).max(160),markdown:z.string().min(1).max(50000),runIds:z.array(z.string().uuid()).max(20)})},
];
async function call(name:string,args:unknown){
 if(!session||!token)throw new Error('研究工具未连接');const tool=definitions.find(t=>t.name===name);if(!tool)throw new Error('未知研究工具');const body=tool.schema.parse(args) as Record<string,unknown>;
 const suffix=tool.path+(name==='read_report'?`/${encodeURIComponent(String(body.runId))}`:'');
 const response=await fetch(`${base}/api/radar-space-internal/${encodeURIComponent(session)}${suffix}`,{method:tool.method,headers:{'X-Radar-Space-Token':token,'Content-Type':'application/json'},...(tool.method==='POST'?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(110000),redirect:'error'});
 const result=await response.json();if(!response.ok)throw new Error(JSON.stringify(result));return result;
}
createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{void(async()=>{let id:string|number|undefined;try{
 const request=JSON.parse(line);id=request.id;if(id===undefined)return;let result:unknown;
 if(request.method==='initialize')result={protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'sail-radar-space',version:'1.0.0'}};
 else if(request.method==='tools/list')result={tools:definitions.map(({name,description,schema})=>({name,description,inputSchema:z.toJSONSchema(schema)}))};
 else if(request.method==='ping')result={};
 else if(request.method==='tools/call'){try{result={content:[{type:'text',text:JSON.stringify(await call(String(request.params?.name||''),request.params?.arguments||{}))}]};}catch(error){result={isError:true,content:[{type:'text',text:error instanceof Error?error.message:'研究工具未完成'}]};}}
 else throw new Error('不支持的工具协议');process.stdout.write(`${JSON.stringify({jsonrpc:'2.0',id,result})}\n`);
 }catch(error){if(id!==undefined)process.stdout.write(`${JSON.stringify({jsonrpc:'2.0',id,error:{code:-32603,message:error instanceof Error?error.message:'协议错误'}})}\n`);}})();});
