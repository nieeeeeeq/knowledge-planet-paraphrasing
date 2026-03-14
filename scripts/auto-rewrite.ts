/**
 * 模式3: 自动洗稿
 * 定时检查新闻源 → 抓取新文章 → AI改写 → 发布
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { fetchArticle } from "./fetch.js";
import { splitArticle } from "./split.js";
import { rewriteArticle } from "./rewriter.js";
import { publishRewrite } from "./publish-hugo.js";
import { publishToZsxq } from "./publish-zsxq.js";
import { loadSourceConfig } from "./config.js";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));
const PROCESSED_FILE = join(__dirname, "..", "config", "processed.json");

interface ProcessedRecord {
  urls: string[];
  lastRun: string;
}

function loadProcessed(): ProcessedRecord {
  if (existsSync(PROCESSED_FILE)) {
    return JSON.parse(readFileSync(PROCESSED_FILE, "utf-8"));
  }
  return { urls: [], lastRun: "" };
}

function saveProcessed(record: ProcessedRecord): void {
  writeFileSync(PROCESSED_FILE, JSON.stringify(record, null, 2));
}

async function main() {
  console.log("=== Auto Rewrite ===");
  console.log(`Time: ${new Date().toISOString()}`);

  const config = loadSourceConfig();
  const rewriteSources = config.sources.filter(
    (s) => s.mode === "rewrite" || s.mode === "both"
  );

  const processed = loadProcessed();
  let newArticles = 0;

  for (const source of rewriteSources) {
    try {
      console.log(`\nChecking: ${source.name}`);

      // 抓取源页面获取文章列表
      const article = await fetchArticle(source.url);

      // 提取文章中的链接作为子文章URL
      const links = extractLinks(article.content, source.url);
      const newLinks = links.filter((l) => !processed.urls.includes(l));

      if (newLinks.length === 0) {
        console.log(`  No new articles`);
        continue;
      }

      console.log(`  Found ${newLinks.length} new articles`);

      // 处理每篇新文章（限制每次最多3篇）
      for (const link of newLinks.slice(0, 3)) {
        try {
          console.log(`  Processing: ${link}`);

          const subArticle = await fetchArticle(link);
          if (subArticle.content.length < 200) {
            console.log(`  Skipped (too short)`);
            processed.urls.push(link);
            continue;
          }

          const segments = splitArticle(subArticle.content);
          const result = await rewriteArticle(subArticle.title, segments);

          // 发布到Hugo
          publishRewrite(result, link);

          // 发布到知识星球
          if (process.env.ZSXQ_COOKIE && process.env.ZSXQ_GROUP_ID) {
            await publishToZsxq({
              title: result.rewrittenTitle,
              content: result.rewrittenContent,
              sourceUrl: link,
            });
          }

          processed.urls.push(link);
          newArticles++;

          // 避免API调用过快
          await sleep(5000);
        } catch (error) {
          console.error(`  Failed to process ${link}:`, error);
          processed.urls.push(link); // 标记为已处理避免重试
        }
      }
    } catch (error) {
      console.error(`Failed to check ${source.name}:`, error);
    }

    await sleep(3000);
  }

  // 保持processed列表不要太大（只保留最近500条）
  if (processed.urls.length > 500) {
    processed.urls = processed.urls.slice(-500);
  }
  processed.lastRun = new Date().toISOString();
  saveProcessed(processed);

  console.log(`\n=== Done: ${newArticles} articles processed ===`);
}

function extractLinks(markdown: string, baseUrl: string): string[] {
  const linkRegex = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
  const links: string[] = [];
  let match;

  while ((match = linkRegex.exec(markdown)) !== null) {
    const url = match[2];
    // 只保留同域名或已知新闻站点的链接
    if (isArticleUrl(url)) {
      links.push(url);
    }
  }

  return [...new Set(links)];
}

function isArticleUrl(url: string): boolean {
  const articleDomains = [
    "aibase.com",
    "jiqizhixin.com",
    "qbitai.com",
    "36kr.com",
    "xiaohu.ai",
    "mp.weixin.qq.com",
  ];
  return articleDomains.some((domain) => url.includes(domain));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
