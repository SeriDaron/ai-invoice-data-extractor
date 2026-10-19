import type { InvoiceData, LineItem } from "./schema";

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const CURRENCY_SYMBOLS: Record<string, string> = { "$": "USD", "€": "EUR", "£": "GBP" };
const MONEY = String.raw`[$€£]?\s?\d[\d.,]*(?:\s?(?:EUR|USD|GBP|CHF|CAD|AUD))?`;

/** Parse "1,234.56", "1.234,56", "$2,400.00", "95,00 EUR" into a number. */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let normalized: string;

  if (lastDot >= 0 && lastComma >= 0) {
    // The separator that appears last is the decimal separator.
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  } else {
    normalized = cleaned;
  }
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Find a date in free text and return it as YYYY-MM-DD. */
export function parseDate(text: string): string | null {
  let m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (m) {
    const month = MONTHS.findIndex((name) => name.startsWith(m![2].toLowerCase().slice(0, 3)));
    if (month >= 0) return `${m[3]}-${pad(month + 1)}-${pad(Number(m[1]))}`;
  }

  m = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m) {
    const month = MONTHS.findIndex((name) => name.startsWith(m![1].toLowerCase().slice(0, 3)));
    if (month >= 0) return `${m[3]}-${pad(month + 1)}-${pad(Number(m[2]))}`;
  }

  // Day-first numeric dates (DD/MM/YYYY or DD.MM.YYYY)
  m = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;

  return null;
}

function detectCurrency(text: string): string | null {
  const code = text.match(/\b(USD|EUR|GBP|CHF|CAD|AUD)\b/);
  if (code) return code[1];
  const symbol = text.match(/[$€£]/);
  return symbol ? CURRENCY_SYMBOLS[symbol[0]] : null;
}

function lastAmount(line: string): number | null {
  const match = line.match(new RegExp(`(${MONEY})\\s*$`));
  return match ? parseNumber(match[1]) : null;
}

/**
 * Demo-mode extractor: plain pattern matching, no AI.
 * It handles common invoice layouts; the Claude mode handles arbitrary ones.
 */
export function extractWithRules(text: string): InvoiceData {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const vendor = lines.find((l) => !/invoice|rechnung|receipt/i.test(l)) ?? null;

  let invoiceNumber: string | null = null;
  let invoiceDate: string | null = null;
  let dueDate: string | null = null;
  let subtotal: number | null = null;
  let tax: number | null = null;
  let total: number | null = null;

  for (const line of lines) {
    const num = line.match(/invoice\s*(?:no\.?|number|num|#)\s*[:#.]?\s*([A-Z0-9][A-Z0-9\-/]*)/i);
    if (num && !invoiceNumber) invoiceNumber = num[1];

    const dueMatch = line.match(/\bdue\b.*$/i);
    if (dueMatch && !dueDate) dueDate = parseDate(dueMatch[0]);

    if (/^(invoice\s*date|date(\s+issued)?)\b/i.test(line) && !invoiceDate) {
      invoiceDate = parseDate(line);
    }

    if (/^(sub\s*-?\s*total|net(\s+amount)?)\b/i.test(line)) subtotal = lastAmount(line);
    else if (/^(tax|vat|gst|sales\s+tax)\b/i.test(line)) tax = lastAmount(line);
    else if (/^(grand\s+total|total(\s+due)?|amount\s+due)\b/i.test(line)) total = lastAmount(line);
  }

  const lineItems: LineItem[] = [];
  const rowPattern = new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s+(${MONEY})\\s+(${MONEY})$`);
  const headerIndex = lines.findIndex((l) => /description/i.test(l) && /(qty|quantity)/i.test(l));
  if (headerIndex >= 0) {
    for (const line of lines.slice(headerIndex + 1)) {
      const row = line.match(rowPattern);
      if (!row) break;
      lineItems.push({
        description: row[1],
        quantity: parseNumber(row[2]),
        unit_price: parseNumber(row[3]),
        amount: parseNumber(row[4]),
      });
    }
  }

  return {
    vendor,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    due_date: dueDate,
    currency: detectCurrency(text),
    subtotal,
    tax,
    total,
    line_items: lineItems,
  };
}
