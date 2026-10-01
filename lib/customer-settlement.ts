export interface CustomerSettlementPreview {
  token: string;
  orderCount: number;
  toCollect: string;
  toReturn: string;
  amount: string;
  direction: "collect" | "return" | "balanced";
}

export interface CustomerSettlementRecord extends CustomerSettlementPreview {
  id: string;
  createdAt: string;
}

export interface CustomerSettlementResponse {
  preview: CustomerSettlementPreview;
  settlements: CustomerSettlementRecord[];
}
