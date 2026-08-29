import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { orderFilterSchema } from "@/lib/validation/order";
import { listOrders } from "@/lib/db/repositories/orders";
import { buildOrderRegistryWorkbook } from "@/lib/export/excel";
import { getCustomerById } from "@/lib/db/repositories/customers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Excel export. Respects whatever filters are currently
 * applied in the Order Registry. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const filter = orderFilterSchema.parse({
      ...Object.fromEntries(searchParams.entries()),
      pageSize: 100000,
      page: 1,
    });

    const { rows, totals } = await listOrders(user.id, filter);

    let customerLabel: string | undefined;
    if (filter.customerId) {
      try {
        const customer = await getCustomerById(user.id, filter.customerId);
        customerLabel = `Customer: ${customer.name}`;
      } catch {
        customerLabel = undefined;
      }
    }
    const dateRangeLabel =
      filter.dateFrom || filter.dateTo
        ? `Date range: ${filter.dateFrom ?? "earliest"} to ${filter.dateTo ?? "latest"}`
        : undefined;

    const buffer = await buildOrderRegistryWorkbook(user.id, rows as any, totals, { dateRangeLabel, customerLabel });

    logger.info("Order registry exported to Excel", { userId: user.id, rowCount: rows.length });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="OrderRegistry_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
