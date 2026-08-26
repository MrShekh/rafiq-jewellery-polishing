import { CustomerDetail } from "@/components/customer/customer-detail";

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  return <CustomerDetail customerId={params.id} />;
}
