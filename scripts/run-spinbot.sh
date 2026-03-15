#!/bin/bash
# 每日AI教程洗稿自动执行
# 用法: ./run-spinbot.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/spinbot-$(date +%Y-%m-%d).log"

mkdir -p "$LOG_DIR"

echo "===== $(date '+%Y-%m-%d %H:%M:%S') 洗稿开始 =====" | tee -a "$LOG_FILE"

# 加载环境变量
if [ -f "$SCRIPT_DIR/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
fi

if [ -z "$ZHIPU_API_KEY" ]; then
  echo "错误: 缺少 ZHIPU_API_KEY" | tee -a "$LOG_FILE"
  exit 1
fi

cd "$SCRIPT_DIR"

if [ ! -d "node_modules" ]; then
  echo "安装依赖..." | tee -a "$LOG_FILE"
  npm install >> "$LOG_FILE" 2>&1
fi

# 运行洗稿
npx tsx spinbot/index.ts >> "$LOG_FILE" 2>&1

# Git 提交
cd "$PROJECT_DIR"
if ! git diff --quiet content/; then
  echo "提交变更..." | tee -a "$LOG_FILE"
  git add content/
  git commit -m "Auto spin $(date +%Y-%m-%d)" >> "$LOG_FILE" 2>&1
  git push >> "$LOG_FILE" 2>&1
  echo "已提交并推送" | tee -a "$LOG_FILE"
fi

# 清理旧日志
find "$LOG_DIR" -name "spinbot-*.log" -mtime +30 -delete 2>/dev/null

echo "===== $(date '+%Y-%m-%d %H:%M:%S') 洗稿完毕 =====" | tee -a "$LOG_FILE"
