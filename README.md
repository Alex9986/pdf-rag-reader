# PDF RAG 阅读器

上传 PDF，基于 **RAG（检索增强生成）** 针对文档内容提问，答案附带原文引用，点击引用可跳转到 PDF 对应页码。

## 架构

浏览器端 RAG + 服务端轻量代理：

```
上传 PDF ──► pdf.js 提取文本 ──► 分块(带页码) ──► bge-m3 本地 embedding ──► IndexedDB 向量库
提问   ──► 问题 embedding ──► 余弦相似度 top-k ──► /api/chat(DeepSeek) ──► 流式答案 + 引用
```

- **embedding / 检索全在浏览器**：`transformers.js` 跑本地模型，向量存 IndexedDB，不依赖服务端，可直接部署 Vercel。
- **服务端只有 `/api/chat`**：转发 DeepSeek 请求并隐藏 API key。

## 技术栈

| 环节 | 选型 |
|---|---|
| PDF 提取/渲染 | `pdfjs-dist` |
| Embedding | `@huggingface/transformers` + `Xenova/bge-m3` |
| 向量存储 | IndexedDB（`idb`） |
| 检索 | 手写余弦相似度（暴力 top-k） |
| 生成 | DeepSeek `deepseek-chat`（SSE 流式） |
| 框架 | Next.js 16（App Router）+ Tailwind CSS 4 |

## 本地运行

1. 安装依赖：

```bash
npm install
```

2. 配置 API key，复制 `.env.example` 为 `.env.local`（已被 gitignore）并填入：

```bash
DEEPSEEK_API_KEY=sk-你的key
```

3. 启动：

```bash
npm run dev
```

打开 http://localhost:3000 ，上传 PDF → 等待索引完成 → 提问。

> 首次上传会从 HuggingFace 下载 embedding 模型（`bge-m3` 量化版约数百 MB），界面会显示下载进度，之后浏览器会缓存。

## 部署到 Vercel

1. 推送到 GitHub 后，在 Vercel 导入仓库。
2. 在项目 Settings → Environment Variables 添加 `DEEPSEEK_API_KEY`（**不要**加 `NEXT_PUBLIC_` 前缀）。
3. 部署即可。embedding 与检索在用户浏览器执行，Vercel 只承担 `/api/chat` 代理，无冷启动压力。

## 注意事项

- 目前仅支持**文字版 PDF**；扫描版（无文字层）会提示无法提取。
- DeepSeek API key 只存在于服务端 `.env.local` / Vercel 环境变量，切勿以 `NEXT_PUBLIC_` 开头暴露到客户端。
- 想换更轻量的 embedding 模型（约 120MB，中英质量略降），改 `lib/embedding.ts` 里的 `EMBEDDING_MODEL` 为 `Xenova/multilingual-e5-small`。

## 目录结构

```
app/
  page.tsx            # 入口（动态加载客户端主界面）
  api/chat/route.ts   # DeepSeek 代理（SSE 流式）
components/
  RagApp.tsx          # 主界面（三栏布局）
  DocList.tsx         # 文档列表 + 上传
  PdfViewer.tsx       # PDF 预览（pdf.js 画布渲染）
  ChatPanel.tsx       # 聊天 + 引用跳转
lib/
  pdf/extract.ts      # 文本提取 + 分块
  embedding.ts        # 本地 embedding 模型加载与向量化
  rag/search.ts       # 余弦检索
  store/db.ts         # IndexedDB 封装
  chat.ts             # /api/chat 流式客户端
  types.ts            # 共享类型
```
