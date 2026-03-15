/**
 * 洗稿发布模块
 * 发布到知识星球（纯文本）+ Hugo（Markdown）
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { publishToZsxq } from "../publish-zsxq.js";
import { type SpinResult } from "./article-spinner.js";
import { type SpinbotConfig } from "./config.js";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");

/**
 * 发布改写文章到Hugo
 */
export function publishToHugo(article: SpinResult, config: SpinbotConfig): string {
  const today = new Date().toISOString().split("T")[0];
  const slug = slugify(article.newTitle);
  const dir = join(PROJECT_ROOT, "content", "cn", config.publish.hugo_dir);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const filePath = join(dir, `${today}-${slug}.md`);

  const frontmatter = `---
title: "${article.newTitle.replace(/"/g, '\\"')}"
date: ${today}
comments: true
tags:
  - AI
  - 教程
---`;

  const fullContent = `${frontmatter}

${article.content}
`;

  writeFileSync(filePath, fullContent, "utf-8");
  return filePath;
}

/**
 * 发布改写文章到知识星球
 */
export async function publishToZsxqChannel(
  article: SpinResult
): Promise<{ success: boolean; error?: string }> {
  return publishToZsxq({
    title: article.newTitle,
    content: article.content,
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
