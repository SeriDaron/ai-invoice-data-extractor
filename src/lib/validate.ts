import type { InvoiceData } from "./schema";

const TOLERANCE = 0.02;

const close = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE;

/**
 * Cross-check the extracted numbers. A model (or a regex) can misread a document,
 * so every invoice is validated arithmetically and flagged for human review when
 * something does not add up.
 */
export function validateInvoice(data: InvoiceData): string[] {
  const warnings: string[] = [];

  if (!data.vendor) warnings.push("Vendor name not found");
  if (!data.invoice_number) warnings.push("Invoice number not found");
  if (data.total === null) warnings.push("Total amount not found");

  data.line_items.forEach((item, i) => {
    if (item.quantity !== null && item.unit_price !== null && item.amount !== null) {
      const expected = item.quantity * item.unit_price;
      if (!close(expected, item.amount)) {
        warnings.push(
          `Line ${i + 1} ("${item.description}"): ${item.quantity} × ${item.unit_price} = ${expected.toFixed(2)}, but the invoice shows ${item.amount.toFixed(2)}`
        );
      }
    }
  });

  const itemAmounts = data.line_items.map((l) => l.amount);
  if (data.subtotal !== null && itemAmounts.length > 0 && itemAmounts.every((a) => a !== null)) {
    const sum = (itemAmounts as number[]).reduce((s, a) => s + a, 0);
    if (!close(sum, data.subtotal)) {
      warnings.push(`Line items add up to ${sum.toFixed(2)}, but the subtotal is ${data.subtotal.toFixed(2)}`);
    }
  }

  if (data.subtotal !== null && data.total !== null) {
    const expectedTotal = data.subtotal + (data.tax ?? 0);
    if (!close(expectedTotal, data.total)) {
      warnings.push(
        `Subtotal${data.tax !== null ? " + tax" : ""} = ${expectedTotal.toFixed(2)}, but the total is ${data.total.toFixed(2)}`
      );
    }
  }

  return warnings;
}
