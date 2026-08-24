import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { DocMeta, Chunk, ChatMessage } from "@/lib/types";

interface RAGDB extends DBSchema {
  docs: { key: string; value: DocMeta };
  chunks: {
    key: string;
    value: Chunk;
    indexes: { "by-doc": string };
  };
  blobs: { key: string; value: { docId: string; blob: Blob } };
  messages: {
    key: string;
    value: ChatMessage;
    indexes: { "by-doc": string };
  };
}

const DB_NAME = "pdf-rag-reader";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<RAGDB>> | null = null;

function getDB(): Promise<IDBPDatabase<RAGDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RAGDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("docs", { keyPath: "id" });
        const chunkStore = db.createObjectStore("chunks", { keyPath: "id" });
        chunkStore.createIndex("by-doc", "docId");
        db.createObjectStore("blobs", { keyPath: "docId" });
        const msgStore = db.createObjectStore("messages", { keyPath: "id" });
        msgStore.createIndex("by-doc", "docId");
      },
    });
  }
  return dbPromise;
}

export async function listDocs(): Promise<DocMeta[]> {
  const db = await getDB();
  const docs = await db.getAll("docs");
  return docs.sort((a, b) => b.uploadedAt - a.uploadedAt);
}

export async function getDoc(id: string): Promise<DocMeta | undefined> {
  const db = await getDB();
  return db.get("docs", id);
}

/** 保存文档元信息 + 原始 PDF + 全部分块（含向量），单个事务保证一致性 */
export async function saveDoc(
  meta: DocMeta,
  blob: Blob,
  chunks: Chunk[],
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["docs", "blobs", "chunks"], "readwrite");
  await tx.objectStore("docs").put(meta);
  await tx.objectStore("blobs").put({ docId: meta.id, blob });
  const chunkStore = tx.objectStore("chunks");
  for (const c of chunks) {
    await chunkStore.put(c);
  }
  await tx.done;
}

export async function deleteDoc(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["docs", "blobs", "chunks", "messages"], "readwrite");

  await tx.objectStore("docs").delete(id);
  await tx.objectStore("blobs").delete(id);

  const chunkStore = tx.objectStore("chunks");
  const chunkKeys = await chunkStore.index("by-doc").getAllKeys(id);
  for (const key of chunkKeys) {
    await chunkStore.delete(key);
  }

  const msgStore = tx.objectStore("messages");
  const msgKeys = await msgStore.index("by-doc").getAllKeys(id);
  for (const key of msgKeys) {
    await msgStore.delete(key);
  }

  await tx.done;
}

export async function getBlob(docId: string): Promise<Blob | undefined> {
  const db = await getDB();
  const record = await db.get("blobs", docId);
  return record?.blob;
}

export async function getChunks(docId: string): Promise<Chunk[]> {
  const db = await getDB();
  return db.getAllFromIndex("chunks", "by-doc", docId);
}

export async function listMessages(docId: string): Promise<ChatMessage[]> {
  const db = await getDB();
  const msgs = await db.getAllFromIndex("messages", "by-doc", docId);
  return msgs.sort((a, b) => a.createdAt - b.createdAt);
}

export async function addMessage(msg: ChatMessage): Promise<void> {
  const db = await getDB();
  await db.put("messages", msg);
}
