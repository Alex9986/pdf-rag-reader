// 文档元信息（不含 PDF 文件本身）
export interface DocMeta {
  id: string;
  name: string;
  size: number;
  numPages: number;
  chunkCount: number;
  uploadedAt: number;
}

// 文本分块（embedding 单独存，检索时整体读入内存）
export interface Chunk {
  id: string;
  docId: string;
  page: number; // 1-based
  text: string;
  embedding: Float32Array;
}

// 检索命中的块（不含 embedding，避免序列化开销）
export interface SearchResult {
  chunkId: string;
  docId: string;
  page: number;
  text: string;
  score: number;
}

// 答案引用来源
export interface Source {
  chunkId: string;
  page: number;
  snippet: string;
}

export interface ChatMessage {
  id: string;
  docId: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  createdAt: number;
}
