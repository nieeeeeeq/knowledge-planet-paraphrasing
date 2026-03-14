/**
 * AI汇总模块
 * 将多篇文章汇总为结构化日报
 */

import OpenAI from "openai";
import { type FetchResult } from "./fetch.js";

export interface DigestResult {
  title: string;
  summary: string;
  content: string;
  date: string;
  sourceCount: number;
}

function createClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.ZHIPU_API_KEY,
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
  });
}

const MODEL = "glm-5";

const SYSTEM_PROMPT = `你是一位AI领域的资深编辑，负责编写每日AI资讯日报。

## 严格输出格式

你必须严格按照以下结构输出，不要添加或遗漏任何章节：

\`\`\`
今日摘要内容（3-5行纯文本，用逗号分隔要点，不要用列表格式）
\`\`\`

### 产品与功能更新

1. **标题。**
描述内容，包含**关键词加粗**。[链接文字（AI资讯）](原始URL)。

2. ...

### 前沿研究

1. **标题。**
描述内容。[链接文字（AI资讯）](原始URL)。

2. ...

### 行业展望与社会影响

1. **标题。**
描述内容。[链接文字（AI资讯）](原始URL)。

2. ...

### 开源TOP项目

1. **标题。**
描述内容。[链接文字（AI资讯）](原始URL)。

2. ...

### 社媒分享

1. **标题。**
描述内容。[链接文字（AI资讯）](原始URL)。

2. ...

## 写作要求

1. 每个分类下必须有5-7条新闻，用编号列表。数量分配参考：
   - 产品与功能更新：5-7条
   - 前沿研究：3-5条
   - 行业展望与社会影响：5-7条
   - 开源TOP项目：至少6条（必须从GitHub Trending中提取当日热门AI/ML相关项目，每条附GitHub链接）
   - 社媒分享：至少6条（从Reddit、Hacker News讨论以及文章中提到的社交媒体热议话题提取）
2. 每条新闻以**粗体标题**开头，标题末尾加句号
3. 描述中关键产品名、公司名、技术术语用**粗体**
4. 每条新闻必须包含至少一个来源链接，格式为 [描述文字（AI资讯）](URL)
5. 语言简洁有力，突出关键信息
6. 使用中文撰写
7. 今日摘要放在代码块内，5行纯文本，每行概括一个领域的要点，用逗号分隔
8. 不要遗漏重要新闻，尽量覆盖所有提供的文章内容
9. 开源项目条目应包含GitHub链接，社媒分享应包含原始讨论链接`;

/**
 * 将多篇文章汇总为每日AI资讯
 */
export async function summarizeDigest(
  articles: FetchResult[]
): Promise<DigestResult> {
  const client = createClient();
  const today = new Date().toISOString().split("T")[0];

  // 准备文章摘要列表，包含原始URL
  const articleSummaries = articles
    .map(
      (a, i) =>
        `【文章${i + 1}】标题：${a.title}\n来源URL：${a.url}\n内容：\n${a.content.slice(0, 3000)}`
    )
    .join("\n\n---\n\n");

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 16384,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `请根据以下${articles.length}篇文章，编写${today}的AI资讯日报。务必在每条新闻中嵌入对应的来源URL链接。\n\n${articleSummaries}`,
      },
    ],
  });

  const content = response.choices[0].message.content?.trim() || "";

  // 提取摘要（代码块内的内容）
  const codeBlockMatch = content.match(/```\n?([\s\S]*?)\n?```/);
  const summary = codeBlockMatch
    ? codeBlockMatch[1].trim().replace(/\n/g, ",").slice(0, 200)
    : content.slice(0, 200);

  return {
    title: `AI资讯日报 ${today.replace(/-/g, "/")}`,
    summary,
    content,
    date: today,
    sourceCount: articles.length,
  };
}
