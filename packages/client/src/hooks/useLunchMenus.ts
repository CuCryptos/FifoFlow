import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type {
  BulkUpdateLunchMenuDaysInput,
  CreateLunchMenuInput,
  GenerateLunchMenuInput,
  ImportLunchMenuInput,
  UpdateLunchMenuInput,
} from '@fifoflow/shared';

export function useLunchMenus(params?: { venue_id?: number; year?: number; status?: 'draft' | 'published' | 'archived' }) {
  return useQuery({
    queryKey: ['lunch-menus', params ?? {}],
    queryFn: () => api.lunchMenus.list(params),
  });
}

export function useLunchMenu(menuId: number) {
  return useQuery({
    queryKey: ['lunch-menus', menuId],
    queryFn: () => api.lunchMenus.get(menuId),
    enabled: menuId > 0,
  });
}

export function useLunchMenuCalendar(menuId: number) {
  return useQuery({
    queryKey: ['lunch-menus', menuId, 'calendar'],
    queryFn: () => api.lunchMenus.getCalendar(menuId),
    enabled: menuId > 0,
  });
}

export function useCreateLunchMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLunchMenuInput) => api.lunchMenus.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lunch-menus'] });
    },
  });
}

export function useUploadLunchMenuPdf() {
  return useMutation({
    mutationFn: (file: File) => api.lunchMenus.uploadPdf(file),
  });
}

export function useImportLunchMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ImportLunchMenuInput) => api.lunchMenus.import(data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['lunch-menus'] });
      qc.setQueryData(['lunch-menus', result.menu.id], result.menu);
      qc.setQueryData(['lunch-menus', result.menu.id, 'calendar'], result.calendar);
    },
  });
}

export function useGenerateLunchMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: GenerateLunchMenuInput) => api.lunchMenus.generate(data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['lunch-menus'] });
      qc.setQueryData(['lunch-menus', result.menu.id], result.menu);
      qc.setQueryData(['lunch-menus', result.menu.id, 'calendar'], result.calendar);
    },
  });
}

export function useUpdateLunchMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuId, data }: { menuId: number; data: UpdateLunchMenuInput }) => api.lunchMenus.update(menuId, data),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['lunch-menus'] });
      qc.invalidateQueries({ queryKey: ['lunch-menus', variables.menuId] });
      qc.invalidateQueries({ queryKey: ['lunch-menus', variables.menuId, 'calendar'] });
    },
  });
}

export function useUpdateLunchMenuDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuId, data }: { menuId: number; data: BulkUpdateLunchMenuDaysInput }) =>
      api.lunchMenus.updateDays(menuId, data),
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ['lunch-menus'] });
      if (result.menu) {
        qc.setQueryData(['lunch-menus', variables.menuId], result.menu);
      } else {
        qc.invalidateQueries({ queryKey: ['lunch-menus', variables.menuId] });
      }
      if (result.calendar) {
        qc.setQueryData(['lunch-menus', variables.menuId, 'calendar'], result.calendar);
      } else {
        qc.invalidateQueries({ queryKey: ['lunch-menus', variables.menuId, 'calendar'] });
      }
    },
  });
}

export function useDeleteLunchMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (menuId: number) => api.lunchMenus.delete(menuId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lunch-menus'] });
    },
  });
}
