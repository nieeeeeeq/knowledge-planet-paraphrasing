# AI 资讯自动发布部署文档

每天北京时间 9:00 自动抓取 AI 资讯 → 智谱 GLM-5 汇总 → 发布到 Hugo 站点 + 知识星球。

## 一、前置条件

| 项目 | 说明 | 获取方式 |
|------|------|---------|
| GitHub 仓库 | 本项目代码 | `git clone` 本仓库 |
| 智谱 API Key | 用于 AI 汇总 | https://open.bigmodel.cn 注册获取 |
| 知识星球 Cookie | 用于发帖 | 浏览器开发者工具获取（见下文） |
| 知识星球 Group ID | 你的星球 ID | 星球 URL 中获取（见下文） |

## 二、获取知识星球凭证

### 获取 Cookie

1. 浏览器打开 https://wx.zsxq.com 并登录
2. 按 F12 → Network 标签
3. 随便点一个请求，找到 Request Headers 中的 `Cookie`
4. 复制 `zsxq_access_token=xxx` 部分（不需要其他 cookie）

### 获取 Group ID

1. 打开你的星球页面
2. URL 格式为 `https://wx.zsxq.com/group/xxxxx`
3. `xxxxx` 就是 Group ID

> Cookie 有效期约 29 天，过期后需要重新登录获取。

## 三、配置 GitHub Secrets

进入仓库 → Settings → Secrets and variables → Actions → New repository secret，添加以下三个：

| Secret 名称 | 值 |
|-------------|---|
| `ZHIPU_API_KEY` | 智谱 API Key |
| `ZSXQ_COOKIE` | `zsxq_access_token=你的token` |
| `ZSXQ_GROUP_ID` | 星球群组 ID |

## 四、工作流说明

### 每日日报（daily-digest.yml）

- **触发时间**：每天 UTC 1:00（北京时间 9:00）
- **也可手动触发**：仓库 → Actions → Daily AI Digest → Run workflow

**流程**：

```
12个数据源抓取 (~52篇文章)
    ↓
智谱 GLM-5 汇总为6个板块
    ↓
├── 写入 Hugo：content/cn/2026-03/2026-03-15.md
└── 发布知识星球：纯文本格式自动转换
    ↓
Git 自动提交推送
```

### 手动改写（rewrite-single.yml）

仓库 → Actions → Rewrite Article → Run workflow：

- **url**：要改写的文章 URL
- **intensity**：改写强度（light / medium / heavy）
- **publish_zsxq**：是否同时发布到知识星球

### 自动改写（auto-rewrite.yml）

- **触发时间**：每 6 小时
- 自动从配置的数据源抓取并改写文章

## 五、本地开发和测试

### 安装依赖

```bash
cd scripts
npm install
```

### 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入实际值：
# ZHIPU_API_KEY=your_key
# ZSXQ_COOKIE=zsxq_access_token=xxx
# ZSXQ_GROUP_ID=your_group_id
```

### 测试命令

```bash
cd scripts

# 1. 仅测试抓取（不调AI，不花钱）
npx tsx test-digest.ts --fetch-only

# 2. 抓取 + AI汇总预览（不写文件，不发帖）
npx tsx test-digest.ts --dry-run

# 3. 完整流程（写Hugo文件，不发知识星球）
npx tsx test-digest.ts

# 4. 完整流程 + 发布到知识星球
npx tsx test-digest.ts --publish-zsxq

# 5. 测试单个URL
npx tsx test-digest.ts --url https://www.aibase.com/news/26212
```

## 六、数据源配置

编辑 `config/sources.yaml` 添加或修改数据源：

```yaml
sources:
  - name: "数据源名称"
    url: "https://example.com/news"
    type: webpage
    mode: digest          # digest | rewrite | both
    fetch_mode: list      # list (逐篇抓取) | single (整页抓取)
    url_pattern: "example\\.com/article/\\d+"  # 文章URL正则
    max_articles: 10      # 最多抓取篇数
```

当前 12 个数据源：

| 分类 | 数据源 |
|------|--------|
| 国内综合 | AIbase、量子位、机器之心、IT之家、36氪、品玩 |
| 海外 | MarkTechPost |
| 前沿论文 | HuggingFace Papers、arXiv cs.AI |
| 开源项目 | GitHub Trending |
| 社媒论坛 | Reddit AI、Hacker News AI |

## 七、知识星球 Cookie 维护

Cookie 有效期约 **29 天**。建议：

1. 在日历中设置每 25 天提醒
2. 登录 https://wx.zsxq.com 获取新 Cookie
3. 更新 GitHub Secrets 中的 `ZSXQ_COOKIE`

**判断 Cookie 是否过期**：

```bash
curl -s 'https://api.zsxq.com/v2/settings' \
  -b 'zsxq_access_token=你的token' \
  -H 'origin: https://wx.zsxq.com' \
  -H 'referer: https://wx.zsxq.com/' | python3 -m json.tool
```

- 返回 `"succeeded": true` → 有效
- 返回 `"succeeded": false` → 已过期，需要更新

## 八、常见问题

### Q: 知识星球发布失败？

1. 检查 Cookie 是否过期
2. 检查 Group ID 是否正确
3. 检查当日是否已达到发帖上限（默认 5 篇/天）

### Q: 抓取结果为 0 篇？

1. Jina Reader 可能被限流，等几分钟重试
2. 检查 `url_pattern` 正则是否匹配目标站点的文章链接格式

### Q: AI 汇总质量不佳？

1. 检查 `scripts/summarizer.ts` 中的 prompt
2. 确保抓取到足够多的文章（建议 > 20 篇）

### Q: GitHub Actions 运行失败？

1. 检查 Actions → 对应 workflow → 查看运行日志
2. 确认三个 Secrets 都已正确配置
3. 确认 `scripts/package.json` 依赖安装无误
