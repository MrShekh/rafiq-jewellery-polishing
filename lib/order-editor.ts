import Decimal from "decimal.js";
import type { Order } from "@/db/schema";
import { calculateOrder, calculateOrderTotals, reconcileClearAfterEdit, type FormulaVersion, type OrderTotals, type PrecisionPolicy } from "@/lib/calculations";
import type { OrderInput } from "@/lib/validation/order";

export interface OrdersResponse {
  orders: Order[];
  total: number;
  totals: OrderTotals;
  page: number;
  pageSize: number;
  precision: PrecisionPolicy;
  formulaVersion: FormulaVersion;
}

export function previewOrder(order: Order, patch: Partial<OrderInput>, precision: PrecisionPolicy, formulaVersion: FormulaVersion): Order {
  const merged = { ...order, ...patch };
  const calc = calculateOrder({ ...merged, precision, formulaVersion });
  const clear = reconcileClearAfterEdit(calc.fineTotalString, order.clearedAmount ?? "0", precision);
  return { ...merged, loss: calc.lossString, fineTotal: calc.fineTotalString, clearedAmount: clear.clearedAmount, clearStatus: clear.status } as Order;
}

/** Adjust full-filter totals by this row's change, preserving off-page orders. */
export function replaceRegistryOrder(data: OrdersResponse, order: Order): OrdersResponse {
  const previous = data.orders.find((row) => row.id === order.id);
  if (!previous) return data;
  const before = calculateOrderTotals([previous], data.precision);
  const after = calculateOrderTotals([order], data.precision);
  const totals = { ...data.totals };
  for (const key of Object.keys(totals) as (keyof OrderTotals)[]) {
    const next = new Decimal(totals[key]).minus(before[key]).plus(after[key]);
    if (key === "totalPieces" || key === "totalPieces2") totals[key] = next.toNumber();
    else totals[key] = next.toFixed(String(data.totals[key]).split(".")[1]?.length ?? data.precision.weight);
  }
  return { ...data, totals, orders: data.orders.map((row) => row.id === order.id ? order : row) };
}

/** Serialize writes to each order; different orders can save independently. */
export class OrderSaveQueue {
  private tails = new Map<string, Promise<unknown>>();
  run<T>(id: string, save: () => Promise<T>): Promise<T> {
    const task = (this.tails.get(id) ?? Promise.resolve()).catch(() => {}).then(save);
    this.tails.set(id, task);
    void task.finally(() => { if (this.tails.get(id) === task) this.tails.delete(id); }).catch(() => {});
    return task;
  }
}
