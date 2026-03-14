/**
 * Hugo发布模块
 * 将处理后的文章生成Hugo Markdown并写入content目录
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { type DigestResult } from "./summarizer.js";
import { type RewriteResult } from "./rewriter.js";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

/**
 * 发布每日汇总到Hugo
 */
export function publishDigest(digest: DigestResult): string {
  const [year, month] = digest.date.split("-");
  const dir = join(PROJECT_ROOT, "content", "cn", `${year}-${month}`);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    // 创建_index.md
    const indexContent = `---
title: ${year}年${parseInt(month)}月
breadcrumbs: false
---
`;
    writeFileSync(join(dir, "_index.md"), indexContent);
  }

  const filePath = join(dir, `${digest.date}.md`);
  const weight = calculateWeight(digest.date);

  const frontmatter = `---
linkTitle: ${digest.date.slice(5)} AI资讯
title: ${digest.title}
weight: ${weight}
breadcrumbs: false
comments: true
description: "${digest.summary.replace(/"/g, '\\"')}"
---`;

  const header = `>  \`AI资讯\` | \`每日早读\` | \`全网数据聚合\` | \`前沿科学探索\` | \`行业自由发声\` | \`开源创新力量\` | \`AI与人类未来\` | [访问网页版↗️](https://ai.hubtoday.app/) | [进群交流🤙](https://source.hubtoday.app/logo/wechat-qun.jpg)

## **今日摘要**`;

  const footer = `---

## **AI资讯日报多渠道**

| 💬 **微信公众号** | 📹 **抖音** |
| --- | --- |
| 公众号：何夕2077  |   [自媒体账号](https://www.douyin.com/user/MS4wLjABAAAAwpwqPQlu38sO38VyWgw9ZjDEnN4bMR5j8x111UxpseHR9DpB6-CveI5KRXOWuFwG)|
| ![微信公众号](https://source.hubtoday.app/logo/wechatgzh_20260218215501_244.jpg) | ![情报站](https://source.hubtoday.app/logo/7fc30805eeb831e1e2baa3a240683ca3.md.png) |`;

  const fullContent = `${frontmatter}

${header}

${digest.content}

${footer}
`;

  writeFileSync(filePath, fullContent, "utf-8");
  console.log(`Published digest to: ${filePath}`);
  return filePath;
}

/**
 * 发布改写文章到Hugo blog目录
 */
export function publishRewrite(
  rewrite: RewriteResult,
  sourceUrl: string
): string {
  const today = new Date().toISOString().split("T")[0];
  const slug = slugify(rewrite.rewrittenTitle);
  const filePath = join(
    PROJECT_ROOT,
    "content",
    "cn",
    "blog",
    `${today}-${slug}.md`
  );

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const frontmatter = `---
title: "${rewrite.rewrittenTitle.replace(/"/g, '\\"')}"
date: ${today}
comments: true
tags:
  - AI
  - 改写
---`;

  const fullContent = `${frontmatter}

${rewrite.rewrittenContent}
`;

  writeFileSync(filePath, fullContent, "utf-8");
  console.log(`Published rewrite to: ${filePath}`);
  return filePath;
}

function calculateWeight(dateStr: string): number {
  const day = parseInt(dateStr.split("-")[2]);
  // 倒序权重，让最新的排最前
  return 32 - day;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
