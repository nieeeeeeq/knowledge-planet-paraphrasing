/**
 * AI文章筛选模块
 * 用AI判断文章是否为教程/介绍类，并打分
 */

import OpenAI from "openai";
import { type CandidateArticle } from "./source-crawler.js";
import { type SpinbotConfig } from "./config.js";

export interface ScoredArticle extends CandidateArticle {
  score: number;
  reason: string;
}

function createClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.ZHIPU_API_KEY,
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
  });
}

/**
 * 批量筛选文章（单次AI调用）
 */
export async function filterArticles(
  candidates: CandidateArticle[],
  config: SpinbotConfig,
  recentTitles: string[]
): Promise<ScoredArticle[]> {
  if (candidates.length === 0) return [];

  const client = createClient();

  // 每批最多30篇，避免token太长
  const batch = candidates.slice(0, 30);

  const articleList = batch
    .map((a, i) => {
      const title = a.title || urlToHint(a.url);
      return `${i + 1}. [${a.source}] ${title} | ${a.url}`;
    })
    .join("\n");

  const recentList = recentTitles.length > 0
    ? `\n\n近7天已发布的文章标题（请避免选择相似主题）：\n${recentTitles.map((t) => `- ${t}`).join("\n")}`
    : "";

  const targetTypes = config.filter.target_types.join("、");
  const excludeTypes = config.filter.exclude_types.join("、");

  const response = await client.chat.completions.create({
    model: "glm-5",
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `你是一位AI内容编辑，负责从候选文章中筛选出适合改写发布的"AI教程/介绍"类文章。

目标类型：${targetTypes}
排除类型：${excludeTypes}

评分标准(0-10)：
- 8-10分：AI工具详细教程、使用指南、实操方法、开源项目介绍
- 5-7分：AI产品评测、功能介绍、技术科普
- 0-4分：纯新闻快讯、融资报道、人事变动、政策法规

注意：
- 所有文章来自海外英文站点，根据英文标题和URL判断内容类型
- 来自 Unite.AI、MarkTechPost、The Decoder 的文章通常是教程/评测类
- 来自 Simon Willison、DeepLearning.AI、Lilian Weng 的文章通常是深度技术博客
- 来自 OpenAI、Anthropic、Meta AI 的是官方博客，通常是产品介绍
- 来自 LangChain、HuggingFace、PyTorch 的是开发者教程
- URL/标题中包含 tutorial、guide、how-to、best、tools、introduction、getting-started 等关键词的大概率是教程

必须输出纯JSON数组，不要用代码块包裹，不要输出其他内容：
[{"index":1,"score":8,"reason":"ChatGPT使用教程"},{"index":2,"score":3,"reason":"融资新闻"}]`,
      },
      {
        role: "user",
        content: `请对以下${batch.length}篇候选文章打分：\n\n${articleList}${recentList}`,
      },
    ],
  });

  const text = response.choices[0].message.content?.trim() || "[]";

  // 解析JSON（容错处理）
  let scores: Array<{ index: number; score: number; reason: string }> = [];
  try {
    // 去除 ```json ``` 包裹
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "");
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      scores = JSON.parse(jsonMatch[0]);
    } else {
      console.error("  AI返回无JSON，原文:", text.slice(0, 300));
    }
  } catch (e) {
    console.error("  AI筛选返回格式异常:", text.slice(0, 300));
    return [];
  }

  // 组装结果
  const results: ScoredArticle[] = [];
  for (const s of scores) {
    const idx = s.index - 1;
    if (idx < 0 || idx >= batch.length) continue;
    results.push({
      ...batch[idx],
      score: s.score,
      reason: s.reason,
    });
  }

  // 按分数降序
  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * 从URL中提取可读提示（当无标题时）
 */
function urlToHint(url: string): string {
  try {
    const path = new URL(url).pathname;
    // 取最后一段路径，将连字符替换为空格
    const slug = path.split("/").filter(Boolean).pop() || "";
    return slug
      .replace(/\.html?$/, "")
      .replace(/[-_]/g, " ")
      .slice(0, 80) || "(无标题)";
  } catch {
    return "(无标题)";
  }
}
