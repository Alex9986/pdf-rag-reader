export interface ChatSourceInput {
  text: string;
  page: number;
}

/**
 * 调用 /api/chat（DeepSeek 代理）并流式产出答案文本片段。
 * 服务端透传 SSE，这里负责解析。
 */
export async function* streamChat(
  question: string,
  chunks: ChatSourceInput[],
): AsyncGenerator<string, void, unknown> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, chunks }),
  });

  if (!res.ok || !res.body) {
    let message = `请求失败（${res.status}）`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const dataLine = event
        .split("\n")
        .find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (payload === "[DONE]") return;

      try {
        const json = JSON.parse(payload);
        const delta: string | undefined = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // 忽略无法解析的行
      }
    }
  }
}
