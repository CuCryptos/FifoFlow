import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CloseCountSessionInput, CreateCountSessionInput, RecordCountEntryInput } from '@fifoflow/shared';

export function useCountSessions() {
  return useQuery({
    queryKey: ['count-sessions'],
    queryFn: () => api.countSessions.list(),
  });
}

export function useOpenCountSession() {
  return useQuery({
    queryKey: ['count-sessions', 'open'],
    queryFn: () => api.countSessions.getOpen(),
    refetchInterval: 15000,
  });
}

export function useCountSessionEntries(sessionId?: number) {
  return useQuery({
    queryKey: ['count-sessions', sessionId, 'entries'],
    queryFn: () => api.countSessions.listEntries(sessionId as number),
    enabled: Boolean(sessionId),
  });
}

export function useCountSessionChecklist(sessionId?: number) {
  return useQuery({
    queryKey: ['count-sessions', sessionId, 'checklist'],
    queryFn: () => api.countSessions.checklist(sessionId as number),
    enabled: Boolean(sessionId),
  });
}

export function useCreateCountSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCountSessionInput) => api.countSessions.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['count-sessions'] });
    },
  });
}

export function useRecordCountEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, data }: { sessionId: number; data: RecordCountEntryInput }) =>
      api.countSessions.recordEntry(sessionId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: ['count-sessions'] });
      qc.invalidateQueries({ queryKey: ['count-sessions', vars.sessionId, 'entries'] });
      qc.invalidateQueries({ queryKey: ['count-sessions', vars.sessionId, 'checklist'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCloseCountSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, data }: { sessionId: number; data?: CloseCountSessionInput }) =>
      api.countSessions.close(sessionId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: ['count-sessions'] });
      qc.invalidateQueries({ queryKey: ['count-sessions', vars.sessionId, 'entries'] });
      qc.invalidateQueries({ queryKey: ['count-sessions', vars.sessionId, 'checklist'] });
    },
  });
}
