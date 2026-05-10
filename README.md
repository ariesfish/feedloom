<div align="center">
  <img src="assets/logo.png" alt="Feedloom logo" width="160">
  <h1>Feedloom</h1>
  <p><strong>快速剪藏优质内容</strong></p>
  <p><strong>支持公众号、小红书、知乎、X、YouTube 等各种网站</strong></p>
  <p>
    <a href="https://www.npmjs.com/package/@ariesfish/feedloom"><img alt="npm version" src="https://img.shields.io/npm/v/@ariesfish/feedloom"></a>
    <img alt="Node 24 or newer" src="https://img.shields.io/badge/node-24%2B-339933">
    <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue">
  </p>
  <p><a href="README.en.md">English</a></p>
</div>

Feedloom 是一个 Agent 原生的网页剪藏工具。给它一篇文章、一组链接或一个 RSS 订阅，它会为你提取正文、清理页面噪音、下载图片，并生成适合放进个人知识库、Obsidian、离线阅读目录的完整 Markdown 文档。

它适合这些场景：

- 看到一篇值得收藏的文章，不想只保留一个以后可能失效的链接。
- 把博客、公众号、知乎、小红书、X、YouTube 等各种网页内容收藏到自己的知识库。
- 支持批量剪藏，免去一篇篇复制粘贴。
- 保存文章时同时保留本地图片，方便离线阅读和迁移。

## 主要能力

- 把文章保存为带 YAML frontmatter 的 Markdown。
- 自动下载页面图片，并改写为本地 Markdown 图片引用。
- 支持直接输入 URL、读取批量链接列表和 RSS 订阅。
- 支持静态抓取、浏览器渲染抓取、stealth 模式，适应需要 JavaScript 渲染的页面。
- 内置常见站点规则，例如微信公众号、知乎、小红书、X、YouTube 等。
- 可选使用本机登录状态，处理需要登录或反爬较强的页面。

## 安装要求

- Node.js >= 24
- npm
- 使用浏览器抓取时需要 Patchright Chromium；`doctor` 命令可以自动检查并安装。

## 直接运行

无需安装，直接用 `npx`：

```bash
npx -y @ariesfish/feedloom "https://example.com/article"
```

也可以全局安装：

```bash
npm install -g @ariesfish/feedloom
feedloom "https://example.com/article"
```

检查并修复浏览器运行环境：

```bash
npx -y @ariesfish/feedloom doctor
```

如果缺少 Patchright Chromium，`doctor` 会自动执行 `npx patchright install chromium`。

## 快速开始

保存单篇文章：

```bash
npx -y @ariesfish/feedloom "https://example.com/article"
```

指定输出目录：

```bash
npx -y @ariesfish/feedloom --output-dir ./outputs "https://example.com/article"
```

批量保存 URL 列表：

```bash
npx -y @ariesfish/feedloom urls.md --limit 10
```

`urls.md` 可以是普通链接列表，也可以是 Markdown checklist：

```markdown
- [ ] https://example.com/a
- [ ] https://example.com/b
```

成功处理后，对应项会被标记为完成：

```markdown
- [x] https://example.com/a
```

保存 RSS 订阅中的文章：

```bash
npx -y @ariesfish/feedloom "https://example.com/feed.xml" --source-kind rss-feed --since 2026-01-01
```

处理需要 JavaScript 渲染的页面：

```bash
npx -y @ariesfish/feedloom "https://example.com/article" --fetch-mode browser --wait-ms 4000 --scroll-to-bottom
```

普通模式失败时，再尝试 `stealth` 模式：

```bash
npx -y @ariesfish/feedloom "https://example.com/article" --fetch-mode stealth --solve-cloudflare
```

## 输出长什么样

Feedloom 默认写入 `clippings/`。生成的 Markdown 大致如下：

```markdown
---
source: "https://example.com/article"
author: "Author Name"
created: "2026-04-29"
---

# Article Title

Article content...
```

## 抓取模式怎么选

| 模式 | 适合情况 |
| --- | --- |
| `auto` | 默认模式。先尝试静态抓取，内容不足时再回退到浏览器/stealth。 |
| `static` | 页面本身已服务端渲染，不需要 JavaScript。速度最快。 |
| `browser` | 页面需要 JavaScript 渲染、等待元素、点击按钮或滚动加载。 |
| `stealth` | 普通浏览器模式仍失败，站点有更强的反爬检测。 |

建议先用默认 `auto`。只有结果不完整时，再显式选择 `browser` 或 `stealth`。

## 自定义规则

Feedloom 内置 TOML 站点规则，用于处理常见的动态页面或结构化站点。你也可以把自己的私有规则放在包外，并在运行时指定：

```bash
npx -y @ariesfish/feedloom "https://example.com/article" --site-rules-dir ./site-rules
```

私有规则适合为自己的常用网站做精准适配。

## Agent Skill

Feedloom 随包提供 `skills/feedloom`，支持 `skills` CLI 的 Agent 可以直接安装这个网页归档能力：

```bash
npx skills add @ariesfish/feedloom --skill feedloom
```

全局安装到支持的 Agent：

```bash
npx skills add @ariesfish/feedloom --skill feedloom --global
```

## 使用建议

- 大批量归档前，先用 `--limit` 跑几篇确认效果。
- 静态博客和新闻站通常用默认模式即可；动态站点再尝试 `--fetch-mode browser`。
- 不要把 Feedloom 当成高并发爬虫。它更适合个人剪藏使用。
- 遵守 robots.txt、网站服务条款、版权规则和访问频率限制。

## 致谢

Feedloom 受到这些优秀项目启发：

- [Defuddle](https://github.com/kepano/defuddle)：可读正文抽取思路。
- [Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright)：浏览器自动化和更真实的页面访问能力。
- [Scrapling](https://github.com/D4Vinci/Scrapling)：更稳健的抓取 fallback 思路。

## License

MIT License
