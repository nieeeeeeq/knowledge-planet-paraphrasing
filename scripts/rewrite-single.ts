/**
 * 模式2: 单篇URL改写
 * 输入URL → 抓取正文 → AI改写 → 发布到Hugo + 知识星球
 */

import "dotenv/config";
import { fetchArticle } from "./fetch.js";
import { splitArticle } from "./split.js";
import { rewriteArticle, type RewriteIntensity } from "./rewriter.js";
import { publishRewrite } from "./publish-hugo.js";
import { publishToZsxq } from "./publish-zsxq.js";

async function main() {
  const url = process.env.INPUT_URL || process.argv[2];
  const intensity =
    (process.env.INPUT_INTENSITY as RewriteIntensity) ||
    (process.argv[3] as RewriteIntensity) ||
    "medium";
  const publishZsxq =
    process.env.INPUT_PUBLISH_ZSXQ !== "false";

  if (!url) {
    console.error("Usage: tsx rewrite-single.ts <url> [light|medium|heavy]");
    process.exit(1);
  }

  console.log("=== Single Article Rewrite ===");
  console.log(`URL: ${url}`);
  console.log(`Intensity: ${intensity}`);

  // 抓取正文
  console.log("Fetching article...");
  const article = await fetchArticle(url);
  console.log(`Title: ${article.title}`);
  console.log(`Content length: ${article.content.length} chars`);

  // 分段
  const segments = splitArticle(article.content);
  console.log(`Split into ${segments.length} segments`);

  // AI改写
  console.log("Rewriting...");
  const result = await rewriteArticle(article.title, segments, intensity);
  console.log(`Rewritten title: ${result.rewrittenTitle}`);
  console.log(`Rewritten length: ${result.rewrittenContent.length} chars`);

  // 发布到Hugo
  const hugoPath = publishRewrite(result, url);
  console.log(`Hugo: ${hugoPath}`);

  // 发布到知识星球
  if (publishZsxq && process.env.ZSXQ_COOKIE && process.env.ZSXQ_GROUP_ID) {
    const zsxqResult = await publishToZsxq({
      title: result.rewrittenTitle,
      content: result.rewrittenContent,
      sourceUrl: url,
    });
    console.log(`ZSXQ: ${zsxqResult.success ? "OK" : zsxqResult.error}`);
  } else {
    console.log("ZSXQ: Skipped");
  }

  console.log("=== Done ===");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
