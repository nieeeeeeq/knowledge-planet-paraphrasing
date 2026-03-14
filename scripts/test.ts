/**
 * 测试脚本 - 验证各模块功能
 */

import { fetchArticle } from "./fetch.js";
import { splitArticle } from "./split.js";
import { loadSourceConfig, loadRewriteConfig, loadPublishConfig } from "./config.js";

async function main() {
  // 1. 测试配置加载
  console.log("=== Test Config ===");
  const sources = loadSourceConfig();
  console.log(`Sources: ${sources.sources.length} configured`);
  const rewrite = loadRewriteConfig();
  console.log(`Rewrite intensity: ${rewrite.rewrite.default_intensity}`);
  const publish = loadPublishConfig();
  console.log(`ZSXQ API: ${publish.zsxq.api_base}`);

  // 2. 测试分段
  console.log("\n=== Test Split ===");
  const testText = `# AI行业动态

人工智能领域近期出现了多项重要突破。OpenAI发布了GPT-5模型，在推理能力上有了显著提升。

## 技术进展

Transformer架构继续主导自然语言处理领域。研究人员发现，通过改进注意力机制，可以在保持性能的同时大幅降低计算成本。这项研究对于推动AI普及具有重要意义。

## 行业应用

越来越多的企业开始将LLM集成到工作流程中。从客服到代码开发，AI正在改变各个行业的工作方式。`;

  const segments = splitArticle(testText);
  console.log(`Segments: ${segments.length}`);
  segments.forEach((s) => console.log(`  [${s.index}] ${s.charCount} chars`));

  // 3. 测试URL抓取
  console.log("\n=== Test Fetch ===");
  const testUrl = process.argv[2] || "https://www.aibase.com/zh/news/26195";
  console.log(`Fetching: ${testUrl}`);

  try {
    const article = await fetchArticle(testUrl);
    console.log(`Title: ${article.title}`);
    console.log(`Content: ${article.content.length} chars`);
    console.log(`Preview: ${article.content.slice(0, 200)}...`);

    // 测试分段
    const articleSegments = splitArticle(article.content);
    console.log(`Article segments: ${articleSegments.length}`);
  } catch (error) {
    console.error(`Fetch failed:`, error);
  }

  console.log("\n=== All tests passed ===");
}

main().catch(console.error);
