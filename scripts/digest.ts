/**
 * 模式1: 每日多源聚合
 * 抓取多个新闻源 → 逐篇提取文章 → AI汇总 → 发布到Hugo + 知识星球
 */

import "dotenv/config";
import { fetchArticle, fetchFromListPage, type FetchResult } from "./fetch.js";
import { summarizeDigest } from "./summarizer.js";
import { publishDigest } from "./publish-hugo.js";
import { publishToZsxq } from "./publish-zsxq.js";
import { loadSourceConfig } from "./config.js";

async function main() {
  console.log("=== Daily AI Digest ===");
  console.log(`Date: ${new Date().toISOString()}`);

  const config = loadSourceConfig();
  const digestSources = config.sources.filter(
    (s) => s.mode === "digest" || s.mode === "both"
  );

  console.log(`Found ${digestSources.length} digest sources`);

  // 抓取所有源
  const allArticles: FetchResult[] = [];

  for (const source of digestSources) {
    try {
      console.log(`\nFetching: ${source.name} (${source.url})`);

      if (source.fetch_mode === "list") {
        // 列表页模式：先提取文章链接，再逐篇抓取
        const articles = await fetchFromListPage(
          source.url,
          source.url_pattern,
          source.max_articles || 5
        );
        console.log(`  Got ${articles.length} articles from ${source.name}`);
        for (const a of articles) {
          console.log(`    - ${a.title} (${a.content.length}字)`);
        }
        allArticles.push(...articles);
      } else {
        // 单页模式：直接抓取整页
        const article = await fetchArticle(source.url);
        console.log(`  Got: ${article.title} (${article.content.length}字)`);
        allArticles.push(article);
      }

      await sleep(2000);
    } catch (error) {
      console.error(`Failed to fetch ${source.name}:`, error);
    }
  }

  if (allArticles.length === 0) {
    console.error("No articles fetched, aborting");
    process.exit(1);
  }

  console.log(`\nTotal: ${allArticles.length} articles, generating digest...`);

  // AI汇总
  const digest = await summarizeDigest(allArticles);
  console.log(`Digest generated: ${digest.title}`);

  // 发布到Hugo
  const hugoPath = publishDigest(digest);
  console.log(`Hugo: ${hugoPath}`);

  // 发布到知识星球
  if (process.env.ZSXQ_COOKIE && process.env.ZSXQ_GROUP_ID) {
    const zsxqResult = await publishToZsxq({
      title: digest.title,
      content: digest.content,
    });
    console.log(`ZSXQ: ${zsxqResult.success ? "OK" : zsxqResult.error}`);
  } else {
    console.log("ZSXQ: Skipped (no credentials)");
  }

  console.log("=== Done ===");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
