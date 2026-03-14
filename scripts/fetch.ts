/**
 * 正文提取模块
 * 通过 Jina Reader 从URL提取干净的Markdown正文
 * 支持列表页文章链接提取 + 逐篇抓取
 */

export interface FetchResult {
  title: string;
  content: string;
  url: string;
  fetchedAt: string;
}

/**
 * 通过 Jina Reader API 获取URL正文
 */
export async function fetchArticle(url: string): Promise<FetchResult> {
  const jinaUrl = `https://r.jina.ai/${url}`;

  const response = await fetch(jinaUrl, {
    headers: {
      Accept: "text/markdown",
      "X-Return-Format": "markdown",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Jina Reader failed for ${url}: ${response.status} ${response.statusText}`
    );
  }

  const markdown = await response.text();

  // 从Jina元数据提取标题
  const metaTitleMatch = markdown.match(/^Title:\s*(.+)$/m);
  const headingMatch = markdown.match(/^#\s+(.+)$/m);
  // 有些页面标题在 og:title 或 ## 标题中
  const h2Match = markdown.match(/^##\s+(.{8,})$/m);

  let title = "Untitled";
  if (metaTitleMatch && metaTitleMatch[1].trim().length > 2) {
    title = metaTitleMatch[1].trim();
  } else if (headingMatch && headingMatch[1].trim().length > 2) {
    title = headingMatch[1].trim();
  } else if (h2Match) {
    title = h2Match[1].trim();
  }

  // 清理标题中的站点后缀（如 "xxx - 量子位"）
  title = title.replace(/\s*[-|–]\s*(量子位|机器之心|AIbase|36氪|小互AI).*$/, "").trim();

  // 清理正文：移除Jina添加的元数据头部
  const content = cleanContent(markdown);

  return {
    title,
    content,
    url,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * 从列表页提取文章链接
 * 通过 Jina Reader 获取列表页 markdown，再解析出文章链接
 */
export async function extractArticleLinks(
  listUrl: string,
  urlPattern?: string,
  maxLinks: number = 10
): Promise<string[]> {
  const jinaUrl = `https://r.jina.ai/${listUrl}`;

  const response = await fetch(jinaUrl, {
    headers: {
      Accept: "text/markdown",
      "X-Return-Format": "markdown",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Jina Reader failed for ${listUrl}: ${response.status} ${response.statusText}`
    );
  }

  const markdown = await response.text();

  // 提取所有URL（支持 markdown 链接和裸URL）
  const links: string[] = [];
  const seen = new Set<string>();

  if (urlPattern) {
    // 有 URL 模式时，直接用正则从全文提取匹配的URL
    const urlRegex = new RegExp(`https?://[^)\\s"]+${urlPattern.replace(/\\\\/g, '\\')}[^)\\s"]*`, 'g');
    // 同时也用原始 pattern 匹配
    const allUrlRegex = /https?:\/\/[^\s)"]+/g;
    let urlMatch;
    while ((urlMatch = allUrlRegex.exec(markdown)) !== null) {
      const url = urlMatch[0];
      const pattern = new RegExp(urlPattern);
      if (!pattern.test(url)) continue;

      const normalizedUrl = url.split("?")[0].split("#")[0];
      if (seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);

      links.push(url);
      if (links.length >= maxLinks) break;
    }
  } else {
    // 无 URL 模式时，提取 markdown 链接
    const linkRegex = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(markdown)) !== null) {
      const linkText = match[1];
      const linkUrl = match[2];

      if (linkText.length < 8) continue;
      if (/^(首页|登录|注册|关于|下载|更多|img|image)/i.test(linkText)) continue;

      const normalizedUrl = linkUrl.split("?")[0].split("#")[0];
      if (seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);

      links.push(linkUrl);
      if (links.length >= maxLinks) break;
    }
  }

  return links;
}

/**
 * 从列表页抓取多篇文章（先提取链接，再逐篇抓取）
 */
export async function fetchFromListPage(
  listUrl: string,
  urlPattern?: string,
  maxArticles: number = 5
): Promise<FetchResult[]> {
  const links = await extractArticleLinks(listUrl, urlPattern, maxArticles);
  console.log(`    提取到 ${links.length} 篇文章链接`);

  const results: FetchResult[] = [];
  for (const link of links) {
    try {
      const article = await fetchArticle(link);
      // 跳过内容太短的文章
      if (article.content.length < 100) continue;
      results.push(article);
      await sleep(1500);
    } catch (error) {
      console.error(`    跳过: ${link} (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  return results;
}

/**
 * 批量获取多个URL
 */
export async function fetchMultiple(
  urls: string[]
): Promise<FetchResult[]> {
  const results: FetchResult[] = [];

  for (const url of urls) {
    try {
      const result = await fetchArticle(url);
      results.push(result);
      // 避免请求过快
      await sleep(1000);
    } catch (error) {
      console.error(`Failed to fetch ${url}:`, error);
    }
  }

  return results;
}

function cleanContent(markdown: string): string {
  let lines = markdown.split("\n");

  // 跳过 Jina 元数据头 (Title:, URL:, Markdown Content: 等)
  let startIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (
      lines[i].startsWith("Title:") ||
      lines[i].startsWith("URL Source:") ||
      lines[i].startsWith("Markdown Content:")
    ) {
      startIdx = i + 1;
    }
  }

  lines = lines.slice(startIdx);

  // 过滤导航/UI/噪音元素
  lines = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true; // 保留空行用于段落分隔
    // 移除纯图片链接行 (logo等)
    if (/^\[!\[.*?\]\(.*?\)\]\(.*?\)$/.test(trimmed)) return false;
    // 移除纯导航链接行
    if (/^\[.{1,20}\]\(https?:\/\/[^)]+\)$/.test(trimmed)) return false;
    // 移除带####的短导航链接
    if (/^\[#{1,4}\s+.{1,30}\]\(/.test(trimmed) && trimmed.length < 100) return false;
    // 移除多个短链接在一行 (导航菜单)
    const linkCount = (trimmed.match(/\[[^\]]{1,15}\]\(/g) || []).length;
    if (linkCount >= 3 && trimmed.length < 300) return false;
    // 移除版权/页脚行
    if (/copyright|©|备案|icp|粤ICP|京公网/i.test(trimmed)) return false;
    // 移除纯语言切换行
    if (/^(ZH|EN|zh|en)$/i.test(trimmed)) return false;
    // 移除短的UI文字 (按钮、标签等)
    if (trimmed.length <= 4 && !/[。！？.!?]/.test(trimmed) && !/^#{1,6}\s/.test(trimmed)) return false;
    // 移除分隔线
    if (/^[-=]{3,}$/.test(trimmed)) return false;
    return true;
  });

  // 去掉首尾空行
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === "")
    lines.pop();

  return lines.join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
