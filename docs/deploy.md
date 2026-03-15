# AI 资讯自动发布部署文档

每天北京时间 9:00 自动抓取 AI 资讯 → 智谱 GLM-5 汇总 → 发布到 Hugo 站点 + 知识星球。

## 一、前置条件

| 项目 | 说明 | 获取方式 |
|------|------|---------|
| Node.js 20+ | 运行环境 | https://nodejs.org |
| Git | 代码管理 | `brew install git` |
| 智谱 API Key | AI 汇总 | https://open.bigmodel.cn 注册 |
| 知识星球 Cookie | 发帖凭证 | 浏览器获取（见下文） |
| 知识星球 Group ID | 星球 ID | 星球 URL 中获取（见下文） |

## 二、获取知识星球凭证

### 获取 Cookie

1. 浏览器打开 https://wx.zsxq.com 并登录
2. 按 F12 → Network 标签
3. 随便点一个请求，找到 Request Headers 中的 `Cookie`
4. 复制 `zsxq_access_token=xxx` 部分

### 获取 Group ID

1. 打开你的星球页面
2. URL 格式为 `https://wx.zsxq.com/group/xxxxx`
3. `xxxxx` 就是 Group ID

> Cookie 有效期约 29 天，过期后需重新登录获取。

## 三、安装

```bash
cd /Users/q/Code/knowledge-planet-paraphrasing/scripts
npm install
```

## 四、配置环境变量

```bash
cp .env.example .env
```

编辑 `scripts/.env`：

```
ZHIPU_API_KEY=你的智谱API密钥
ZSXQ_COOKIE=zsxq_access_token=你的token
ZSXQ_GROUP_ID=你的星球群组ID
```

## 五、测试

```bash
cd scripts

# 1. 仅测试抓取（不调AI，不花钱）
npx tsx test-digest.ts --fetch-only

# 2. 抓取 + AI汇总预览（不写文件，不发帖）
npx tsx test-digest.ts --dry-run

# 3. 完整流程（写Hugo + 发知识星球）
npx tsx test-digest.ts --publish-zsxq
```

## 六、设置每天 9:00 自动执行

### macOS crontab

```bash
crontab -e
```

添加以下行：

```
0 9 * * * /Users/q/Code/knowledge-planet-paraphrasing/scripts/run-digest.sh >> /Users/q/Code/knowledge-planet-paraphrasing/logs/cron.log 2>&1
```

验证：

```bash
crontab -l
```

### macOS launchd（推荐，睡眠唤醒后也能补执行）

创建配置文件：

```bash
cat > ~/Library/LaunchAgents/com.ai-digest.daily.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ai-digest.daily</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/q/Code/knowledge-planet-paraphrasing/scripts/run-digest.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/q/Code/knowledge-planet-paraphrasing/logs/launchd.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/q/Code/knowledge-planet-paraphrasing/logs/launchd-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
EOF
```

加载启动：

```bash
launchctl load ~/Library/LaunchAgents/com.ai-digest.daily.plist
```

管理命令：

```bash
# 查看状态
launchctl list | grep ai-digest

# 手动触发一次
launchctl start com.ai-digest.daily

# 停止
launchctl unload ~/Library/LaunchAgents/com.ai-digest.daily.plist
```

### Linux 服务器 (VPS)

```bash
crontab -e
```

```
0 9 * * * cd /path/to/knowledge-planet-paraphrasing/scripts && /usr/bin/bash run-digest.sh >> ../logs/cron.log 2>&1
```

## 七、执行流程

```
每天 9:00
  ↓
run-digest.sh
  ↓
加载 .env 环境变量
  ↓
运行 digest.ts
  ├── 12个数据源抓取 (~52篇文章)
  ├── 智谱 GLM-5 汇总6个板块
  ├── 写入 Hugo: content/cn/YYYY-MM/YYYY-MM-DD.md
  └── 发布知识星球 (纯文本自动转换)
  ↓
Git 自动提交推送
  ↓
清理30天前日志
```

## 八、日志查看

```bash
# 查看今天的日志
cat logs/digest-$(date +%Y-%m-%d).log

# 查看最近日志
ls -lt logs/ | head
```

## 九、数据源配置

编辑 `config/sources.yaml`：

```yaml
sources:
  - name: "数据源名称"
    url: "https://example.com/news"
    type: webpage
    mode: digest          # digest | rewrite | both
    fetch_mode: list      # list (逐篇) | single (整页)
    url_pattern: "example\\.com/article/\\d+"
    max_articles: 10
```

当前 12 个数据源：

| 分类 | 数据源 |
|------|--------|
| 国内综合 | AIbase、量子位、机器之心、IT之家、36氪、品玩 |
| 海外 | MarkTechPost |
| 前沿论文 | HuggingFace Papers、arXiv cs.AI |
| 开源项目 | GitHub Trending |
| 社媒论坛 | Reddit AI、Hacker News AI |

## 十、知识星球 Cookie 维护

Cookie 有效期约 **29 天**。

**检查是否过期**：

```bash
curl -s 'https://api.zsxq.com/v2/settings' \
  -b 'zsxq_access_token=你的token' \
  -H 'origin: https://wx.zsxq.com' | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d.get('succeeded'):
    print('有效')
else:
    print('已过期，请重新获取')
"
```

**更新步骤**：

1. 浏览器登录 https://wx.zsxq.com
2. F12 复制新 Cookie
3. 编辑 `scripts/.env` 更新 `ZSXQ_COOKIE`

## 十一、常见问题

### Q: 知识星球发布失败？
- 检查 Cookie 是否过期
- 检查 Group ID 是否正确
- 当日是否已超 5 篇限制

### Q: 抓取 0 篇文章？
- Jina Reader 可能限流，等几分钟重试
- 检查 `url_pattern` 正则是否匹配

### Q: cron 没有执行？
- macOS 需要给终端"完全磁盘访问"权限（系统设置 → 隐私与安全 → 完全磁盘访问）
- 检查 `which node` 和 `which npx` 路径是否在 cron 的 PATH 中
- 推荐用 launchd 替代 crontab

### Q: 手动执行一次？
```bash
cd scripts && ./run-digest.sh
```
