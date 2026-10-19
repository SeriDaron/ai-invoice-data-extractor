import { z } from "zod";

export const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().nullable(),
  unit_price: z.number().nullable(),
  amount: z.number().nullable(),
});

/** Fields extracted from one invoice. null means "not present in the document". */
export const InvoiceSchema = z.object({
  vendor: z.string().nullable().describe("Name of the company issuing the invoice"),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable().describe("ISO format YYYY-MM-DD"),
  due_date: z.string().nullable().describe("ISO format YYYY-MM-DD"),
  currency: z.string().nullable().describe("ISO 4217 code such as USD, EUR, GBP"),
  subtotal: z.number().nullable().describe("Amount before tax, as printed on the invoice"),
  tax: z.number().nullable().describe("Total tax / VAT amount as printed on the invoice"),
  total: z.number().nullable().describe("Total amount due, as printed on the invoice"),
  line_items: z.array(LineItemSchema),
});

export type LineItem = z.infer<typeof LineItemSchema>;
export type InvoiceData = z.infer<typeof InvoiceSchema>;

export type ExtractionMode = "claude" | "rules";

export interface ExtractedInvoice extends InvoiceData {
  id: string;
  file_name: string;
  mode: ExtractionMode;
  status: "ok" | "review";
  warnings: string[];
}

export interface ExtractError {
  file_name: string;
  error: string;
}

export interface ExtractResponse {
  mode: ExtractionMode;
  results: ExtractedInvoice[];
  errors: ExtractError[];
}

export const LIMITS = {
  maxFiles: 10,
  maxFileBytes: 3 * 1024 * 1024,
  maxTextChars: 30_000,
} as const;
