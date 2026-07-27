"use client";

import { useState } from "react";
import type { NormalizedContent } from "@/features/content/types";
import { ImportPanel } from "@/components/import-panel";
import { ReviewWorkspace } from "@/components/review-workspace";

export default function Page() {
  const [content, setContent] = useState<NormalizedContent | null>(null);

  const handleImport = (normalized: NormalizedContent) => {
    setContent(normalized);
  };

  const handleReset = () => {
    setContent(null);
  };

  return (
    <main className="container">
      {content ? (
        <ReviewWorkspace content={content} onReset={handleReset} />
      ) : (
        <>
          {/* The hero copy only earns its space before a file is loaded;
              the workspace shows a compact header instead. */}
          <header className="app-header">
            <h1 className="hero-title">音声を、聴くべき場所だけに。</h1>
            <p className="hero-subtitle">
              ATQA — Autonomous TTS Quality Assurance Agent
            </p>
          </header>
          <ImportPanel onImport={handleImport} />
        </>
      )}
    </main>
  );
}
