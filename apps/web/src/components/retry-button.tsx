"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { Spinner } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Re-run the parser on a file already stored on the server.
 *
 * Implemented as a real POST + refresh rather than a client-side poll: the parse
 * is synchronous server-side, so the request either returns a result or an
 * error, and `router.refresh()` re-renders the server component with whatever
 * landed in Postgres.
 */
export function RetryButton({
  statementId,
  variant = "button",
}: {
  statementId: string;
  variant?: "button" | "link";
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    setState("working");
    setMessage(null);
    try {
      const response = await fetch(`/api/statements/${statementId}/retry`, {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState("error");
        setMessage(body.error ?? `Retry failed (${response.status}).`);
        return;
      }
      // A retry that returns status:error is a legitimate outcome — the parser
      // ran and still could not do it. Show that rather than hiding it.
      if (body.status === "error") {
        setState("error");
        setMessage(body.error ?? "The parser still could not read this file.");
        router.refresh();
        return;
      }
      setState("idle");
      router.refresh();
    } catch {
      setState("error");
      setMessage("Network error while retrying.");
    }
  }

  if (variant === "link") {
    return (
      <button
        type="button"
        onClick={() => void retry()}
        disabled={state === "working"}
        className="inline-flex items-center gap-1 text-sm text-accent-400 underline decoration-accent-500/40 underline-offset-2 hover:decoration-accent-400 disabled:opacity-60"
      >
        {state === "working" ? "retrying…" : "retry the parse"}
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => void retry()}
        disabled={state === "working"}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
          "border-ink-600 bg-ink-800 text-fg hover:border-ink-500",
          state === "working" && "opacity-60",
        )}
      >
        {state === "working" ? (
          <Spinner className="size-3.5" label="Retrying parse" />
        ) : (
          <RefreshCw className="size-3.5" aria-hidden="true" />
        )}
        {state === "working" ? "Re-parsing…" : "Retry parse"}
      </button>
      {message ? (
        <p className={cn("text-xs", state === "error" ? "text-broken-400" : "text-fg-muted")}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
