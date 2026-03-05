import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export function useParseInvoice() {
  return useMutation({
    mutationFn: ({ files, vendorId }: { files: File[]; vendorId?: number }) =>
      api.invoices.parse(files, vendorId),
  });
}

export function useConfirmInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof api.invoices.confirm>[0]) =>
      api.invoices.confirm(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
