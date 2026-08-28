import { CustomerEditModal } from './CustomerEditModal';
import type { CustomerSummary } from './types';

type CustomerDetailDrawerProps = {
  customerSummary: CustomerSummary | null;
  onClose: () => void;
  onCustomerUpdated: (updated: CustomerSummary) => void;
};

export function CustomerDetailDrawer({
  customerSummary,
  onClose,
  onCustomerUpdated,
}: CustomerDetailDrawerProps) {
  return (
    <CustomerEditModal
      customerSummary={customerSummary}
      isOpen={!!customerSummary}
      onClose={onClose}
      onCustomerUpdated={onCustomerUpdated}
    />
  );
}

export { CustomerEditModal };
