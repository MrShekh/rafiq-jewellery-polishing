/**
 * Order ID generation (brief section 17): every order gets a unique,
 * human-readable business ID like ORD-20260825-0001, in addition to its
 * internal UUID primary key (db/schema.ts `orders.id`). The internal ID is
 * what sync/foreign keys use; this one is what the business owner reads,
 * searches, and writes on a paper slip if they need to.
 */

export function formatOrderNumber(date: Date, sequenceForDay: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const seq = String(sequenceForDay).padStart(4, "0");
  return `ORD-${y}${m}${d}-${seq}`;
}

export function datePrefixForOrderNumber(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `ORD-${y}${m}${d}-`;
}
