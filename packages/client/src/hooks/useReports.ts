import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export function useUsageReport(start: string, end: string, groupBy: string = 'day') {
  return useQuery({
    queryKey: ['reports', 'usage', start, end, groupBy],
    queryFn: () => api.reports.usage({ start, end, group_by: groupBy }),
  });
}

export function useWasteReport(start: string, end: string) {
  return useQuery({
    queryKey: ['reports', 'waste', start, end],
    queryFn: () => api.reports.waste({ start, end }),
  });
}

export function useCostReport(start: string, end: string, groupBy: string = 'category') {
  return useQuery({
    queryKey: ['reports', 'cost', start, end, groupBy],
    queryFn: () => api.reports.cost({ start, end, group_by: groupBy }),
  });
}
