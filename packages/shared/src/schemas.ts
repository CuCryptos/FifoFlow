import { z } from 'zod';
import { CATEGORIES, UNITS, TRANSACTION_TYPES, TRANSACTION_REASONS } from './constants.js';

export const createItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.enum(CATEGORIES),
  unit: z.enum(UNITS),
  order_unit: z.enum(UNITS).nullable().optional(),
  order_unit_price: z.number().min(0).nullable().optional(),
  qty_per_unit: z.number().positive().nullable().optional(),
  inner_unit: z.enum(UNITS).nullable().optional(),
  item_size_value: z.number().positive().nullable().optional(),
  item_size_unit: z.enum(UNITS).nullable().optional(),
  item_size: z.string().max(100).nullable().optional(), // legacy field
  reorder_level: z.number().min(0).nullable().optional(),
  reorder_qty: z.number().positive().nullable().optional(),
  vendor_id: z.number().int().positive().nullable().optional(),
});

export const updateItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).optional(),
  category: z.enum(CATEGORIES).optional(),
  unit: z.enum(UNITS).optional(),
  order_unit: z.enum(UNITS).nullable().optional(),
  order_unit_price: z.number().min(0).nullable().optional(),
  qty_per_unit: z.number().positive().nullable().optional(),
  inner_unit: z.enum(UNITS).nullable().optional(),
  item_size_value: z.number().positive().nullable().optional(),
  item_size_unit: z.enum(UNITS).nullable().optional(),
  item_size: z.string().max(100).nullable().optional(), // legacy field
  reorder_level: z.number().min(0).nullable().optional(),
  reorder_qty: z.number().positive().nullable().optional(),
  vendor_id: z.number().int().positive().nullable().optional(),
});

export const createTransactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  quantity: z.number().positive('Quantity must be positive'),
  unit: z.enum(UNITS).optional(),
  reason: z.enum(TRANSACTION_REASONS),
  notes: z.string().max(500).nullable().optional(),
  from_area_id: z.number().int().positive().nullable().optional(),
  to_area_id: z.number().int().positive().nullable().optional(),
}).superRefine((data, ctx) => {
  const noteRequiredReasons = new Set(['Wasted', 'Adjustment', 'Transferred']);
  if (noteRequiredReasons.has(data.reason)) {
    const hasNotes = typeof data.notes === 'string' && data.notes.trim().length > 0;
    if (!hasNotes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notes'],
        message: `Notes are required for ${data.reason} transactions.`,
      });
    }
  }
});

export const setItemCountSchema = z.object({
  counted_qty: z.number().min(0, 'Counted quantity cannot be negative'),
  notes: z.string().max(500).nullable().optional(),
});

export const createCountSessionSchema = z.object({
  name: z.string().min(1, 'Session name is required').max(120),
  template_category: z.enum(CATEGORIES).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const closeCountSessionSchema = z.object({
  force_close: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const recordCountEntrySchema = z.object({
  item_id: z.number().int().positive(),
  counted_qty: z.number().min(0, 'Counted quantity cannot be negative'),
  notes: z.string().max(500).nullable().optional(),
});

export const createStorageAreaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

export const updateStorageAreaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type SetItemCountInput = z.infer<typeof setItemCountSchema>;
export type CreateCountSessionInput = z.infer<typeof createCountSessionSchema>;
export type CloseCountSessionInput = z.infer<typeof closeCountSessionSchema>;
export type RecordCountEntryInput = z.infer<typeof recordCountEntrySchema>;
export const bulkUpdateItemsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
  updates: z.object({
    category: z.enum(CATEGORIES),
  }),
});

export const bulkDeleteItemsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

export type CreateStorageAreaInput = z.infer<typeof createStorageAreaSchema>;
export type UpdateStorageAreaInput = z.infer<typeof updateStorageAreaSchema>;
export type BulkUpdateItemsInput = z.infer<typeof bulkUpdateItemsSchema>;
export type BulkDeleteItemsInput = z.infer<typeof bulkDeleteItemsSchema>;

export const createVendorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  notes: z.string().max(500).nullable().optional(),
});

export const updateVendorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const createOrderSchema = z.object({
  vendor_id: z.number().int().positive(),
  notes: z.string().max(500).nullable().optional(),
  items: z.array(z.object({
    item_id: z.number().int().positive(),
    quantity: z.number().positive(),
    unit: z.string().min(1),
    unit_price: z.number().min(0),
  })).min(1),
});

export const updateOrderSchema = z.object({
  notes: z.string().max(500).nullable().optional(),
  items: z.array(z.object({
    item_id: z.number().int().positive(),
    quantity: z.number().positive(),
    unit: z.string().min(1),
    unit_price: z.number().min(0),
  })).min(1).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['sent'] as const),
});

export type CreateVendorInput = z.infer<typeof createVendorSchema>;
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
