"use client";

import dynamic from "next/dynamic";

// 主界面依赖 pdf.js / transformers.js 等浏览器专属库，
// 用 ssr:false 只在浏览器加载，避免服务端预渲染时求值 DOMMatrix 等浏览器 API。
const RagApp = dynamic(() => import("@/components/RagApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center text-sm text-zinc-500">
      加载中…
    </div>
  ),
});

export default function Page() {
  return <RagApp />;
}
