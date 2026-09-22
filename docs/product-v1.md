# AI-Sail Flow · 第一版交付定义

研究日期：2026-09-16。用户目标是把参考短视频转换为自己产品、自己市场可用的制作指令。主流程只有四步：素材、拆解、改写、导出。

## 使用者与产物

面向小型跨境电商内容团队、独立站经营者及短视频创作者。产物是一份可编辑、可交接的视频制作包，而非销量预测或自动投放系统。原片观察与新创意独立保存，任何本地化建议都能回到原始镜头核对。

## 研究如何影响产品

1. [TikTok 的创意建议](https://ads.tiktok.com/resources/help/article/creative-best-practices?lang=en)强调开头吸引注意、清晰表达与行动引导。产品据此标注 hook/demo/proof/cta，提供三个未测试的开头候选，保留编辑能力。不会将镜头结构当成必然成功的公式。
2. [TikTok Shop 内容风格指南](https://seller-us.tiktok.com/university/essay?default_language=en&knowledge_id=4401155330393899)将内容与商品价值、购买动作联系起来。工具区分商品卡与独立站购买路径；市场选择不代表当地店铺资格已确认。
3. [Meta Reels 官方指南](https://www.facebook.com/business/ads/facebook-instagram-reels-ads)强调竖屏、有音轨和关键信息避开界面遮挡。工具默认 9:16，并将可读字幕、平台遮挡和声音写入制作建议；具体安全区需按实际版位核对，未硬编码一套跨平台像素值。
4. [Shopify 产品描述建议](https://help.shopify.com/en/manual/products/details/product-descriptions/write)强调针对具体顾客解释功能与收益。工具增加目标购买人群、已确认卖点、商品页、售价和优惠，使改写基于实际商品资料，而不是直接转移竞品承诺。
5. [Google 视频理解](https://ai.google.dev/gemini-api/docs/video-understanding)、[模型规格](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash)与[结构化输出](https://ai.google.dev/gemini-api/docs/structured-output)用于实现原始视频/音轨及产品图输入、固定 schema 的分析结果。当前使用官方 SDK 的 generateContent 接口；模型输出还会通过本地 schema 与时间线检查。

以上是有限范围的官方资料研究与产品判断，没有进行竞品实测、广告账户分析或转化率实验。

## 四步验收

| 阶段 | 输入 | 可操作的输出 |
| --- | --- | --- |
| 上传 | 参考视频、可选产品图、产品事实 | 真实媒体预览与元数据、持久化素材 |
| 拆解 | 视频和音轨、产品图 | 可编辑分镜、时间定位、原话和不确定项 |
| 改写 | 已保存原片分析、目标产品与市场设置 | 本地化口播、3 个开头、分镜、英文生成指令 |
| 生成 · 可选 | 当前有效分镜；i2v 首尾帧 URL 或 r2v 参考图 URL | Veo 3.1 按最多 8 秒生产单元生成源片，按导出时间线裁切组装；本机预览和下载 |
| 导出 | 当前有效的改写版本 | ZIP、TXT、MD、JSON、可选 SRT、产品参考图 |

## 交互与视觉

采用用户指定 awesome-design-md 中的 Linear 参考，适配为深色工作台：单一蓝紫主色、分层暗色表面、细边框、紧凑导航。左侧是流程和项目，中央是当前任务，相关参数/产品资料在旁侧。重点是可读、可编辑的制作内容，没有营销首页或虚构销售数字。

原片切镜的毫秒精度、逐字字幕对齐和产品外观完全一致不作为未经实测的承诺。镜头时间码可修正，字幕注明为草稿。缺少密钥时，真实任务明确报错；手写示例始终标识来源。

## 后续扩展边界

若后续要求多人或公网部署，需要增加身份认证、每用户凭据隔离、对象存储、共享任务队列和备份。在 V1 本机实现中先使用单进程任务和原子本地文件，避免引入当前流程不需要的基础设施。当前仅接入 Veo 3.1 的单镜头生成；多镜头续写、自动拼接、账号发布和数据归因可以基于导出的结构化分镜进一步接入。
