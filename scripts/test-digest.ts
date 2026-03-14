/**
 * 测试脚本: 汇总并发布最新AI行业动态
 *
 * 用法:
 *   # 仅抓取，不调用AI（检查数据源是否正常）
 *   npx tsx test-digest.ts --fetch-only
 *
 *   # 抓取 + AI汇总，输出到终端（不写文件）
 *   npx tsx test-digest.ts --dry-run
 *
 *   # 完整流程：抓取 + AI汇总 + 写入Hugo文件
 *   npx tsx test-digest.ts
 *
 *   # 完整流程 + 发布到知识星球
 *   npx tsx test-digest.ts --publish-zsxq
 *
 *   # 指定单个URL测试汇总
 *   npx tsx test-digest.ts --url https://www.aibase.com/zh/news/26175
 *
 * 环境变量:
 *   ZHIPU_API_KEY      - 智谱API密钥 (AI汇总时必需)
 *   ZSXQ_COOKIE        - 知识星球Cookie (发布时必需)
 *   ZSXQ_GROUP_ID      - 知识星球群组ID (发布时必需)
 */

import "dotenv/config";
import { fetchArticle, fetchFromListPage, type FetchResult } from "./fetch.js";
import { splitArticle } from "./split.js";
import { summarizeDigest } from "./summarizer.js";
import { publishDigest } from "./publish-hugo.js";
import { publishToZsxq } from "./publish-zsxq.js";
import { loadSourceConfig } from "./config.js";

// ========== 参数解析 ==========

interface Options {
  fetchOnly: boolean;
  dryRun: boolean;
  publishZsxq: boolean;
  urls: string[];
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    fetchOnly: false,
    dryRun: false,
    publishZsxq: false,
    urls: [],
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--fetch-only":
        options.fetchOnly = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--publish-zsxq":
        options.publishZsxq = true;
        break;
      case "--url":
        if (args[i + 1]) {
          options.urls.push(args[++i]);
        }
        break;
      default:
        if (args[i].startsWith("http")) {
          options.urls.push(args[i]);
        }
    }
  }

  return options;
}

// ========== 核心流程 ==========

async function main() {
  const opts = parseArgs();
  const startTime = Date.now();

  console.log("╔══════════════════════════════════════╗");
  console.log("║   AI 行业动态 · 汇总测试脚本          ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`时间: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`);
  console.log(`模式: ${opts.fetchOnly ? "仅抓取" : opts.dryRun ? "抓取+汇总(不写文件)" : "完整流程"}`);
  console.log();

  // ---- 第一步: 确定数据源 ----
  const articles: FetchResult[] = [];
  const fetchErrors: string[] = [];

  if (opts.urls.length > 0) {
    // 自定义URL模式：直接逐篇抓取
    console.log(`📡 自定义URL (${opts.urls.length}个):`);
    opts.urls.forEach((u) => console.log(`   - ${u}`));
    console.log();
    console.log("🔄 开始抓取...\n");

    for (const url of opts.urls) {
      const t0 = Date.now();
      process.stdout.write(`   [自定义] 抓取中...`);
      try {
        const article = await fetchArticle(url);
        const elapsed = Date.now() - t0;
        articles.push(article);
        const segments = splitArticle(article.content);
        console.log(` ✅ ${elapsed}ms`);
        console.log(`      标题: ${article.title}`);
        console.log(`      正文: ${article.content.length}字 | ${segments.length}个段落`);
        console.log();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(` ❌ ${msg}`);
        fetchErrors.push(msg);
        console.log();
      }
    }
  } else {
    // 从配置文件加载数据源
    const config = loadSourceConfig();
    const sources = config.sources.filter(
      (s) => s.mode === "digest" || s.mode === "both"
    );

    console.log(`📡 数据源 (${sources.length}个):`);
    sources.forEach((s) => console.log(`   - ${s.name}: ${s.url} [${s.fetch_mode || "single"}]`));
    console.log();
    console.log("🔄 开始抓取...\n");

    for (const source of sources) {
      const t0 = Date.now();
      process.stdout.write(`   [${source.name}] 抓取中...`);

      try {
        if (source.fetch_mode === "list") {
          // 列表页模式
          const sourceArticles = await fetchFromListPage(
            source.url,
            source.url_pattern,
            source.max_articles || 5
          );
          const elapsed = Date.now() - t0;
          console.log(` ✅ ${elapsed}ms (${sourceArticles.length}篇)`);
          for (const a of sourceArticles) {
            console.log(`      📄 ${a.title} (${a.content.length}字) ${a.url}`);
          }
          articles.push(...sourceArticles);
        } else {
          // 单页模式
          const article = await fetchArticle(source.url);
          const elapsed = Date.now() - t0;
          articles.push(article);
          const segments = splitArticle(article.content);
          console.log(` ✅ ${elapsed}ms`);
          console.log(`      标题: ${article.title}`);
          console.log(`      正文: ${article.content.length}字 | ${segments.length}个段落`);
        }
        console.log();

        // 请求间隔
        await sleep(2000);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(` ❌ ${msg}`);
        fetchErrors.push(`${source.name}: ${msg}`);
        console.log();
      }
    }
  }

  // ---- 抓取报告 ----
  console.log("─".repeat(50));
  console.log(`📊 抓取结果: ${articles.length} 篇文章`);
  if (fetchErrors.length > 0) {
    console.log(`⚠️  失败 (${fetchErrors.length}):`);
    fetchErrors.forEach((e) => console.log(`   - ${e}`));
  }
  console.log();

  if (articles.length === 0) {
    console.error("❌ 没有成功抓取任何文章，终止");
    process.exit(1);
  }

  if (opts.fetchOnly) {
    console.log("✅ 抓取测试完成 (--fetch-only 模式)");
    printElapsed(startTime);
    return;
  }

  // ---- 第三步: AI汇总 ----
  if (!process.env.ZHIPU_API_KEY) {
    console.error("❌ 缺少 ZHIPU_API_KEY 环境变量");
    console.log("   设置方法: export ZHIPU_API_KEY=your_key 或写入 .env 文件");
    process.exit(1);
  }

  console.log("🤖 调用智谱 GLM-5 生成汇总...\n");
  const t1 = Date.now();

  const digest = await summarizeDigest(articles);

  console.log(`✅ 汇总完成 (${Date.now() - t1}ms)`);
  console.log(`   标题: ${digest.title}`);
  console.log(`   来源: ${digest.sourceCount}篇文章`);
  console.log(`   字数: ${digest.content.length}字`);
  console.log();

  // ---- 显示汇总内容 ----
  console.log("─".repeat(50));
  console.log("📰 汇总内容预览:\n");
  console.log(digest.content);
  console.log("\n" + "─".repeat(50));

  if (opts.dryRun) {
    console.log("\n✅ 汇总测试完成 (--dry-run 模式，未写入文件)");
    printElapsed(startTime);
    return;
  }

  // ---- 第四步: 发布到Hugo ----
  console.log("\n📝 写入 Hugo 文件...");
  const hugoPath = publishDigest(digest);
  console.log(`   ✅ ${hugoPath}`);

  // ---- 第五步: 发布到知识星球 ----
  if (opts.publishZsxq) {
    if (!process.env.ZSXQ_COOKIE || !process.env.ZSXQ_GROUP_ID) {
      console.log("\n⚠️  知识星球: 跳过 (缺少 ZSXQ_COOKIE 或 ZSXQ_GROUP_ID)");
    } else {
      console.log("\n📤 发布到知识星球...");
      const zsxqResult = await publishToZsxq({
        title: digest.title,
        content: digest.content,
      });
      if (zsxqResult.success) {
        console.log(`   ✅ 发布成功 (topic_id: ${zsxqResult.topicId})`);
      } else {
        console.log(`   ❌ 发布失败: ${zsxqResult.error}`);
      }
    }
  }

  // ---- 完成 ----
  console.log();
  printElapsed(startTime);
  console.log("✅ 全部完成！");
}

function printElapsed(startTime: number) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`⏱️  总耗时: ${elapsed}s`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("\n💥 致命错误:", error);
  process.exit(1);
});
