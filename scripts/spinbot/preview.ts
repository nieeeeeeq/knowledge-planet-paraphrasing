/**
 * 洗稿预览脚本
 * 指定URL → 抓取 → AI筛选广告 → 深度改写 → 输出纯净内容（不发布）
 *
 * 用法:
 *   npx tsx spinbot/preview.ts <url>
 *   npx tsx spinbot/preview.ts https://www.freedidi.com/23203.html
 */

import "dotenv/config";
import OpenAI from "openai";
import { fetchArticle } from "../fetch.js";
import { splitArticle, type Segment } from "../split.js";
import { loadSpinbotConfig } from "./config.js";

function createClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.ZHIPU_API_KEY,
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
  });
}

const MODEL = "glm-5";

/**
 * 清洗正文：去除广告、推广、导航、页脚等噪音
 */
async function cleanContent(client: OpenAI, text: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `你是一位内容编辑，负责从抓取的网页正文中提取纯净的文章内容。

请严格删除以下内容：
- 广告、推广、会员/VIP引导、打赏/赞助信息
- 支付链接、二维码、优惠券
- 网站导航、侧边栏、页脚、版权声明
- "关注公众号"、"加群"、"转发"等引流内容
- "上一篇/下一篇"、"相关推荐"等导航文字
- 作者简介、网站介绍等与正文无关的内容
- 评论区内容

只保留文章的核心正文（标题、正文段落、代码块、步骤说明等有价值的内容）。
直接输出清洗后的内容，不要加任何说明。`,
      },
      {
        role: "user",
        content: `请清洗以下网页内容，只保留文章核心正文：\n\n${text}`,
      },
    ],
  });

  return response.choices[0].message.content?.trim() || text;
}

/**
 * 深度改写
 */
async function rewrite(client: OpenAI, text: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `你是一位资深AI科技博主，擅长撰写AI工具介绍和使用教程。请将文章深度改写为你自己的原创中文文章。

要求：
- 如果原文是英文或其他非中文语言，必须翻译为流畅自然的中文
- 用完全不同的行文方式重新撰写
- 保持核心信息和技术细节准确
- 使用亲切、专业的教程风格
- 专业术语（如GPT、Claude等）保持英文原样
- 步骤性内容用清晰的编号呈现
- 开头写一段引言（2-3句话引出主题）
- 结尾写一段总结（总结要点+建议）
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

/**
 * 改写标题
 */
async function rewriteTitle(client: OpenAI, title: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `请改写以下文章标题，要求有吸引力、口语化、像科技博主写的：\n\n${title}\n\n只输出新标题。`,
      },
    ],
  });
  return response.choices[0].message.content?.trim() || title;
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("用法: npx tsx spinbot/preview.ts <url>");
    process.exit(1);
  }

  if (!process.env.ZHIPU_API_KEY) {
    console.error("❌ 缺少 ZHIPU_API_KEY");
    process.exit(1);
  }

  const config = loadSpinbotConfig();
  const client = createClient();

  // 1. 抓取
  console.error("📥 抓取文章...");
  const article = await fetchArticle(url);
  console.error(`📄 标题: ${article.title}`);
  console.error(`📄 原文: ${article.content.length} 字\n`);

  // 2. 清洗广告
  console.error("🧹 清洗广告和噪音...");
  const maxInput = 6000;
  const rawText = article.content.slice(0, maxInput);
  const cleaned = await cleanContent(client, rawText);
  console.error(`🧹 清洗后: ${cleaned.length} 字\n`);

  // 3. 改写
  console.error("✍️ 深度改写中...");
  const rewritten = await rewrite(client, cleaned);
  console.error(`✍️ 改写后: ${rewritten.length} 字\n`);

  // 4. 改写标题
  const newTitle = await rewriteTitle(client, article.title);

  // 5. 输出
  console.log("═".repeat(60));
  console.log(`标题: ${newTitle}`);
  console.log(`来源: ${url}`);
  console.log("═".repeat(60));
  console.log();
  console.log(rewritten);
  console.log();
  console.log("═".repeat(60));
  console.log(`字数: ${rewritten.length}`);
}

main().catch((error) => {
  console.error("💥 错误:", error.message || error);
  process.exit(1);
});
