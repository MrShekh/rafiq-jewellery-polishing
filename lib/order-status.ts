export type ClearStatus = "open" | "partial" | "cleared";

export function clearStatusLabel(status?: ClearStatus | null): string {
  switch (status) {
    case "cleared":
      return "Cleared";
    case "partial":
      return "Partial";
    default:
      return "Open";
  }
}

export function clearStatusBadgeVariant(status?: ClearStatus | null): "destructive" | "warning" | "success" {
  switch (status) {
    case "cleared":
      return "success";
    case "partial":
      return "warning";
    default:
      return "destructive";
  }
}
