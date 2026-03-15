/**
 * 深度改写引擎
 * 专为教程/介绍类文章设计的改写模块
 */

import OpenAI from "openai";
import { type Segment } from "../split.js";
import { type SpinbotConfig } from "./config.js";

export interface SpinResult {
  originalTitle: string;
  newTitle: string;
  content: string;
  sourceUrl: string;
}

function createClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.ZHIPU_API_KEY,
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
  });
}

const MODEL = "glm-5";

const SYSTEM_PROMPT = `你是一位资深AI科技博主，擅长撰写AI工具介绍和使用教程。你的任务是将一篇文章深度改写为你自己的原创中文文章。

改写要求：
- 如果原文是英文或其他非中文语言，必须翻译为流畅自然的中文
- 用完全不同的行文方式重新撰写，不保留任何原文句子
- 保持核心信息和技术细节准确
- 使用亲切、专业的教程风格，像是在教朋友使用
- 适当添加你的观点和评价
- 专业术语（如GPT、Claude、Stable Diffusion等）保持英文原样
- 如有步骤性内容，用清晰的编号步骤呈现
- 不要出现"本文"、"原文"、"翻译"等字眼，要像是你自己用中文写的原创文章
- 输出必须是中文`;

/**
 * 深度改写一篇文章
 */
export async function spinArticle(
  title: string,
  segments: Segment[],
  sourceUrl: string,
  config: SpinbotConfig
): Promise<SpinResult> {
  const client = createClient();
  const fullText = segments.map((s) => s.text).join("\n\n");

  // 截断过长文章
  const maxInputLength = 6000;
  const trimmedSegments = trimSegments(segments, maxInputLength);
  const trimmedText = trimmedSegments.map((s) => s.text).join("\n\n");

  // 先清洗广告和噪音内容
  console.log("    🧹 清洗广告...");
  const cleaned = await cleanContent(client, trimmedText);

  // 改写
  let rewritten: string;
  if (cleaned.length < 4000) {
    rewritten = await spinFullArticle(client, cleaned, config);
  } else {
    const cleanedSegments = [{ index: 0, text: cleaned.slice(0, 3000), charCount: 3000 },
      { index: 1, text: cleaned.slice(3000), charCount: cleaned.length - 3000 }]
      .filter(s => s.text.length > 100);
    rewritten = await spinBySegments(client, cleanedSegments as any, config);
  }

  // 补充引言
  if (config.rewrite.add_intro) {
    rewritten = await addIntro(client, rewritten);
  }

  // 补充结尾总结
  if (config.rewrite.add_summary) {
    rewritten = await addSummary(client, rewritten);
  }

  // 改写标题
  const newTitle = await spinTitle(client, title);

  // 长度检查
  if (rewritten.length < config.rewrite.min_length) {
    throw new Error(`改写后仅${rewritten.length}字，低于最小要求${config.rewrite.min_length}字`);
  }
  if (rewritten.length > config.rewrite.max_length) {
    rewritten = rewritten.slice(0, config.rewrite.max_length - 10) + "\n\n...";
  }

  return {
    originalTitle: title,
    newTitle,
    content: rewritten,
    sourceUrl,
  };
}

/**
 * 清洗正文：去除广告、推广、导航等噪音
 */
async function cleanContent(client: OpenAI, text: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `你是一位内容编辑，负责从网页正文中提取纯净的文章内容。

严格删除：
- 广告、推广、会员/VIP引导、打赏/赞助
- 支付链接、二维码、优惠券
- 网站导航、页脚、版权声明
- "关注公众号"、"加群"等引流
- "上一篇/下一篇"、"相关推荐"
- 作者简介、网站介绍
- 评论区

只保留文章核心正文。直接输出清洗结果。`,
      },
      {
        role: "user",
        content: `清洗以下内容：\n\n${text}`,
      },
    ],
  });
  return response.choices[0].message.content?.trim() || text;
}

async function spinFullArticle(
  client: OpenAI,
  text: string,
  config: SpinbotConfig
): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `请深度改写以下文章，要求完全换一种写法，保持教程/介绍的实用性：\n\n${text}\n\n直接输出改写后的全文，不要加任何说明。`,
      },
    ],
  });
  return response.choices[0].message.content?.trim() || "";
}

async function spinBySegments(
  client: OpenAI,
  segments: Segment[],
  config: SpinbotConfig
): Promise<string> {
  const rewrittenParts: string[] = [];
  let previousContext = "";

  for (const seg of segments) {
    try {
      const contextNote = previousContext
        ? `\n\n前文改写结果末尾（保持衔接）：\n${previousContext.slice(-200)}`
        : "";

      const response = await client.chat.completions.create({
        model: MODEL,
        max_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `请深度改写以下段落：${contextNote}\n\n---\n${seg.text}\n---\n\n直接输出改写结果。`,
          },
        ],
      });

      const result = response.choices[0].message.content?.trim() || "";
      if (result) {
        rewrittenParts.push(result);
        previousContext = result;
      }
    } catch (e) {
      // 跳过审核失败的段落
      console.log(`    ⚠️ 段落改写跳过: ${e instanceof Error ? e.message.slice(0, 80) : "unknown"}`);
    }
  }

  // 全文润色
  const joined = rewrittenParts.join("\n\n");
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: "你是一位资深编辑。请通读全文，修复段落衔接，确保行文流畅。不要改变内容，只做润色。",
      },
      {
        role: "user",
        content: `请润色以下文章：\n\n${joined}\n\n直接输出润色后的全文。`,
      },
    ],
  });

  return response.choices[0].message.content?.trim() || joined;
}

async function addIntro(client: OpenAI, content: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `请为以下文章写一段中文开头引言（2-3句话，引出主题，吸引读者继续阅读）：\n\n${content.slice(0, 500)}\n\n只输出中文引言文字。`,
      },
    ],
  });
  const intro = response.choices[0].message.content?.trim() || "";
  return intro ? intro + "\n\n" + content : content;
}

async function addSummary(client: OpenAI, content: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `请为以下文章写一段中文结尾总结（2-3句话，总结要点，给出建议）：\n\n${content.slice(-800)}\n\n只输出中文总结文字。`,
      },
    ],
  });
  const summary = response.choices[0].message.content?.trim() || "";
  return summary ? content + "\n\n" + summary : content;
}

/**
 * 截断段落列表，使总长度不超过 maxLength
 */
function trimSegments(segments: Segment[], maxLength: number): Segment[] {
  const result: Segment[] = [];
  let total = 0;
  for (const seg of segments) {
    if (total + seg.text.length > maxLength) {
      // 截断最后一段
      const remaining = maxLength - total;
      if (remaining > 200) {
        result.push({ ...seg, text: seg.text.slice(0, remaining), charCount: remaining });
      }
      break;
    }
    result.push(seg);
    total += seg.text.length;
  }
  return result;
}

async function spinTitle(client: OpenAI, title: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `请将以下文章标题改写为中文，要求：有吸引力、口语化、像是科技博主写的，保持核心含义不变。如果原标题是英文请翻译为中文：\n\n${title}\n\n只输出中文新标题，不要加引号或说明。`,
      },
    ],
  });
  return response.choices[0].message.content?.trim() || title;
}
