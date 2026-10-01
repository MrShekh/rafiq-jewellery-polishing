/** Calendar dates for this India-based workshop, independent of server/browser timezone. */
export const BUSINESS_TIME_ZONE = "Asia/Kolkata";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

export function businessDateIso(now = new Date()): string {
  const parts = dateFormatter.formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function businessDateRanges(now = new Date()) {
  const today = businessDateIso(now);
  const [year, month] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    today: { start: today, end: today },
    month: { start: `${today.slice(0, 7)}-01`, end: `${today.slice(0, 7)}-${lastDay}` },
  };
}
