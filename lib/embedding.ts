import {
  pipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";
import type { ProgressCallback } from "@huggingface/transformers";

// 中英混合文档默认用 bge-m3（质量高，q8 量化约 600MB 首次下载）。
// 若想更快首载，可换成约 120MB 的 "Xenova/multilingual-e5-small"（中英质量略降）。
export const EMBEDDING_MODEL = "Xenova/bge-m3";

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

export type ModelProgress = {
  status: string;
  file?: string;
  progress?: number; // 0-100
  loaded?: number;
  total?: number;
};

/** 懒加载 embedding 模型（只加载一次，之后复用缓存） */
export function loadEmbeddingModel(
  onProgress?: (p: ModelProgress) => void,
): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", EMBEDDING_MODEL, {
      dtype: "q8",
      progress_callback: ((info) => {
        onProgress?.({
          status: info.status,
          file: (info as { file?: string }).file,
          progress: (info as { progress?: number }).progress,
          loaded: (info as { loaded?: number }).loaded,
          total: (info as { total?: number }).total,
        });
      }) as ProgressCallback,
    });
  }
  return extractorPromise;
}

export function isModelLoaded(): boolean {
  return extractorPromise !== null;
}

/**
 * 批量向量化文本。返回与输入一一对应的 Float32Array 向量。
 * bge-m3 用 CLS 池化 + L2 归一化，便于余弦相似度计算。
 */
export async function embed(texts: string[]): Promise<Float32Array[]> {
  const extractor = await loadEmbeddingModel();
  const output = await extractor(texts, { pooling: "cls", normalize: true });

  const dims = output.dims as number[];
  const dim = dims[dims.length - 1];
  const n = texts.length;
  const data = output.data as Float32Array;

  const result: Float32Array[] = [];
  for (let i = 0; i < n; i++) {
    result.push(data.slice(i * dim, (i + 1) * dim));
  }
  return result;
}
