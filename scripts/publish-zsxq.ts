/**
 * 知识星球发布模块
 * 通过逆向API自动发帖到知识星球
 */

import { loadPublishConfig } from "./config.js";

export interface ZsxqPostOptions {
  title: string;
  content: string;
  sourceUrl?: string;
}

/**
 * 发布帖子到知识星球
 */
export async function publishToZsxq(
  options: ZsxqPostOptions
): Promise<{ success: boolean; topicId?: string; error?: string }> {
  const config = loadPublishConfig();
  const zsxqConfig = config.zsxq;

  if (!zsxqConfig.enabled) {
    console.log("ZSXQ publishing is disabled");
    return { success: false, error: "disabled" };
  }

  const cookie = process.env.ZSXQ_COOKIE;
  const groupId = process.env.ZSXQ_GROUP_ID;

  if (!cookie || !groupId) {
    return {
      success: false,
      error: "Missing ZSXQ_COOKIE or ZSXQ_GROUP_ID environment variables",
    };
  }

  // 组装帖子内容（Markdown → 纯文本）
  let postText = formatPost(options, zsxqConfig);
  postText = markdownToPlainText(postText);

  // 截断超长内容
  if (postText.length > zsxqConfig.max_length) {
    postText =
      postText.slice(0, zsxqConfig.max_length - 20) + "\n\n...(内容已截断)";
  }

  try {
    const response = await fetch(
      `${zsxqConfig.api_base}/groups/${groupId}/topics`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Origin: "https://wx.zsxq.com",
          Referer: "https://wx.zsxq.com/",
        },
        body: JSON.stringify({
          req_data: {
            type: "talk",
            text: postText,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `ZSXQ API error: ${response.status} - ${errorText}`,
      };
    }

    const data = (await response.json()) as {
      succeeded?: boolean;
      resp_data?: { topic?: { topic_id?: string } };
    };

    if (data.succeeded) {
      const topicId = data.resp_data?.topic?.topic_id;
      console.log(`Published to ZSXQ successfully, topic_id: ${topicId}`);
      return { success: true, topicId };
    }

    return { success: false, error: JSON.stringify(data) };
  } catch (error) {
    return {
      success: false,
      error: `Network error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 批量发布（带频率限制）
 */
export async function publishBatchToZsxq(
  posts: ZsxqPostOptions[]
): Promise<void> {
  const config = loadPublishConfig();
  const { max_posts_per_day, min_interval_minutes } =
    config.zsxq.rate_limit;

  const limit = Math.min(posts.length, max_posts_per_day);

  for (let i = 0; i < limit; i++) {
    const result = await publishToZsxq(posts[i]);
    console.log(
      `[${i + 1}/${limit}] ${result.success ? "OK" : "FAIL"}: ${posts[i].title}`
    );

    if (i < limit - 1) {
      console.log(
        `Waiting ${min_interval_minutes} minutes before next post...`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, min_interval_minutes * 60 * 1000)
      );
    }
  }
}

/**
 * 将 Markdown 转为知识星球纯文本格式
 */
function markdownToPlainText(md: string): string {
  return md
    // 代码块 → 保留内容
    .replace(/```\n?([\s\S]*?)\n?```/g, "$1")
    // ### 标题 → 【标题】
    .replace(/^#{1,6}\s+\**(.+?)\**\s*$/gm, "\n【$1】\n")
    // **粗体** → 去掉星号
    .replace(/\*\*(.+?)\*\*/g, "$1")
    // [文字](URL) → 文字 URL
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 $2")
    // ![alt](URL) → 去掉图片
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    // `行内代码` → 去掉反引号
    .replace(/`([^`]+)`/g, "$1")
    // > 引用 → 去掉引用符号
    .replace(/^>\s+/gm, "")
    // markdown 表格 → 去掉
    .replace(/^\|.*\|$/gm, "")
    // --- 分隔线 → 空行
    .replace(/^-{3,}$/gm, "")
    // 多余空行压缩
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatPost(
  options: ZsxqPostOptions,
  config: { add_source: boolean; post_format: string }
): string {
  let text = config.post_format
    .replace("{title}", options.title)
    .replace("{content}", options.content)
    .replace("{source_url}", options.sourceUrl || "")
    .trim();

  if (!config.add_source || !options.sourceUrl) {
    // 移除来源行
    text = text.replace(/\n*来源:.*$/m, "").trim();
  }

  return text;
}
