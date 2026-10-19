import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import type { ExtractedInvoice } from "@/lib/schema";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F2937" },
};
const REVIEW_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFEF3C7" },
};

function styleHeader(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = HEADER_FILL;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const invoices: ExtractedInvoice[] = Array.isArray(body?.invoices) ? body.invoices.slice(0, 200) : [];
    if (invoices.length === 0) {
      return NextResponse.json({ error: "Nothing to export." }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DocExtract";

    const summary = workbook.addWorksheet("Invoices");
    summary.columns = [
      { header: "File", key: "file_name", width: 32 },
      { header: "Vendor", key: "vendor", width: 28 },
      { header: "Invoice #", key: "invoice_number", width: 16 },
      { header: "Invoice date", key: "invoice_date", width: 14 },
      { header: "Due date", key: "due_date", width: 14 },
      { header: "Currency", key: "currency", width: 10 },
      { header: "Subtotal", key: "subtotal", width: 14, style: { numFmt: "#,##0.00" } },
      { header: "Tax", key: "tax", width: 12, style: { numFmt: "#,##0.00" } },
      { header: "Total", key: "total", width: 14, style: { numFmt: "#,##0.00" } },
      { header: "Status", key: "status", width: 14 },
      { header: "Warnings", key: "warnings", width: 60 },
    ];
    styleHeader(summary);

    const items = workbook.addWorksheet("Line items");
    items.columns = [
      { header: "Invoice #", key: "invoice_number", width: 16 },
      { header: "Vendor", key: "vendor", width: 28 },
      { header: "Description", key: "description", width: 40 },
      { header: "Quantity", key: "quantity", width: 10 },
      { header: "Unit price", key: "unit_price", width: 14, style: { numFmt: "#,##0.00" } },
      { header: "Amount", key: "amount", width: 14, style: { numFmt: "#,##0.00" } },
    ];
    styleHeader(items);

    for (const inv of invoices) {
      const row = summary.addRow({
        ...inv,
        status: inv.status === "ok" ? "OK" : "Needs review",
        warnings: inv.warnings.join(" | "),
      });
      if (inv.status === "review") row.eachCell((cell) => (cell.fill = REVIEW_FILL));

      for (const item of inv.line_items) {
        items.addRow({ invoice_number: inv.invoice_number, vendor: inv.vendor, ...item });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="invoices.xlsx"',
      },
    });
  } catch (error) {
    console.error("[export] failed:", error);
    return NextResponse.json({ error: "Could not create the Excel file." }, { status: 500 });
  }
}
