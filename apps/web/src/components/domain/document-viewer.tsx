"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFileUrl } from "@/lib/api-client";

type PdfJsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJsModule> | null = null;
function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export function DocumentViewer({
  documentId,
  mimeType,
  filename,
  pageCount,
  page,
  onPageChange,
}: {
  documentId: string;
  mimeType: string;
  filename: string;
  pageCount: number | null;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const isPdf = mimeType === "application/pdf";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1.1);
  const [pdfDoc, setPdfDoc] = useState<Awaited<ReturnType<PdfJsModule["getDocument"]>["promise"]> | null>(null);
  const [numPages, setNumPages] = useState(pageCount ?? 1);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const fileUrl = apiFileUrl(`/documents/${documentId}/file`);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch(fileUrl, { credentials: "include" });
      const buffer = await res.arrayBuffer();
      if (cancelled) return;

      if (isPdf) {
        const pdfjs = await loadPdfJs();
        const doc = await pdfjs.getDocument({ data: buffer }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } else {
        const blob = new Blob([buffer], { type: mimeType });
        setImageUrl(URL.createObjectURL(blob));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const safePage = Math.min(Math.max(1, page), pdfDoc.numPages);
      const pdfPage = await pdfDoc.getPage(safePage);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, page, scale]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-surface-muted px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{filename}</p>
          {isPdf && <p className="text-[11px] text-muted-foreground">Page {page} of {numPages}</p>}
        </div>
        <div className="flex items-center gap-1">
          {isPdf && (
            <>
              <Button variant="ghost" size="icon" className="size-7" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7" disabled={page >= numPages} onClick={() => onPageChange(page + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}>
            <ZoomOut className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setScale((s) => Math.min(3, s + 0.15))}>
            <ZoomIn className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-surface-muted p-4">
        {isPdf ? (
          <canvas ref={canvasRef} className="mx-auto shadow-sm" />
        ) : imageUrl ? (
          <img src={imageUrl} alt={filename} style={{ transform: `scale(${scale})`, transformOrigin: "top center" }} className="mx-auto" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading document…</div>
        )}
      </div>
    </div>
  );
}
