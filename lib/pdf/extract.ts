import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

// pdf.js 需要单独加载 worker。这里用 bundler 的 new URL + import.meta.url 模式，
// 让 Next.js（webpack/Turbopack）把它当作静态资源处理。
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export interface RawChunk {
  id: string;
  docId: string;
  page: number; // 1-based
  text: string;
}

export interface ExtractedPdf {
  numPages: number;
  pages: string[]; // pages[i] = 第 i+1 页的纯文本
}

// 分块参数：400 字符一块，块间重叠 60 字符（避免切断语义）
const CHUNK_SIZE = 400;
const CHUNK_OVERLAP = 60;

/** 逐页提取 PDF 纯文本（客户端执行，只支持文字版 PDF） */
export async function extractPdfText(data: ArrayBuffer): Promise<ExtractedPdf> {
  const pdf = await getDocument({ data }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(text);
    page.cleanup();
  }

  await pdf.loadingTask.destroy();
  return { numPages: pdf.numPages, pages };
}

/** 将每页文本切分成带页码的分块 */
export function chunkPages(pages: string[], docId: string): RawChunk[] {
  const chunks: RawChunk[] = [];

  pages.forEach((rawText, pageIdx) => {
    const text = rawText.replace(/\s+/g, " ").trim();
    if (!text) return;

    const page = pageIdx + 1;
    // 整页不足一块时直接作为一块
    if (text.length <= CHUNK_SIZE) {
      chunks.push({ id: `${docId}:${chunks.length}`, docId, page, text });
      return;
    }

    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      chunks.push({
        id: `${docId}:${chunks.length}`,
        docId,
        page,
        text: text.slice(start, end),
      });
      if (end >= text.length) break;
      start = end - CHUNK_OVERLAP;
    }
  });

  return chunks;
}
