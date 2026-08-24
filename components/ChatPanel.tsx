"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Source } from "@/lib/types";

interface ChatPanelProps {
  messages: ChatMessage[];
  draft: { content: string; sources: Source[] } | null;
  isAnswering: boolean;
  disabled: boolean;
  onSend: (question: string) => void;
  onJumpToPage: (page: number) => void;
}

function renderWithCitations(
  content: string,
  sources: Source[] | undefined,
  onJump: (page: number) => void,
) {
  if (!sources || sources.length === 0) {
    return <span className="whitespace-pre-wrap">{content}</span>;
  }
  const parts = content.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    if (m) {
      const idx = parseInt(m[1], 10) - 1;
      const src = sources[idx];
      if (src) {
        return (
          <button
            key={i}
            onClick={() => onJump(src.page)}
            title={`第 ${src.page} 页：${src.snippet}`}
            className="mx-0.5 inline-block rounded bg-blue-100 px-1 align-baseline text-xs font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300"
          >
            [{m[1]}]
          </button>
        );
      }
    }
    return (
      <span key={i} className="whitespace-pre-wrap">
        {part}
      </span>
    );
  });
}

export default function ChatPanel({
  messages,
  draft,
  isAnswering,
  disabled,
  onSend,
  onJumpToPage,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, draft]);

  const submit = () => {
    const q = input.trim();
    if (!q || disabled || isAnswering) return;
    onSend(q);
    setInput("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-3 py-2 text-sm font-medium dark:border-zinc-800">
        问答
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        {messages.length === 0 && !draft && (
          <div className="mt-8 text-center text-xs text-zinc-400">
            选中一个文档后，即可针对其内容提问。
            <br />
            例如：「这篇文档哪里体现了作者的思乡之情？」
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
              }`}
            >
              {renderWithCitations(msg.content, msg.sources, onJumpToPage)}
            </div>
          </div>
        ))}

        {draft && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800 dark:text-zinc-100">
              {renderWithCitations(draft.content, draft.sources, onJumpToPage)}
              {isAnswering && (
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-zinc-400 align-middle" />
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={
            disabled ? "请先选择或上传文档" : "针对文档提问…（Enter 发送，Shift+Enter 换行）"
          }
          disabled={disabled || isAnswering}
          className="w-full resize-none rounded-lg border border-zinc-300 bg-white p-2 text-sm outline-none focus:border-blue-500 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          onClick={submit}
          disabled={disabled || isAnswering || !input.trim()}
          className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isAnswering ? "回答中…" : "发送"}
        </button>
      </div>
    </div>
  );
}
