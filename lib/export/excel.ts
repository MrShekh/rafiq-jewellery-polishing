import ExcelJS from "exceljs";

import type { Order } from "@/db/schema";
import type { OrderTotals } from "@/lib/calculations";
import { getBusinessProfile } from "@/lib/db/repositories/settings";

/**
 * Excel export for the Order Registry (brief section 35). Takes whatever
 * set of orders the caller already filtered (same filter logic the table
 * itself uses - see app/api/orders/export/route.ts) and the matching
 * totals, so the export always matches what's on screen.
 */
export async function buildOrderRegistryWorkbook(
  ordersList: Order[],
  totals: OrderTotals,
  meta: { dateRangeLabel?: string; customerLabel?: string } = {},
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const business = getBusinessProfile();
  workbook.creator = business.name || "Jewellery Polishing";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Order Registry", {
    views: [{ state: "frozen", ySplit: business.name ? 4 : 2 }],
  });

  let row = 1;
  if (business.name) {
    sheet.mergeCells(row, 1, row, 10);
    sheet.getCell(row, 1).value = business.name;
    sheet.getCell(row, 1).font = { bold: true, size: 14 };
    row += 1;
  }
  const subtitleParts = [meta.dateRangeLabel, meta.customerLabel].filter(Boolean);
  if (subtitleParts.length > 0) {
    sheet.mergeCells(row, 1, row, 10);
    sheet.getCell(row, 1).value = subtitleParts.join(" | ");
    sheet.getCell(row, 1).font = { italic: true, color: { argb: "FF666666" } };
    row += 1;
  }
  row += 1; // spacer

  const headerRowIndex = row;
  const headers = [
    "Date",
    "Customer",
    "Item",
    "Pieces",
    "Wt In 1",
    "Wt Out 1",
    "Wt In 2",
    "Wt Out 2",
    "Making Charge",
    "Loss",
    "Touch",
    "Fine Total",
  ];
  sheet.getRow(headerRowIndex).values = headers;
  sheet.getRow(headerRowIndex).font = { bold: true };
  sheet.getRow(headerRowIndex).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFE6D8" } };
    cell.border = { bottom: { style: "thin" } };
  });

  const numFmt3 = "0.000";
  const numFmt2 = "0.00";

  for (const order of ordersList) {
    sheet.addRow([
      order.orderDate,
      order.customerNameSnapshot,
      order.item,
      order.pieces,
      Number(order.weightIn),
      Number(order.weightOut),
      order.weightIn2 ? Number(order.weightIn2) : "",
      order.weightOut2 ? Number(order.weightOut2) : "",
      Number(order.makingCharge),
      Number(order.loss),
      Number(order.touch),
      Number(order.fineTotal),
    ]);
  }

  const totalsRow = sheet.addRow([
    "TOTAL",
    "",
    "",
    totals.totalPieces,
    Number(totals.totalWeightIn),
    Number(totals.totalWeightOut),
    Number(totals.totalWeightIn2),
    Number(totals.totalWeightOut2),
    Number(totals.totalMakingCharge),
    Number(totals.totalLoss),
    "",
    Number(totals.totalFineTotal),
  ]);
  totalsRow.font = { bold: true };
  totalsRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3E9D4" } };
    cell.border = { top: { style: "double" } };
  });

  sheet.columns = [
    { width: 12 },
    { width: 24 },
    { width: 16 },
    { width: 9 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 10 },
    { width: 8 },
    { width: 12 },
  ];

  for (let c = 5; c <= 10; c++) sheet.getColumn(c).numFmt = numFmt3;
  sheet.getColumn(11).numFmt = numFmt2;
  sheet.getColumn(12).numFmt = numFmt3;

  return workbook.xlsx.writeBuffer();
}
