/**
 * 数据源爬取模块
 * 从教程类数据源抓取候选文章列表（标题 + URL）
 */

import { type SpinbotSource } from "./config.js";

export interface CandidateArticle {
  title: string;
  url: string;
  source: string;
}

/**
 * 从所有源抓取候选文章列表
 */
export async function crawlAllSources(
  sources: SpinbotSource[]
): Promise<CandidateArticle[]> {
  const allCandidates: CandidateArticle[] = [];

  for (const source of sources) {
    try {
      // max_scan=0 表示整页抓取，不提取单篇链接（论文类）
      if (source.max_scan === 0) continue;

      process.stdout.write(`  [${source.name}] 扫描中...`);
      const candidates = await crawlSource(source);
      console.log(` ${candidates.length} 篇`);
      allCandidates.push(...candidates);

      await sleep(2000);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(` 失败: ${msg}`);
    }
  }

  return allCandidates;
}

async function crawlSource(source: SpinbotSource): Promise<CandidateArticle[]> {
  const jinaUrl = `https://r.jina.ai/${source.url}`;

  const response = await fetch(jinaUrl, {
    headers: {
      Accept: "text/markdown",
      "X-Return-Format": "markdown",
    },
  });

  if (!response.ok) {
    throw new Error(`Jina ${response.status}`);
  }

  const markdown = await response.text();
  const candidates: CandidateArticle[] = [];
  const seen = new Set<string>();

  if (source.url_pattern) {
    // 提取匹配 pattern 的URL，同时尝试获取链接文字作为标题
    const linkRegex = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
    const pattern = new RegExp(source.url_pattern);
    let match;

    // 先从 markdown 链接中提取（有标题）
    while ((match = linkRegex.exec(markdown)) !== null) {
      const text = match[1].trim();
      const url = match[2];
      if (!pattern.test(url)) continue;

      const normalized = url.split("?")[0].split("#")[0];
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      // 链接文字长度>8 才作为标题，否则标记为空
      const title = text.length > 8 ? text : "";
      candidates.push({ title, url, source: source.name });
      if (candidates.length >= source.max_scan) break;
    }

    // 如果 markdown 链接提取不够，从裸URL补充
    if (candidates.length < source.max_scan) {
      const allUrlRegex = /https?:\/\/[^\s)"]+/g;
      let urlMatch;
      while ((urlMatch = allUrlRegex.exec(markdown)) !== null) {
        const url = urlMatch[0];
        if (!pattern.test(url)) continue;

        const normalized = url.split("?")[0].split("#")[0];
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        candidates.push({ title: "", url, source: source.name });
        if (candidates.length >= source.max_scan) break;
      }
    }
  }

  return candidates;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
