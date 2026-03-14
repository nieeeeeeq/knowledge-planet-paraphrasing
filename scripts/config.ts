/**
 * 配置加载模块
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, "..", "config");

interface SourceConfig {
  sources: Array<{
    name: string;
    url: string;
    type: "rss" | "webpage";
    mode: "digest" | "rewrite" | "both";
    fetch_mode?: "list" | "single";
    url_pattern?: string;
    max_articles?: number;
    selector?: string;
  }>;
}

interface RewriteConfig {
  rewrite: {
    default_intensity: string;
    style: string;
    keep_terms: string[];
    max_length_ratio: number;
    min_length_ratio: number;
    language: string;
  };
}

interface PublishConfig {
  hugo: {
    enabled: boolean;
    content_dir: string;
    categories: { digest: string; rewrite: string };
  };
  zsxq: {
    enabled: boolean;
    api_base: string;
    max_length: number;
    add_source: boolean;
    add_disclaimer: boolean;
    rate_limit: {
      max_posts_per_day: number;
      min_interval_minutes: number;
    };
    post_format: string;
  };
}

export function loadSourceConfig(): SourceConfig {
  return loadYaml<SourceConfig>("sources.yaml");
}

export function loadRewriteConfig(): RewriteConfig {
  return loadYaml<RewriteConfig>("rewrite.yaml");
}

export function loadPublishConfig(): PublishConfig {
  return loadYaml<PublishConfig>("publish.yaml");
}

function loadYaml<T>(filename: string): T {
  const filePath = join(CONFIG_DIR, filename);
  const content = readFileSync(filePath, "utf-8");
  return yaml.load(content) as T;
}
