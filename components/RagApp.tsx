"use client";

import { useCallback, useEffect, useState } from "react";
import type { DocMeta, Chunk, ChatMessage, Source } from "@/lib/types";
import {
  listDocs,
  saveDoc,
  deleteDoc,
  getChunks,
  listMessages,
  addMessage,
} from "@/lib/store/db";
import { extractPdfText, chunkPages } from "@/lib/pdf/extract";
import { loadEmbeddingModel, embed } from "@/lib/embedding";
import { searchChunks } from "@/lib/rag/search";
import { streamChat } from "@/lib/chat";
import DocList, { type IndexingState } from "@/components/DocList";
import PdfViewer from "@/components/PdfViewer";
import ChatPanel from "@/components/ChatPanel";

export default function RagApp() {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<{ content: string; sources: Source[] } | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);
  const [indexing, setIndexing] = useState<IndexingState | null>(null);

  const activeDoc = docs.find((d) => d.id === activeDocId) ?? null;

  // 初始化：列出已保存文档，默认选中第一个
  useEffect(() => {
    (async () => {
      const list = await listDocs();
      setDocs(list);
      if (list.length > 0) setActiveDocId(list[0].id);
    })();
  }, []);

  // 切换文档：重置页码并加载对应聊天记录
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeDocId) {
        setMessages([]);
        return;
      }
      setPage(1);
      const msgs = await listMessages(activeDocId);
      if (!cancelled) setMessages(msgs);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeDocId]);

  const handleUpload = useCallback(async (file: File) => {
    const docId = crypto.randomUUID();
    setIndexing({ name: file.name, phase: "读取文件…" });

    try {
      const buf = await file.arrayBuffer();

      setIndexing({ name: file.name, phase: "提取文本…" });
      const { numPages, pages } = await extractPdfText(buf);
      const rawChunks = chunkPages(pages, docId);

      if (rawChunks.length === 0) {
        alert("未能从该 PDF 提取到文字（可能是扫描版）。目前仅支持文字版 PDF。");
        return;
      }

      // 首次会下载 embedding 模型（约数百 MB），展示进度
      await loadEmbeddingModel((p) => {
        if (p.status === "progress" || p.status === "progress_total") {
          setIndexing({
            name: file.name,
            phase: `下载 embedding 模型 ${Math.round(p.progress ?? 0)}%`,
          });
        } else if (p.status === "ready") {
          setIndexing({ name: file.name, phase: "模型就绪，向量化…" });
        }
      });

      // 分批向量化，避免单次过大的内存峰值
      const chunks: Chunk[] = [];
      const BATCH = 32;
      for (let i = 0; i < rawChunks.length; i += BATCH) {
        const batch = rawChunks.slice(i, i + BATCH);
        const embs = await embed(batch.map((c) => c.text));
        batch.forEach((c, j) => chunks.push({ ...c, embedding: embs[j] }));
        setIndexing({
          name: file.name,
          phase: `向量化 ${Math.min(i + BATCH, rawChunks.length)}/${rawChunks.length}`,
        });
      }

      const meta: DocMeta = {
        id: docId,
        name: file.name,
        size: file.size,
        numPages,
        chunkCount: chunks.length,
        uploadedAt: Date.now(),
      };

      await saveDoc(meta, file, chunks);

      setDocs((prev) => [meta, ...prev]);
      setActiveDocId(docId);
    } catch (e) {
      console.error(e);
      alert(`索引失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIndexing(null);
    }
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteDoc(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (activeDocId === id) {
        setActiveDocId(null);
        setMessages([]);
      }
    },
    [activeDocId],
  );

  const handleSend = useCallback(
    async (question: string) => {
      if (!activeDocId) return;
      const docId = activeDocId;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        docId,
        role: "user",
        content: question,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      await addMessage(userMsg);

      setDraft({ content: "正在检索相关片段…", sources: [] });
      setIsAnswering(true);

      try {
        const chunks = await getChunks(docId);
        if (chunks.length === 0) throw new Error("该文档没有可检索的索引");

        const [qEmb] = await embed([question]);
        const results = searchChunks(chunks, qEmb, 6);

        const sources: Source[] = results.map((r) => ({
          chunkId: r.chunkId,
          page: r.page,
          snippet: r.text.slice(0, 80),
        }));

        let full = "";
        setDraft({ content: "", sources });
        const chatInput = results.map((r) => ({ text: r.text, page: r.page }));
        for await (const delta of streamChat(question, chatInput)) {
          full += delta;
          setDraft({ content: full, sources });
        }

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          docId,
          role: "assistant",
          content: full,
          sources,
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        await addMessage(assistantMsg);
      } catch (e) {
        const errMsg: ChatMessage = {
          id: crypto.randomUUID(),
          docId,
          role: "assistant",
          content: `出错了：${e instanceof Error ? e.message : String(e)}`,
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, errMsg]);
        await addMessage(errMsg);
      } finally {
        setDraft(null);
        setIsAnswering(false);
      }
    },
    [activeDocId],
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* 左：文档列表 */}
      <aside className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800">
        <DocList
          docs={docs}
          activeDocId={activeDocId}
          indexing={indexing}
          onSelect={setActiveDocId}
          onUpload={handleUpload}
          onDelete={handleDelete}
        />
      </aside>

      {/* 中：PDF 预览 */}
      <main className="min-w-0 flex-1">
        <PdfViewer
          docId={activeDocId}
          numPages={activeDoc?.numPages ?? 0}
          page={page}
          onPageChange={setPage}
        />
      </main>

      {/* 右：聊天 */}
      <aside className="w-96 shrink-0 border-l border-zinc-200 dark:border-zinc-800">
        <ChatPanel
          messages={messages}
          draft={draft}
          isAnswering={isAnswering}
          disabled={!activeDocId || !!indexing}
          onSend={handleSend}
          onJumpToPage={setPage}
        />
      </aside>
    </div>
  );
}
