"use client";

import { useRef } from "react";
import type { DocMeta } from "@/lib/types";

export interface IndexingState {
  name: string;
  phase: string;
}

interface DocListProps {
  docs: DocMeta[];
  activeDocId: string | null;
  indexing: IndexingState | null;
  onSelect: (id: string) => void;
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
}

export default function DocList({
  docs,
  activeDocId,
  indexing,
  onSelect,
  onUpload,
  onDelete,
}: DocListProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={!!indexing}
          className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {indexing ? "处理中…" : "上传 PDF"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex-1 overflow-auto">
        {indexing && (
          <div className="m-3 rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-800">
            <div className="truncate font-medium">{indexing.name}</div>
            <div className="mt-1 text-zinc-500">{indexing.phase}</div>
          </div>
        )}

        {docs.length === 0 && !indexing ? (
          <div className="p-4 text-center text-xs text-zinc-400">
            还没有文档，上传一个 PDF 开始
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {docs.map((doc) => (
              <li key={doc.id}>
                <div
                  className={`group flex cursor-pointer items-start gap-2 px-3 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${
                    activeDocId === doc.id
                      ? "bg-blue-50 dark:bg-zinc-800"
                      : ""
                  }`}
                  onClick={() => onSelect(doc.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{doc.name}</div>
                    <div className="mt-0.5 text-xs text-zinc-400">
                      {doc.numPages} 页 · {doc.chunkCount} 片段
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`删除「${doc.name}」及其索引和聊天记录？`)) {
                        onDelete(doc.id);
                      }
                    }}
                    className="rounded px-1.5 text-xs text-zinc-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                    aria-label="删除"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
