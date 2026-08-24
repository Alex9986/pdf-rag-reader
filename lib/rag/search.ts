import type { Chunk, SearchResult } from "@/lib/types";

/** 向量已 L2 归一化，余弦相似度等价于点积 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * 在给定文档的全部块中做暴力余弦检索，返回 top-K。
 * 单文档几百块规模下足够快，无需向量数据库。
 */
export function searchChunks(
  chunks: Chunk[],
  queryEmbedding: Float32Array,
  topK = 6,
): SearchResult[] {
  const scored: SearchResult[] = chunks.map((c) => ({
    chunkId: c.id,
    docId: c.docId,
    page: c.page,
    text: c.text,
    score: cosineSimilarity(c.embedding, queryEmbedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
