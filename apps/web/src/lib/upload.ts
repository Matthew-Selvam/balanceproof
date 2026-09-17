/**
 * Upload validation.
 *
 * The extension check the original code performed is not a security control —
 * anyone can name a file `.pdf`. Two properties actually matter here:
 *
 *  1. the bytes begin with the PDF magic number, and
 *  2. no active content is executed when the file is later parsed.
 *
 * For (2) we refuse files carrying `/JavaScript`, `/Launch`, `/EmbeddedFile` or
 * `/OpenAction` in their first bytes. pdfplumber does not execute JavaScript,
 * but statements get stored and may be handed to other tooling later, so an
 * obviously-booby-trapped PDF is rejected at the door rather than at the parser.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_BATCH_FILES = 25;
const PDF_MAGIC = "%PDF-";

/** Active-content markers that have no business in a bank statement. */
const ACTIVE_CONTENT = [
  "/JavaScript",
  "/JS",
  "/Launch",
  "/EmbeddedFile",
  "/OpenAction",
  "/AA",
] as const;

export interface UploadProblem {
  code:
    | "empty"
    | "too_large"
    | "not_pdf"
    | "active_content"
    | "encrypted"
    | "too_many_pages";
  message: string;
}

export interface UploadCheck {
  ok: boolean;
  problems: UploadProblem[];
  /** Warnings do not block the upload. */
  warnings: string[];
}

/** Cheap structural check of the PDF header, before any parser is involved. */
export function inspectPdf(buffer: Buffer): UploadCheck {
  const problems: UploadProblem[] = [];
  const warnings: string[] = [];

  if (buffer.byteLength === 0) {
    return {
      ok: false,
      problems: [{ code: "empty", message: "The file is empty." }],
      warnings,
    };
  }

  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    problems.push({
      code: "too_large",
      message: `File is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`,
    });
  }

  if (!buffer.subarray(0, 5).toString("latin1").startsWith(PDF_MAGIC)) {
    problems.push({
      code: "not_pdf",
      message: "This does not look like a PDF (missing %PDF- header).",
    });
    // Nothing else can be trusted about the bytes; stop here.
    return { ok: false, problems, warnings };
  }

  // The trailer sits at the end of the file; scan head and tail for markers.
  const head = buffer.subarray(0, 8192).toString("latin1");
  const tail = buffer.subarray(Math.max(0, buffer.byteLength - 8192)).toString("latin1");
  const haystack = head + tail;
  for (const marker of ACTIVE_CONTENT) {
    if (haystack.includes(marker)) {
      problems.push({
        code: "active_content",
        message: `The PDF contains active content (${marker}) and was rejected.`,
      });
      break;
    }
  }

  if (haystack.includes("/Encrypt")) {
    problems.push({
      code: "encrypted",
      message:
        "The PDF is password-protected or encrypted. Remove the protection and try again.",
    });
  }

  if (haystack.includes("/Type /XObject") && !haystack.includes("/Font")) {
    warnings.push(
      "This PDF may be a scan with no text layer. Text extraction may return nothing.",
    );
  }

  return { ok: problems.length === 0, problems, warnings };
}

/**
 * Validate a whole batch before processing any of it, so a user with one bad
 * file out of twelve finds out before waiting on eleven parses.
 */
export function inspectBatch(files: { name: string; size: number }[]): {
  ok: boolean;
  error?: string;
} {
  if (files.length === 0) return { ok: false, error: "Add at least one PDF." };
  if (files.length > MAX_BATCH_FILES) {
    return {
      ok: false,
      error: `Up to ${MAX_BATCH_FILES} files per batch. You selected ${files.length}.`,
    };
  }
  return { ok: true };
}
