import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { extractWithClaude } from "@/lib/claudeExtract";
import { isRateLimited } from "@/lib/rateLimit";
import { extractWithRules } from "@/lib/ruleExtract";
import {
  LIMITS,
  type ExtractError,
  type ExtractResponse,
  type ExtractedInvoice,
  type ExtractionMode,
} from "@/lib/schema";
import { validateInvoice } from "@/lib/validate";

export const maxDuration = 60;

async function readText(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  if (lower.endsWith(".txt")) return file.text();
  throw new Error("Unsupported file type. Upload PDF or TXT invoices.");
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "Upload at least one invoice." }, { status: 400 });
    }
    if (files.length > LIMITS.maxFiles) {
      return NextResponse.json({ error: `Up to ${LIMITS.maxFiles} files at a time.` }, { status: 400 });
    }

    const useClaude = Boolean(process.env.ANTHROPIC_API_KEY);
    const mode: ExtractionMode = useClaude ? "claude" : "rules";

    if (useClaude) {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
      // Each document costs one model call, so count each against the limit.
      if (files.some(() => isRateLimited(ip, 30))) {
        return NextResponse.json(
          { error: "Rate limit reached. Please try again in a few minutes." },
          { status: 429 }
        );
      }
    }

    const results: ExtractedInvoice[] = [];
    const errors: ExtractError[] = [];

    for (const [index, file] of files.entries()) {
      try {
        if (file.size > LIMITS.maxFileBytes) throw new Error("File is too large (max 3 MB).");

        const text = (await readText(file)).slice(0, LIMITS.maxTextChars).trim();
        if (!text) throw new Error("No readable text found. Scanned documents need OCR first.");

        const data = useClaude ? await extractWithClaude(text) : extractWithRules(text);
        const warnings = validateInvoice(data);

        results.push({
          ...data,
          id: `${Date.now()}-${index}`,
          file_name: file.name,
          mode,
          status: warnings.length > 0 ? "review" : "ok",
          warnings,
        });
      } catch (error) {
        console.error("[extract]", file.name, error);
        let message = error instanceof Error ? error.message : "Could not process this file.";
        if (error instanceof Anthropic.APIError) {
          message = "The AI service is temporarily unavailable.";
          if (process.env.NODE_ENV !== "production") message += ` (${error.status}: ${error.message})`;
        }
        errors.push({ file_name: file.name, error: message });
      }
    }

    const body: ExtractResponse = { mode, results, errors };
    return NextResponse.json(body);
  } catch (error) {
    console.error("[extract] failed:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
