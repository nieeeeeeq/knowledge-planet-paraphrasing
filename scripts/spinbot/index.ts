/**
 * 自动洗稿模块入口
 * 流程：扫描源 → 去重 → AI筛选 → 抓取全文 → 深度改写 → 发布
 */

import "dotenv/config";
import { loadSpinbotConfig } from "./config.js";
import { crawlAllSources } from "./source-crawler.js";
import { filterArticles } from "./article-filter.js";
import { spinArticle } from "./article-spinner.js";
import { publishToHugo, publishToZsxqChannel } from "./publisher.js";
import {
  loadProcessed,
  saveProcessed,
  isProcessed,
  markProcessed,
  getRecentTitles,
} from "./dedup.js";
import { fetchArticle } from "../fetch.js";
import { splitArticle } from "../split.js";

async function main() {
  const startTime = Date.now();

  console.log("╔══════════════════════════════════════╗");
  console.log("║   AI 教程洗稿 · 自动执行               ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`时间: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`);
  console.log();

  // 加载配置
  const config = loadSpinbotConfig();
  const processed = loadProcessed();
  const recentTitles = getRecentTitles(processed);

  // 检查环境变量
  if (!process.env.ZHIPU_API_KEY) {
    console.error("❌ 缺少 ZHIPU_API_KEY");
    process.exit(1);
  }

  // ---- 第一步：扫描数据源 ----
  console.log(`📡 扫描 ${config.sources.length} 个数据源...\n`);
  const candidates = await crawlAllSources(config.sources);
  console.log(`\n📊 共发现 ${candidates.length} 篇候选文章`);

  // ---- 第二步：去重 ----
  const fresh = candidates.filter((c) => !isProcessed(processed, c.url));
  console.log(`🔍 去重后剩余 ${fresh.length} 篇（已处理 ${candidates.length - fresh.length} 篇）`);

  if (fresh.length === 0) {
    console.log("✅ 没有新文章需要处理");
    saveProcessed(processed);
    return;
  }

  // ---- 第三步：AI筛选 ----
  console.log("\n🤖 AI 筛选教程/介绍类文章...");
  const scored = await filterArticles(fresh, config, recentTitles);

  const qualified = scored.filter((s) => s.score >= config.filter.min_score);
  console.log(`\n📋 筛选结果：${qualified.length} 篇达标（>=${config.filter.min_score}分）`);

  if (qualified.length > 0) {
    console.log("  TOP 候选：");
    qualified.slice(0, 8).forEach((a, i) => {
      console.log(`  ${i + 1}. [${a.score}分] ${a.title || a.url} (${a.source}) - ${a.reason}`);
    });
  }

  if (qualified.length === 0) {
    console.log("✅ 没有符合条件的教程类文章");
    saveProcessed(processed);
    return;
  }

  // ---- 第四步：抓取 + 改写 + 发布 ----
  const toProcess = qualified.slice(0, config.daily_limit);
  console.log(`\n📝 开始处理 ${toProcess.length} 篇文章...\n`);

  let successCount = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const article = toProcess[i];
    console.log(`── [${i + 1}/${toProcess.length}] ${article.title || article.url}`);

    try {
      // 抓取全文
      console.log("  📥 抓取全文...");
      const fetched = await fetchArticle(article.url);

      if (fetched.content.length < 300) {
        console.log("  ⚠️ 内容太短，跳过");
        markProcessed(processed, article.url, article.title || fetched.title);
        continue;
      }

      const title = article.title || fetched.title;
      console.log(`  📄 ${title} (${fetched.content.length}字)`);

      // 分段
      const segments = splitArticle(fetched.content);

      // 深度改写
      console.log("  ✍️ 深度改写中...");
      const spinResult = await spinArticle(title, segments, article.url, config);
      console.log(`  ✅ 改写完成: ${spinResult.newTitle} (${spinResult.content.length}字)`);

      // 发布到Hugo
      if (config.publish.hugo) {
        const hugoPath = publishToHugo(spinResult, config);
        console.log(`  📁 Hugo: ${hugoPath}`);
      }

      // 发布到知识星球
      if (config.publish.zsxq && process.env.ZSXQ_COOKIE && process.env.ZSXQ_GROUP_ID) {
        console.log("  📤 发布到知识星球...");
        const result = await publishToZsxqChannel(spinResult);
        console.log(`  ${result.success ? "✅ 知识星球发布成功" : "❌ " + result.error}`);
      }

      markProcessed(processed, article.url, spinResult.newTitle);
      successCount++;

      // 发帖间隔
      if (i < toProcess.length - 1) {
        const wait = config.publish.interval_minutes;
        console.log(`  ⏳ 等待 ${wait} 分钟后处理下一篇...\n`);
        await sleep(wait * 60 * 1000);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ 失败: ${msg}`);
      markProcessed(processed, article.url, article.title || "failed");
    }
  }

  // 保存记录
  saveProcessed(processed);

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n═══════════════════════════════════`);
  console.log(`✅ 完成！成功 ${successCount}/${toProcess.length} 篇，耗时 ${elapsed} 分钟`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("\n💥 致命错误:", error);
  process.exit(1);
});
