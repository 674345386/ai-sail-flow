import { MODEL, defaultMarket, type Project, type Shot } from './domain';

const shots: Shot[] = [
  { id: 'shot-1', start: 0, end: 3, role: 'hook', visual: '通勤桌面，钥匙、笔记本与随身杯同框。', action: '手拿起杯子，展示通勤携带情境。', camera: '竖屏近景，轻微手持感，自然窗光。', narration: 'Your coffee, ready when you are.', onScreenText: 'Coffee. Ready to go.', sound: '轻快、低音量背景音乐；清晰人声。', productPresence: '杯体正面入镜，品牌保持可辨认。', uncertainty: '' },
  { id: 'shot-2', start: 3, end: 9, role: 'demo', visual: '厨房台面，展示杯盖、滤网和杯身。', action: '取出可拆卸滤网，加入咖啡粉与水，再组装。', camera: '俯拍与细节近景切换；动作保持连贯。', narration: 'Add your coffee, add water, and let it steep.', onScreenText: 'Add · Steep · Enjoy', sound: '自然水声和杯盖组装声。', productPresence: '杯盖连接方式、滤网外形保持一致。', uncertainty: '浸泡时长未提供，不能添加具体分钟数。' },
  { id: 'shot-3', start: 9, end: 12, role: 'proof', visual: '水槽旁，取出的滤网与杯体分开呈现。', action: '展示滤网可取下清洗这一可观察事实。', camera: '滤网特写，缓慢移向杯体。', narration: 'A removable filter for an easy rinse.', onScreenText: 'Removable filter', sound: '保持低音量音乐。', productPresence: '产品细节特写，不展示未经确认的防漏测试。', uncertainty: '' },
  { id: 'shot-4', start: 12, end: 15, role: 'cta', visual: '产品放回整洁桌面，主体居中。', action: '镜头停留在完整产品上。', camera: '静态产品近景；底部预留平台 UI 空间。', narration: 'Meet your new coffee companion. Explore it on our website.', onScreenText: 'Meet your coffee companion', sound: '音乐自然收尾。', productPresence: '完整外观与前三个镜头一致。', uncertainty: '' },
];
export function demoProject(id: string): Project {
  const now = new Date().toISOString();
  return {
    id, title: '随行冷萃杯 · 美国市场', createdAt: now, updatedAt: now, revision: 1, isDemo: true,
    product: { name: '随行冷萃杯', category: '家居生活', facts: '500 ml 容量；可拆卸滤网；杯盖可旋拧；杯体与滤网可分开清洗。', audience: '喜欢自制咖啡的通勤人群', price: '', currency: 'USD', offer: '', landingUrl: '' },
    market: { ...defaultMarket, duration: '15', cta: '引导前往独立站查看产品；不承诺折扣、包邮或配送时间。' }, assets: [],
    analysis: { summary: '示例：用通勤场景建立需求，通过冲泡与清洗演示解释产品，最后引导了解详情。此项目为手写示例，未上传参考视频，也未调用 Gemini。', sourceLanguage: 'English', duration: 15, sellingPoints: ['随行使用情境', '可拆卸滤网', '直观展示清洗方式'], productAppearance: '示例未提供产品图；实际生产需上传真实产品参考。', shots, uncertainties: ['产品材质、防漏表现、浸泡时长尚未提供。'] },
    rewrite: {
      angle: '把“随时来一杯”的通勤需求，变成可看见的使用过程。', audienceInsight: '用具体操作降低理解成本，围绕咖啡准备与清洗展开。',
      hookVariants: [{ label: '场景切入', text: 'Your coffee, ready when you are.' }, { label: '问题切入', text: 'What if your morning coffee started at home?' }, { label: '演示切入', text: 'Here’s how I prep my coffee for the day.' }],
      localizationNotes: ['美国市场，采用自然美式英语口播。', '不进行汇率换算；价格未填写，因此不展示价格。', '购买路径为独立站，避免使用站内购物车话术。'],
      productionNotes: ['示例内容，非真实模型结果；请替换为自己的产品和素材。', '9:16 竖屏，关键字幕避开平台按钮与底部遮挡。', '字幕为分镜草案，成片后需重新对齐。'],
      globalPrompt: 'Create a natural, vertically framed 15-second coffee product demonstration. Use soft daylight, believable hand movements, a consistent product, and clean, practical surroundings. Keep one clear benefit per shot. Only use the supplied product facts. Follow the approved shot plan below.',
      negativePrompt: 'No invented discounts, reviews, shipping promises, leakproof claims, material claims, or brewing times. No warped product geometry, changing packaging, extra fingers, illegible generated text, or additional logos.',
      shots: shots.map(s => ({ ...s, generationPrompt: ({ hook: 'Close-up of a hand picking up the reference coffee cup from a desk beside keys and a notebook. Natural daylight, relaxed handheld framing.', demo: 'Top-down kitchen demonstration: remove the filter, add coffee and water, reassemble. Preserve the exact reference product geometry and show a continuous plausible sequence.', proof: 'Close-up of the removable filter beside the cup near a kitchen sink. Demonstrate separation and rinsing without implying unsupported product performance.', cta: 'Static close-up of the assembled reference cup on a tidy desk, centered with space for captions to be composited later.', other: '' })[s.role] })),
    }, rewriteStale: false, generatedVideos: [], job: null, model: MODEL, usage: { input: 0, output: 0 },
  };
}
