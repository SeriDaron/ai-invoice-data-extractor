"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { ExtractError, ExtractResponse, ExtractedInvoice } from "@/lib/schema";

const SAMPLES = [
  "invoice-northwind-design.pdf",
  "rechnung-alpenfrost.pdf",
  "invoice-brightline-supplies.pdf",
];

function money(value: number | null, currency: string | null): string {
  if (value === null) return "-";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency ?? "USD" }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: ExtractedInvoice[]): string {
  const header = [
    "file", "vendor", "invoice_number", "invoice_date", "due_date",
    "currency", "subtotal", "tax", "total", "status", "warnings",
  ];
  const lines = rows.map((r) =>
    [
      r.file_name, r.vendor, r.invoice_number, r.invoice_date, r.due_date,
      r.currency, r.subtotal, r.tax, r.total,
      r.status === "ok" ? "OK" : "Needs review", r.warnings.join(" | "),
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExtractApp() {
  const [rows, setRows] = useState<ExtractedInvoice[]>([]);
  const [errors, setErrors] = useState<ExtractError[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [llmEnabled, setLlmEnabled] = useState<boolean | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setLlmEnabled(Boolean(d.llm)))
      .catch(() => setLlmEnabled(false));
  }, []);

  async function process(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed.");
      const result = data as ExtractResponse;
      setRows((prev) => [...prev, ...result.results]);
      setErrors((prev) => [...prev, ...result.errors]);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Extraction failed.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function loadSamples() {
    setBusy(true);
    try {
      const files = await Promise.all(
        SAMPLES.map(async (name) => {
          const blob = await (await fetch(`/samples/${name}`)).blob();
          return new File([blob], name, { type: "application/pdf" });
        })
      );
      await process(files);
    } catch {
      setMessage("Could not load the sample invoices.");
      setBusy(false);
    }
  }

  async function downloadExcel() {
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoices: rows }),
      });
      if (!res.ok) throw new Error();
      download(await res.blob(), "invoices.xlsx");
    } catch {
      setMessage("Could not create the Excel file.");
    }
  }

  const reviewCount = rows.filter((r) => r.status === "review").length;
  const totals = rows.reduce<Record<string, number>>((acc, r) => {
    if (r.total !== null) acc[r.currency ?? "?"] = (acc[r.currency ?? "?"] ?? 0) + r.total;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">DocExtract</h1>
              <p className="text-xs text-slate-400">Invoices in, spreadsheet out</p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-400">
            {llmEnabled === null ? (
              "Checking mode..."
            ) : llmEnabled ? (
              <>
                <span className="font-semibold text-emerald-400">Claude mode:</span> AI extraction with structured
                output
              </>
            ) : (
              <>
                <span className="font-semibold text-amber-400">Demo mode:</span> rule-based extraction (no API key,
                no AI)
              </>
            )}
          </div>
        </header>

        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".pdf,.txt"
          className="hidden"
          onChange={(e) => process(Array.from(e.target.files ?? []))}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            process(Array.from(e.dataTransfer.files));
          }}
          className={`rounded-xl border border-dashed p-8 text-center transition ${
            dragging ? "border-emerald-400 bg-emerald-950/20" : "border-slate-700 bg-[#0E1424]"
          }`}
        >
          <UploadCloud className="mx-auto h-8 w-8 text-slate-500" />
          <p className="mt-3 text-sm text-slate-300">Drop invoices here (PDF or TXT, up to 10 files, 3 MB each)</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition hover:bg-emerald-500 disabled:opacity-60"
            >
              Choose files
            </button>
            <button
              onClick={loadSamples}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm transition hover:bg-slate-700 disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" /> Try 3 sample invoices
            </button>
          </div>
          {busy && (
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Extracting data...
            </p>
          )}
        </div>

        {message && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" /> {message}
          </div>
        )}
        {errors.map((e, i) => (
          <div
            key={i}
            className="mt-2 flex items-center gap-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0" /> {e.file_name}: {e.error}
          </div>
        ))}

        {rows.length > 0 && (
          <section className="mt-8">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-[#0E1424] p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">Documents</p>
                <p className="mt-1 text-2xl font-semibold">{rows.length}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0E1424] p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">Needs review</p>
                <p className={`mt-1 text-2xl font-semibold ${reviewCount ? "text-amber-400" : "text-emerald-400"}`}>
                  {reviewCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0E1424] p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">Total value</p>
                <p className="mt-1 text-sm font-semibold leading-relaxed">
                  {Object.entries(totals).map(([cur, v]) => (
                    <span key={cur} className="mr-3 inline-block">
                      {money(v, cur === "?" ? null : cur)}
                    </span>
                  ))}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <button
                  onClick={downloadExcel}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
                >
                  <Download className="h-4 w-4" /> Download Excel
                </button>
                <button
                  onClick={() => download(new Blob([toCsv(rows)], { type: "text/csv" }), "invoices.csv")}
                  className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
                >
                  <Download className="h-4 w-4" /> CSV
                </button>
              </div>
              <button
                onClick={() => {
                  setRows([]);
                  setErrors([]);
                  setExpanded(null);
                }}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" /> Clear
              </button>
            </div>

            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[#111827] text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="w-8 p-3" />
                    <th className="p-3">Vendor</th>
                    <th className="p-3">Invoice #</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Due</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        className="cursor-pointer border-t border-slate-800 hover:bg-slate-900/50"
                      >
                        <td className="p-3 text-slate-500">
                          {expanded === r.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{r.vendor ?? "-"}</div>
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <FileText className="h-3 w-3" /> {r.file_name}
                          </div>
                        </td>
                        <td className="p-3">{r.invoice_number ?? "-"}</td>
                        <td className="p-3">{r.invoice_date ?? "-"}</td>
                        <td className="p-3">{r.due_date ?? "-"}</td>
                        <td className="p-3 text-right font-medium">{money(r.total, r.currency)}</td>
                        <td className="p-3">
                          {r.status === "ok" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950 px-2.5 py-1 text-xs text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" /> OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-950 px-2.5 py-1 text-xs text-amber-300">
                              <AlertTriangle className="h-3 w-3" /> Needs review
                            </span>
                          )}
                        </td>
                      </tr>
                      {expanded === r.id && (
                        <tr className="border-t border-slate-800 bg-[#0E1424]">
                          <td />
                          <td colSpan={6} className="p-4">
                            {r.warnings.length > 0 && (
                              <ul className="mb-3 space-y-1">
                                {r.warnings.map((w, i) => (
                                  <li key={i} className="flex gap-2 text-xs text-amber-300">
                                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <table className="w-full text-xs">
                              <thead className="text-slate-500">
                                <tr>
                                  <th className="pb-1 text-left font-medium">Description</th>
                                  <th className="pb-1 text-right font-medium">Qty</th>
                                  <th className="pb-1 text-right font-medium">Unit price</th>
                                  <th className="pb-1 text-right font-medium">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.line_items.map((li, i) => (
                                  <tr key={i} className="border-t border-slate-800">
                                    <td className="py-1.5">{li.description}</td>
                                    <td className="py-1.5 text-right">{li.quantity ?? "-"}</td>
                                    <td className="py-1.5 text-right">{money(li.unit_price, r.currency)}</td>
                                    <td className="py-1.5 text-right">{money(li.amount, r.currency)}</td>
                                  </tr>
                                ))}
                                <tr className="border-t border-slate-700 text-slate-300">
                                  <td className="py-1.5" colSpan={3}>
                                    Subtotal {money(r.subtotal, r.currency)} · Tax {money(r.tax, r.currency)}
                                  </td>
                                  <td className="py-1.5 text-right font-semibold">{money(r.total, r.currency)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
