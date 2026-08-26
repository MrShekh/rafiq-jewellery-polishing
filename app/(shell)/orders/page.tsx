import { OrderRegistryTable } from "@/components/order-table/order-registry-table";

export default function OrdersPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <OrderRegistryTable />
    </div>
  );
}
