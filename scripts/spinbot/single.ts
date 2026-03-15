/**
 * 单篇洗稿脚本（交互式）
 * 指定URL → 抓取 → 清洗 → 改写 → 预览 → 确认后发布到知识星球
 *
 * 用法:
 *   npx tsx spinbot/single.ts <url>
 *   npx tsx spinbot/single.ts https://www.unite.ai/10-best-ai-tools-for-education/
 */

import "dotenv/config";
import * as readline from "readline";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { fetchArticle } from "../fetch.js";
import { splitArticle } from "../split.js";
import { publishToZsxq } from "../publish-zsxq.js";
import { loadSpinbotConfig } from "./config.js";
import { publishToHugo } from "./publisher.js";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));
const PREVIEW_DIR = join(__dirname, "..", "..", "preview");

function createClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.ZHIPU_API_KEY,
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
  });
}

const MODEL = "glm-5";

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function cleanContent(client: OpenAI, text: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `你是一位内容编辑，负责从网页正文中提取纯净的文章内容。

严格删除：广告、推广、VIP引导、打赏、支付链接、二维码、网站导航、页脚、版权声明、引流内容、相关推荐、作者简介、评论区。

只保留文章核心正文。直接输出清洗结果。`,
      },
      { role: "user", content: `清洗以下内容：\n\n${text}` },
    ],
  });
  return response.choices[0].message.content?.trim() || text;
}

async function rewrite(client: OpenAI, text: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `你是一位资深AI科技博主。请将文章深度改写为你自己的原创中文文章。

要求：
- 如果原文是英文，必须翻译为流畅中文
- 用完全不同的行文方式重新撰写
- 保持核心信息和技术细节准确
- 使用亲切、专业的教程风格
- 专业术语（如GPT、Claude等）保持英文
- 步骤性内容用清晰编号呈现
- 开头写引言（2-3句引出主题）
- 结尾写总结（总结要点+建议）
- 不要出现"本文"、"原文"、"翻译"等字眼
- 输出必须是中文`,
      },
      {
        role: "user",
        content: `请深度改写以下文章：\n\n${text}\n\n直接输出改写后的全文。`,
      },
    ],
  });
  return response.choices[0].message.content?.trim() || "";
}

async function rewriteTitle(client: OpenAI, title: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `请将以下标题改写为中文，要求有吸引力、口语化。如果是英文请翻译：\n\n${title}\n\n只输出中文新标题。`,
      },
    ],
  });
  return response.choices[0].message.content?.trim() || title;
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("用法: npx tsx spinbot/single.ts <url>");
    process.exit(1);
  }

  if (!process.env.ZHIPU_API_KEY) {
    console.error("❌ 缺少 ZHIPU_API_KEY");
    process.exit(1);
  }

  const config = loadSpinbotConfig();
  const client = createClient();

  // ---- 第一步：抓取 ----
  console.error("\n📥 抓取文章...");
  const article = await fetchArticle(url);
  console.error(`📄 标题: ${article.title}`);
  console.error(`📄 原文: ${article.content.length} 字`);

  // ---- 第二步：清洗 ----
  console.error("\n🧹 清洗广告和噪音...");
  const maxInput = 6000;
  const rawText = article.content.slice(0, maxInput);
  const cleaned = await cleanContent(client, rawText);
  console.error(`🧹 清洗后: ${cleaned.length} 字`);

  if (cleaned.length < 200) {
    console.error("⚠️ 清洗后内容太短，尝试直接使用原文前6000字...");
  }
  const toRewrite = cleaned.length >= 200 ? cleaned : rawText;

  // ---- 第三步：改写 ----
  console.error("\n✍️ 深度改写中...");
  const rewritten = await rewrite(client, toRewrite);
  console.error(`✍️ 改写后: ${rewritten.length} 字`);

  // ---- 第四步：改写标题 ----
  const newTitle = await rewriteTitle(client, article.title);

  // ---- 第五步：保存预览文件 ----
  if (!existsSync(PREVIEW_DIR)) mkdirSync(PREVIEW_DIR, { recursive: true });
  const today = new Date().toISOString().split("T")[0];
  const slug = newTitle.replace(/[^\w\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const previewPath = join(PREVIEW_DIR, `${today}-${slug}.md`);
  writeFileSync(previewPath, `# ${newTitle}\n\n> 来源: ${url}\n> 字数: ${rewritten.length}\n\n---\n\n${rewritten}\n`, "utf-8");

  // ---- 第六步：输出预览 ----
  console.error("\n" + "═".repeat(60));
  console.error(`📝 标题: ${newTitle}`);
  console.error(`🔗 来源: ${url}`);
  console.error(`📊 字数: ${rewritten.length}`);
  console.error(`💾 预览: ${previewPath}`);
  console.error("═".repeat(60));
  console.error("\n--- 改写内容预览 ---\n");
  // 输出前500字预览
  console.error(rewritten.slice(0, 500));
  if (rewritten.length > 500) console.error("\n...(省略，完整内容见预览文件)");
  console.error("\n--- 预览结束 ---\n");

  // ---- 第七步：确认发布 ----
  const publishHugo = await ask("📁 发布到 Hugo? (y/n): ");
  if (publishHugo.toLowerCase() === "y") {
    const hugoPath = publishToHugo(
      { originalTitle: article.title, newTitle, content: rewritten, sourceUrl: url },
      config
    );
    console.error(`✅ Hugo: ${hugoPath}`);
  }

  if (!process.env.ZSXQ_COOKIE || !process.env.ZSXQ_GROUP_ID) {
    console.error("⚠️ 未配置知识星球凭证，跳过发布");
    return;
  }

  const publishZsxq = await ask("📤 发布到知识星球? (y/n): ");
  if (publishZsxq.toLowerCase() === "y") {
    console.error("📤 发布中...");
    const result = await publishToZsxq({ title: newTitle, content: rewritten });
    if (result.success) {
      console.error(`✅ 知识星球发布成功 (topic_id: ${result.topicId})`);
    } else {
      console.error(`❌ 发布失败: ${result.error}`);
    }
  } else {
    console.error("⏭️ 已跳过知识星球发布");
  }

  console.error("\n✅ 完成！");
}

main().catch((error) => {
  console.error("💥 错误:", error.message || error);
  process.exit(1);
});
