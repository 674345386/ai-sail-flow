import { lazy, Suspense, useEffect, useState, type MouseEvent } from 'react';
import { ArrowLeft, ArrowUpRight, BookOpen, ChevronRight, Search } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { articlePath, articleReadingMinutes, researchArticles, type ResearchArticle } from './articles';
import './research.css';

const ResearchLiveDemo = lazy(() => import('./ResearchLiveDemo'));
const dateLabel = (date: string) => date.replaceAll('-', '.');
const readingLabel = (article: ResearchArticle) => `约 ${articleReadingMinutes(article)} 分钟阅读`;

function workspacePath() {
  try {
    const id = localStorage.getItem('sop-current-project');
    return id ? `/creative/${encodeURIComponent(id)}/remix` : '/';
  } catch { return '/'; }
}

export default function ResearchPage({ pathname, onNavigate }: { pathname: string; onNavigate: (path: string) => void }) {
  const [query, setQuery] = useState('');
  const parts = pathname.split('/').filter(Boolean);
  const section = parts[1];
  let slug = '';
  try { slug = parts[2] ? decodeURIComponent(parts[2]) : ''; } catch { /* Show the unknown article state. */ }
  const isArticleSection = section === 'article' || section === 'articles';
  const article = isArticleSection && parts.length === 3 ? researchArticles.find(item => item.slug === slug) : undefined;
  const notFound = parts.length > 3 || Boolean(section && !isArticleSection) || Boolean(isArticleSection && parts.length === 3 && !article);
  const isIndex = !article && !notFound;
  const currentPath = article ? articlePath(article.slug) : isArticleSection ? '/research/article' : '/research';
  const filtered = researchArticles.filter(item => `${item.title} ${item.subtitle} ${item.summary} ${item.tags.join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  useEffect(() => {
    document.title = `${article?.title || (notFound ? '未找到文章' : isArticleSection ? 'Article' : 'Research')} · AI Creative Lab`;
  }, [article, isArticleSection, notFound]);

  const follow = (path: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(path);
  };
  const contents = article && <nav aria-label="本文目录">{article.opening && <a href={`#${article.opening.id}`}>{article.opening.title}</a>}{article.sections.map(item => <a key={item.id} href={`#${item.id}`}>{item.title}</a>)}</nav>;

  return <div className="research-page" id="research-top">
    <a className="research-skip-link" href="#research-main">跳转到正文</a>
    <header className="research-site-header">
      <a className="research-brand" href="/" aria-label="AI Creative Lab 首页"><img src="/assets/brand/sail-mark-dark.svg" width={26} height={26} alt="" /><span>AI Creative Lab</span></a>
      <nav aria-label="站点导航"><a href="/research" aria-current="page" onClick={follow('/research')}>Research</a><a href={workspacePath()}><ArrowLeft size={14} />返回工作区</a></nav>
    </header>
    <div className="research-layout">
      <aside className="research-sidebar" aria-label="Research 栏目导航">
        <nav className="research-section-nav" aria-label="栏目">
          <a className={currentPath === '/research' ? 'is-current' : ''} aria-current={currentPath === '/research' ? 'page' : undefined} href="/research" onClick={follow('/research')}>Research</a>
          <a className={isArticleSection ? 'is-current' : ''} aria-current={isArticleSection ? 'page' : undefined} href="/research/article" onClick={follow('/research/article')}><BookOpen size={15} />Article<span>{researchArticles.length}</span></a>
        </nav>
        {article ? <div className="research-toc"><p>本文目录</p>{contents}</div> : <p className="research-sidebar-note">记录模型、执行基座与<br />交互界面之间的研究。</p>}
      </aside>
      <main className="research-main" id="research-main">
        <nav className="research-breadcrumbs" aria-label="当前位置"><a href="/research" onClick={follow('/research')}>Research</a>{isArticleSection && <><ChevronRight size={12} /><a href="/research/article" onClick={follow('/research/article')}>Article</a></>}{article && <><ChevronRight size={12} /><span>{article.category}</span></>}</nav>
        {isIndex ? <>
          <header className="research-index-heading"><h1>{isArticleSection ? 'Article' : 'Research'}</h1><p>{isArticleSection ? '关于系统、界面与智能协作的长篇记录。' : '把思考写下来，把设计放进真实的系统。'}</p></header>
          {!isArticleSection && <div className="research-focus-row">
            <div><span>模型与 Provider</span><p>推理能力如何进入产品。</p></div>
            <div><span>Harness 与执行</span><p>任务、工具和上下文如何协同。</p></div>
            <div><span>生成式界面</span><p>让结果成为可继续操作的界面。</p></div>
          </div>}
          <div className="research-index-toolbar"><h2>{isArticleSection ? '全部文章' : '最新文章'}<span>{filtered.length}</span></h2><label className="research-search"><Search size={15} /><input type="search" aria-label="搜索研究文章" placeholder="搜索文章或主题" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
          <div className="research-article-list">{filtered.map(item => <a className="research-article-row" key={item.slug} href={articlePath(item.slug)} onClick={follow(articlePath(item.slug))}>
            <div className="research-article-image"><img src={item.image} alt={item.imageAlt} width={1672} height={941} /></div>
            <div className="research-article-description"><div className="research-meta"><span>{item.category}</span><time dateTime={item.publishedAt}>{dateLabel(item.publishedAt)}</time></div><h2>{item.title}</h2><p>{item.summary}</p><div className="research-article-tags">{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div><span className="research-read-link">阅读全文 <ArrowUpRight size={15} /><small>{readingLabel(item)}</small></span></div>
          </a>)}</div>
          {!filtered.length && <div className="research-empty"><h2>没有找到匹配的文章</h2><p>换一个关键词，或查看全部研究记录。</p><button type="button" className="research-button" onClick={() => setQuery('')}>清除搜索</button></div>}
          <section className="research-index-note"><h2>关于这个栏目</h2><p>Research 收录 AI Creative Lab 在模型接入、Agent 运行时和生成式界面上的设计与实现记录。Article 用于沉淀完整文章：写下机制、实现依据、当前边界，以及接下来需要验证的问题。</p></section>
        </> : article ? <article className="research-article">
          <header className="research-article-heading"><div className="research-meta"><span>{article.category}</span><time dateTime={article.publishedAt}>{dateLabel(article.publishedAt)}</time><span>{readingLabel(article)}</span></div><h1>{article.title}</h1><p className="research-subtitle">{article.subtitle}</p><p className="research-byline">{article.byline || 'AI Creative Lab Research · 设计与实现记录'}</p></header>
          {article.opening && <section className="research-article-section" id={article.opening.id}><h2>{article.opening.title}</h2><div className="research-prose"><ReactMarkdown remarkPlugins={[remarkGfm]}>{article.opening.body}</ReactMarkdown></div></section>}
          <details className="research-inline-toc"><summary>本文目录</summary>{contents}</details>
          <figure className="research-hero"><img src={article.image} alt={article.imageAlt} width={1672} height={941} fetchPriority="high" /><figcaption>{article.imageCaption || '可替换的基座，持续展开的界面。AI 生成的概念性编辑拼贴。'}</figcaption></figure>
          <div className="research-abstract"><span>摘要</span><p>{article.summary}</p></div>
          {article.sections.map(item => <section key={item.id} className="research-article-section" id={item.id}>
            <h2>{item.title}</h2><div className="research-prose"><ReactMarkdown remarkPlugins={[remarkGfm]}>{item.body}</ReactMarkdown></div>
            {item.illustration && <figure className="research-section-figure"><img src={item.illustration.src} alt={item.illustration.alt} width={item.illustration.width} height={item.illustration.height} loading="lazy" decoding="async" /><figcaption>{item.illustration.caption}</figcaption></figure>}
            {item.code && <figure className="research-code"><figcaption>{item.codeLanguage}</figcaption><pre><code>{item.code}</code></pre></figure>}
            {item.liveExample && <Suspense fallback={<p className="research-loading-demo">正在加载交互示例…</p>}><ResearchLiveDemo /></Suspense>}
          </section>)}
          <div className="research-endnote"><a href="/research/article" onClick={follow('/research/article')}><ArrowLeft size={15} />返回 Article</a><a href="#research-top">回到顶部 ↑</a></div>
        </article> : <div className="research-empty"><h1>这篇文章还未收录</h1><p>可以回到 Article，查看现有的研究记录。</p><a className="research-button" href="/research/article" onClick={follow('/research/article')}>查看文章</a></div>}
        <footer className="research-footer"><span>AI Creative Lab · Research</span><span>模型、执行与界面，持续演进。</span></footer>
      </main>
    </div>
  </div>;
}
