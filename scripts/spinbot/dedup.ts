/**
 * 去重记录管理
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));
const RECORD_PATH = join(__dirname, "..", "..", "config", "spinbot-processed.json");

export interface ProcessedArticle {
  url: string;
  title: string;
  processedAt: string;
}

interface ProcessedRecord {
  articles: ProcessedArticle[];
  lastRun: string;
}

export function loadProcessed(): ProcessedRecord {
  if (existsSync(RECORD_PATH)) {
    return JSON.parse(readFileSync(RECORD_PATH, "utf-8"));
  }
  return { articles: [], lastRun: "" };
}

export function saveProcessed(record: ProcessedRecord): void {
  // 只保留最近500条
  if (record.articles.length > 500) {
    record.articles = record.articles.slice(-500);
  }
  record.lastRun = new Date().toISOString();
  writeFileSync(RECORD_PATH, JSON.stringify(record, null, 2));
}

export function isProcessed(record: ProcessedRecord, url: string): boolean {
  const normalized = url.split("?")[0].split("#")[0];
  return record.articles.some(
    (a) => a.url.split("?")[0].split("#")[0] === normalized
  );
}

export function markProcessed(
  record: ProcessedRecord,
  url: string,
  title: string
): void {
  record.articles.push({
    url,
    title,
    processedAt: new Date().toISOString(),
  });
}

/**
 * 获取近7天已发文章标题（用于相似度检测）
 */
export function getRecentTitles(record: ProcessedRecord, days: number = 7): string[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return record.articles
    .filter((a) => new Date(a.processedAt) > cutoff)
    .map((a) => a.title);
}
