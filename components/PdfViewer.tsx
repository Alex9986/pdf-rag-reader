"use client";

import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import { getBlob } from "@/lib/store/db";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface PdfViewerProps {
  docId: string | null;
  numPages: number;
  page: number;
  onPageChange: (page: number) => void;
}

interface LoadedPdf {
  docId: string;
  pdf: PDFDocumentProxy;
}

export default function PdfViewer({
  docId,
  numPages,
  page,
  onPageChange,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<LoadedPdf | null>(null);
  const [scale, setScale] = useState(1.2);
  const [status, setStatus] = useState("");

  // 切换文档时加载 PDF
  useEffect(() => {
    if (!docId) return;
    let cancelled = false;

    (async () => {
      try {
        setStatus("加载 PDF…");
        const blob = await getBlob(docId);
        if (!blob || cancelled) return;
        const buf = await blob.arrayBuffer();
        const proxy = await getDocument({ data: buf }).promise;
        if (cancelled) {
          proxy.loadingTask.destroy();
          return;
        }
        setLoaded((prev) => {
          // 销毁上一个文档的 PDF，释放内存
          if (prev && prev.docId !== docId) prev.pdf.loadingTask.destroy();
          return { docId, pdf: proxy };
        });
        setStatus("");
      } catch (e) {
        console.error(e);
        setStatus("PDF 加载失败");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docId]);

  // 渲染当前页
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!loaded || loaded.docId !== docId || !canvas) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;

    (async () => {
      try {
        const pdfPage = await loaded.pdf.getPage(page);
        const viewport = pdfPage.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        renderTask = pdfPage.render({
          canvas,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        await renderTask.promise;
      } catch (e) {
        if (!cancelled) console.error(e);
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [loaded, docId, page, scale]);

  const goTo = (p: number) => {
    const clamped = Math.min(Math.max(1, p), numPages || 1);
    onPageChange(clamped);
  };

  return (
    <div className="flex h-full flex-col">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
        <button
          onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
          className="rounded border px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="缩小"
        >
          −
        </button>
        <span className="w-12 text-center text-xs text-zinc-500">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale((s) => Math.min(3, s + 0.2))}
          className="rounded border px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="放大"
        >
          +
        </button>

        <div className="mx-auto flex items-center gap-2">
          <button
            onClick={() => goTo(page - 1)}
            disabled={page <= 1}
            className="rounded border px-2 py-1 disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ‹
          </button>
          <span className="text-xs text-zinc-600 dark:text-zinc-300">
            {page} / {numPages || "—"}
          </span>
          <button
            onClick={() => goTo(page + 1)}
            disabled={page >= numPages}
            className="rounded border px-2 py-1 disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ›
          </button>
        </div>
      </div>

      {/* 画布 */}
      <div className="flex-1 overflow-auto bg-zinc-100 p-4 dark:bg-zinc-900">
        {!docId ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            上传并选择一个文档后在此预览
          </div>
        ) : status ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            {status}
          </div>
        ) : (
          <div className="flex justify-center">
            <canvas
              ref={canvasRef}
              className="shadow-lg"
              style={{ background: "#fff" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
