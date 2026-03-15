/**
 * 洗稿模块配置加载
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __dirname = typeof import.meta.dirname === "string"
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "..", "..", "config", "spinbot.yaml");

export interface SpinbotSource {
  name: string;
  url: string;
  url_pattern?: string;
  max_scan: number;
}

export interface SpinbotConfig {
  daily_limit: number;
  filter: {
    min_score: number;
    target_types: string[];
    exclude_types: string[];
  };
  rewrite: {
    intensity: string;
    add_intro: boolean;
    add_summary: boolean;
    min_length: number;
    max_length: number;
  };
  publish: {
    zsxq: boolean;
    hugo: boolean;
    hugo_dir: string;
    interval_minutes: number;
  };
  sources: SpinbotSource[];
}

export function loadSpinbotConfig(): SpinbotConfig {
  const content = readFileSync(CONFIG_PATH, "utf-8");
  return yaml.load(content) as SpinbotConfig;
}
