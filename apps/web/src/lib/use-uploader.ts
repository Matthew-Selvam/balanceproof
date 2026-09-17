"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BankMatch, Finding, Summary } from "@/lib/types";

export type FilePhase = "queued" | "uploading" | "parsing" | "done" | "error";

export interface UploadItem {
  /** Stable local id, independent of the server id. */
  localId: string;
  file: File;
  phase: FilePhase;
  /** 0–100, real bytes only (XHR upload progress). */
  progress: number;
  statementId?: string;
  summary?: Summary;
  bank?: BankMatch;
  findings?: Finding[];
  error?: string;
  warnings?: string[];
}

interface ServerResponse {
  id?: string;
  status?: string;
  error?: string;
  summary?: Summary;
  bank?: BankMatch;
  findings?: number;
  warnings?: string[];
}

const PHASE_LABEL: Record<FilePhase, string> = {
  queued: "Waiting",
  uploading: "Uploading",
  parsing: "Parsing & validating",
  done: "Parsed",
  error: "Failed",
};

export function phaseLabel(phase: FilePhase): string {
  return PHASE_LABEL[phase];
}

/**
 * Upload one file with real progress.
 *
 * XMLHttpRequest rather than fetch because fetch still cannot report upload
 * progress. The `parsing` phase that follows is deliberately indeterminate —
 * the server does extraction, validation and reconciliation in one call and
 * reports no intermediate milestones, so inventing a percentage there would be
 * a lie dressed up as a progress bar.
 */
function uploadOne(
  item: UploadItem,
  onUpdate: (patch: Partial<UploadItem>) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const form = new FormData();
    form.append("file", item.file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/statements");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 96);
      onUpdate({ phase: "uploading", progress: percent });
    };

    xhr.upload.onload = () => {
      // Bytes are on the wire; the server is now parsing. Cap the bar below
      // 100 so a stalled parse is visibly stalled.
      onUpdate({ phase: "parsing", progress: 97 });
    };

    xhr.onload = () => {
      let body: ServerResponse = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
        onUpdate({
          phase: "error",
          progress: 100,
          error: "The server returned a response that could not be read.",
        });
        resolve();
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && body.status === "done") {
        onUpdate({
          phase: "done",
          progress: 100,
          statementId: body.id,
          summary: body.summary,
          bank: body.bank,
          warnings: body.warnings ?? [],
        });
        resolve();
        return;
      }

      onUpdate({
        phase: "error",
        progress: 100,
        statementId: body.id,
        error:
          body.error ??
          (xhr.status === 429
            ? "Rate limit reached. Wait a moment and try again."
            : `Upload failed (${xhr.status}).`),
      });
      resolve();
    };

    xhr.onerror = () => {
      onUpdate({
        phase: "error",
        progress: 0,
        error: "Network error while uploading. Check your connection and retry.",
      });
      resolve();
    };

    xhr.ontimeout = () => {
      onUpdate({ phase: "error", progress: 0, error: "The upload timed out." });
      resolve();
    };

    xhr.send(form);
  });
}

export function useUploader() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const patch = useCallback((localId: string, next: Partial<UploadItem>) => {
    setItems((current) =>
      current.map((item) => (item.localId === localId ? { ...item, ...next } : item)),
    );
  }, []);

  const start = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const created: UploadItem[] = files.map((file, i) => ({
        localId: `${Date.now()}-${i}-${file.name}`,
        file,
        phase: "queued",
        progress: 0,
      }));
      setItems((current) => [...created, ...current]);
      setBusy(true);

      // Sequential on purpose: the worker parses synchronously and a burst of
      // large statements would trip the route's own rate limit.
      for (const item of created) {
        patch(item.localId, { phase: "uploading" });
        await uploadOne(item, (next) => {
          if (mounted.current) patch(item.localId, next);
        });
      }

      if (mounted.current) setBusy(false);
    },
    [patch],
  );

  const clear = useCallback(() => setItems([]), []);
  const remove = useCallback((localId: string) => {
    setItems((current) => current.filter((item) => item.localId !== localId));
  }, []);

  return { items, busy, start, clear, remove };
}
