import { NextRequest } from "next/server";

// Vercel Hobby 计划最大 60s（Pro 可到 300s）。流式回答较长时避免超时。
export const maxDuration = 60;

const SYSTEM_PROMPT = `你是一个基于文档进行问答的助手。请严格遵守以下规则：
1. 只能根据用户提供的【文档片段】回答问题，绝对不要使用片段之外的知识或你自身的记忆。
2. 回答语言与用户问题保持一致（中文问题用中文回答）。
3. 每个结论后面都要标注引用来源，格式为 [n]，其中 n 是片段编号（例如 [1]、[3]）。
4. 如果片段中没有足够信息回答，请明确说"根据提供的文档无法回答"，不要编造。
5. 回答要具体、有据可依，尽量引用原文。`;

type ChatChunk = { text: string; page?: number };

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "服务端未配置 DEEPSEEK_API_KEY，请在 .env.local 中填写" },
      { status: 500 },
    );
  }

  let body: { question?: string; chunks?: ChatChunk[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { question, chunks } = body;
  if (!question || typeof question !== "string" || !question.trim()) {
    return Response.json({ error: "缺少 question" }, { status: 400 });
  }
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return Response.json({ error: "缺少 chunks（检索到的文档片段）" }, { status: 400 });
  }

  const context = chunks
    .map((c, i) => `[${i + 1}]${c.page ? `（第${c.page}页）` : ""} ${c.text}`)
    .join("\n\n");

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `【文档片段】\n${context}\n\n【问题】\n${question}` },
  ];

  const upstream = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      stream: true,
      temperature: 0.3,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    return Response.json(
      { error: `DeepSeek 请求失败（${upstream.status}）：${errText.slice(0, 500)}` },
      { status: 502 },
    );
  }

  // 直接把 DeepSeek 的 SSE 流透传给前端
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
