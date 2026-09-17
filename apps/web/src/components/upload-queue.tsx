"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Lock, Upload, X } from "lucide-react";

import { Spinner } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { phaseLabel, type UploadItem } from "@/lib/use-uploader";
import { MAX_BATCH_FILES, MAX_UPLOAD_BYTES } from "@/lib/upload";

export function UploadDropzone({
  onFiles,
  busy,
  compact = false,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
  compact?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const accept = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const files = Array.from(list);
      const problems: string[] = [];
      const kept = files.filter((file) => {
        if (!/\.pdf$/i.test(file.name)) {
          problems.push(`${file.name} — not a PDF`);
          return false;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          problems.push(`${file.name} — over ${formatBytes(MAX_UPLOAD_BYTES)}`);
          return false;
        }
        return true;
      });
      setRejected(problems);
      if (kept.length > MAX_BATCH_FILES) {
        setRejected([
          ...problems,
          `Only the first ${MAX_BATCH_FILES} files in a batch are accepted.`,
        ]);
      }
      if (kept.length) onFiles(kept.slice(0, MAX_BATCH_FILES));
    },
    [onFiles],
  );

  // Reset the input value so selecting the same file twice re-fires onChange.
  const openPicker = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.click();
    }
  };

  return (
    <div>
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (!busy) accept(e.dataTransfer.files);
        }}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        role="button"
        tabIndex={0}
        aria-disabled={busy}
        aria-label="Upload bank statement PDFs"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed text-center transition-colors",
          compact ? "px-6 py-8" : "px-6 py-14",
          dragging
            ? "border-accent-500 bg-accent-500/10"
            : "border-ink-600 hover:border-ink-500 hover:bg-ink-900/60",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          onChange={(e) => accept(e.target.files)}
          disabled={busy}
        />
        <span className="mb-3 flex size-11 items-center justify-center rounded-full border border-ink-600 bg-ink-800 text-fg-muted">
          {busy ? <Spinner className="size-4 text-accent-400" label="Working" /> : <Upload className="size-5" aria-hidden="true" />}
        </span>
        <p className="text-sm font-medium text-fg">
          {busy ? "Working through your files…" : "Drop statements here, or click to browse"}
        </p>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-fg-muted">
          Up to {MAX_BATCH_FILES} PDFs at once, {formatBytes(MAX_UPLOAD_BYTES)} each.
          Text-based PDFs only — scanned images need OCR first.
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-fg-subtle">
          <Lock className="size-3" aria-hidden="true" />
          Parsed by your own worker; files are not sent to a third party
        </p>
      </div>

      {rejected.length > 0 ? (
        <ul className="mt-3 space-y-1" role="alert">
          {rejected.map((message) => (
            <li key={message} className="text-xs text-warn-400">
              {message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function UploadQueue({
  items,
  onRemove,
}: {
  items: UploadItem[];
  onRemove: (localId: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.localId} className="panel p-3.5">
          <div className="flex items-center gap-3">
            <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm text-fg" title={item.file.name}>
                  {item.file.name}
                </p>
                <span className="shrink-0 text-xs text-fg-subtle">
                  {formatBytes(item.file.size)}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-2">
                <span
                  className={cn(
                    "text-xs",
                    item.phase === "error"
                      ? "text-broken-400"
                      : item.phase === "done"
                        ? "text-proof-400"
                        : "text-fg-muted",
                  )}
                >
                  {phaseLabel(item.phase)}
                </span>
                {item.phase === "parsing" ? (
                  <span className="text-xs text-fg-subtle">
                    extracting rows, then reconciling against the printed balances
                  </span>
                ) : null}
              </div>

              {/* Indeterminate while parsing: the worker reports no milestones,
                  so a moving bar here would be fabricated. */}
              <div
                className="mt-2 h-1 overflow-hidden rounded-full bg-ink-700"
                role="progressbar"
                aria-valuenow={item.phase === "parsing" ? undefined : item.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Upload progress for ${item.file.name}`}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-300",
                    item.phase === "error"
                      ? "bg-broken-500"
                      : item.phase === "done"
                        ? "bg-proof-500"
                        : "bg-accent-500",
                    item.phase === "parsing" && "skeleton",
                  )}
                  style={{
                    width: `${item.phase === "parsing" ? 100 : item.progress}%`,
                  }}
                />
              </div>

              {item.error ? (
                <p className="mt-2 text-xs leading-relaxed text-broken-400">{item.error}</p>
              ) : null}
            </div>

            {item.phase === "done" && item.statementId ? (
              <a
                href={`/statements/${item.statementId}`}
                className="shrink-0 rounded-lg border border-ink-600 px-3 py-1.5 text-xs text-fg hover:border-ink-500 hover:bg-ink-800"
              >
                Review
              </a>
            ) : null}

            {item.phase === "error" || item.phase === "queued" ? (
              <button
                type="button"
                onClick={() => onRemove(item.localId)}
                className="shrink-0 rounded-md p-1.5 text-fg-subtle hover:bg-ink-800 hover:text-fg"
                aria-label={`Remove ${item.file.name}`}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Ticking elapsed-time readout; honest about how long the parse has taken. */
export function ElapsedTimer({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (since === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [since]);

  if (since === null) return null;
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  return <span className="tabular text-xs text-fg-subtle">{seconds}s</span>;
}
