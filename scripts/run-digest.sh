#!/bin/bash
# 每日AI资讯自动抓取、汇总、发布
# 用法: ./run-digest.sh [--publish-zsxq]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/digest-$(date +%Y-%m-%d).log"

mkdir -p "$LOG_DIR"

echo "===== $(date '+%Y-%m-%d %H:%M:%S') 开始执行 =====" | tee -a "$LOG_FILE"

# 加载环境变量
if [ -f "$SCRIPT_DIR/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
fi

# 检查必要环境变量
if [ -z "$ZHIPU_API_KEY" ]; then
  echo "错误: 缺少 ZHIPU_API_KEY" | tee -a "$LOG_FILE"
  exit 1
fi

# 进入脚本目录
cd "$SCRIPT_DIR"

# 安装依赖（如果需要）
if [ ! -d "node_modules" ]; then
  echo "安装依赖..." | tee -a "$LOG_FILE"
  npm install >> "$LOG_FILE" 2>&1
fi

# 运行日报
echo "开始抓取和汇总..." | tee -a "$LOG_FILE"
npx tsx digest.ts >> "$LOG_FILE" 2>&1

# Git 提交
cd "$PROJECT_DIR"
if ! git diff --quiet content/; then
  echo "提交变更..." | tee -a "$LOG_FILE"
  git add content/
  git commit -m "Daily AI digest $(date +%Y-%m-%d)" >> "$LOG_FILE" 2>&1
  git push >> "$LOG_FILE" 2>&1
  echo "已提交并推送" | tee -a "$LOG_FILE"
else
  echo "无新内容" | tee -a "$LOG_FILE"
fi

# 清理30天前的日志
find "$LOG_DIR" -name "digest-*.log" -mtime +30 -delete 2>/dev/null

echo "===== $(date '+%Y-%m-%d %H:%M:%S') 执行完毕 =====" | tee -a "$LOG_FILE"
