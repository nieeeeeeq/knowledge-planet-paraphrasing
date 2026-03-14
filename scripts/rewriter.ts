/**
 * AI改写引擎
 * 使用智谱GLM-5 API逐段改写文章
 */

import OpenAI from "openai";
import { type Segment } from "./split.js";
import { loadRewriteConfig } from "./config.js";

export type RewriteIntensity = "light" | "medium" | "heavy";

const SYSTEM_PROMPTS: Record<RewriteIntensity, string> = {
  light: `你是一位资深中文编辑。你的任务是对文章进行轻度改写：
- 替换部分词语和调整句式
- 保留原文的段落结构和论述顺序
- 保持专业术语不变
- 保持相近的篇幅
- 确保语句通顺自然，不要有AI痕迹`,

  medium: `你是一位资深中文编辑。你的任务是对文章进行中度改写：
- 重新组织句子结构
- 调整部分论述顺序
- 使用不同的表达方式传达相同含义
- 保持专业术语不变
- 保持相近的篇幅
- 确保行文流畅，有自然的个人风格`,

  heavy: `你是一位资深中文编辑。你的任务是对文章进行深度改写：
- 提取核心观点和关键信息
- 用完全不同的行文方式重新撰写
- 可以调整段落结构和论述逻辑
- 保持专业术语不变
- 篇幅可以有所调整
- 要求有鲜明的个人写作风格，完全看不出原文痕迹`,
};

export interface RewriteResult {
  originalTitle: string;
  rewrittenTitle: string;
  originalContent: string;
  rewrittenContent: string;
  intensity: RewriteIntensity;
  segmentCount: number;
}

function createClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.ZHIPU_API_KEY,
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
  });
}

const MODEL = "glm-5";

/**
 * 改写完整文章
 */
export async function rewriteArticle(
  title: string,
  segments: Segment[],
  intensity?: RewriteIntensity
): Promise<RewriteResult> {
  const config = loadRewriteConfig();
  const level = intensity || (config.rewrite.default_intensity as RewriteIntensity);
  const keepTerms = config.rewrite.keep_terms || [];

  const client = createClient();
  const rewrittenSegments: string[] = [];

  let previousRewritten = "";

  for (const segment of segments) {
    const rewritten = await rewriteSegment(
      client,
      segment.text,
      level,
      keepTerms,
      previousRewritten
    );
    rewrittenSegments.push(rewritten);
    previousRewritten = rewritten;
  }

  // 全文润色：确保段落间衔接自然
  const joined = rewrittenSegments.join("\n\n");
  const polished = await polishFullText(client, joined, level);

  // 改写标题
  const newTitle = await rewriteTitle(client, title, level);

  return {
    originalTitle: title,
    rewrittenTitle: newTitle,
    originalContent: segments.map((s) => s.text).join("\n\n"),
    rewrittenContent: polished,
    intensity: level,
    segmentCount: segments.length,
  };
}

async function rewriteSegment(
  client: OpenAI,
  text: string,
  intensity: RewriteIntensity,
  keepTerms: string[],
  previousContext: string
): Promise<string> {
  const termsNote =
    keepTerms.length > 0
      ? `\n\n以下术语请保持原样不要改写：${keepTerms.join("、")}`
      : "";

  const contextNote = previousContext
    ? `\n\n前一段改写结果（用于保持上下文衔接，不要重复这段内容）：\n${previousContext.slice(-300)}`
    : "";

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      { role: "system", content: SYSTEM_PROMPTS[intensity] },
      {
        role: "user",
        content: `请改写以下段落：${termsNote}${contextNote}\n\n---\n${text}\n---\n\n直接输出改写结果，不要加任何说明或前缀。`,
      },
    ],
  });

  return response.choices[0].message.content?.trim() || "";
}

async function polishFullText(
  client: OpenAI,
  text: string,
  intensity: RewriteIntensity
): Promise<string> {
  // 短文章不需要额外润色
  if (text.length < 500) return text;

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content:
          "你是一位资深中文编辑。请通读全文，修复段落间的衔接问题，确保行文流畅自然。不要改变内容含义，只做最小的润色调整。",
      },
      {
        role: "user",
        content: `请润色以下文章的段落衔接：\n\n${text}\n\n直接输出润色后的全文，不要加说明。`,
      },
    ],
  });

  return response.choices[0].message.content?.trim() || "";
}

async function rewriteTitle(
  client: OpenAI,
  title: string,
  intensity: RewriteIntensity
): Promise<string> {
  if (intensity === "light") return title;

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `请改写以下文章标题，保持含义不变但使用不同的表达方式：\n\n${title}\n\n只输出新标题，不要加引号或说明。`,
      },
    ],
  });

  return response.choices[0].message.content?.trim() || "";
}
