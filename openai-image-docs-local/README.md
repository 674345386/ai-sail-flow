# 个人IP网

首页参考 https://runway.com/ ，保留当前首页的原始布局、字体、首屏视频、品牌展示、平台介绍、研究和新闻栏目，结合本地原生交互。

- Home：http://127.0.0.1:4318/ （也支持 `/home/`）
- 文档：http://127.0.0.1:4318/api/docs/guides/image-generation
- 文档顶部 Home 返回本地首页；首页 API、创作入口进入本地文档。
- 全站共用一级导航：Home / Blog / Product / Developers / API / ChatGPT / Resources，并保留搜索、API Dashboard 和主题切换。
- Home 显示单层导航；Blog、Product、Developers 页面显示对应的二级导航和当前栏目下划线。
- Blog：Overview / Articles / Notes / Updates。
- Product：Overview / Products / Showcase / Updates。
- Developers：Overview / Models / Agents / Tools / Audio & voice / Production / API reference。现有图像生成文档归到 Developers → Models。
- 原参考站的其他栏目链接指向各自官网。

参考页面：https://developers.openai.com/api/docs/guides/image-generation

使用原页面已公开的 HTML、样式、字体、图片和交互组件进行本地化，保留响应式布局、深浅主题、目录、代码示例切换、复制和图片画廊。搜索针对本篇完整文档在本地运行。其他文档页面的链接指向官方网站。

## 启动

无需安装依赖。需要 Node.js 和 Python 3。

```sh
cd /Users/cppeng/sop/openai-image-docs-local
npm start
```

打开 http://127.0.0.1:4318/ 。可用 `PORT=4320 npm start` 更改端口。

## 文件

- `dist/`：完整可运行的本地静态页面与资源。
- `reference/page.html`：本次获取的原始参考页面。
- `local.js`、`local.css`：本地搜索和适配。
- `server.mjs`：仅监听本机的静态服务器。
- `home.js`、`home.css`：Home 的本地导航、菜单、视频控制与响应式适配。Creative / Dev / Robotics 展示区可切换；Creative 使用原站各示例的封面，Dev 使用本地视频及配方图集。
- `header.html`、`header.css`、`header.js`：首页导航模板、独立样式与搜索/菜单交互，复用文档站标识、图标和主题设置。
- `navigation.json`、`scripts/navigation.py`：集中定义栏目层级及导航选中状态，首页、栏目页和文档页共用。
- `scripts/build-sections.py`、`sections.css`：生成 Blog / Product / Developers 入口及分类页；目前 Blog、作品和更新栏目为待发布的空状态。
- `scripts/build-home.py`：从 `reference/runway-home.html` 构建本地首页并缓存字体和图片。
- `scripts/cache-hero.py`：仅在视频缺失时缓存原站首屏视频。需要 ffmpeg（自动发现，或通过 `FFMPEG_BIN` 指定）；直接启动现有页面无需 ffmpeg。
- `reference/showcase.json`：参考站展示区的真实文案与媒体地址，用于构建本地交互内容。
- `scripts/build.py`：从参考 HTML 重新本地化资源并构建 `dist/`，已有资源会复用。执行 `npm run build`。

构建后的资源本地提供，托管搜索和官方文档助手未接入。页面内容及 OpenAI 品牌、图片归原权利人所有。此项目用于本地参考复刻。
