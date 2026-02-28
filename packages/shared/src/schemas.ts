import { z } from 'zod';
import { CATEGORIES, UNITS, TRANSACTION_TYPES, TRANSACTION_REASONS } from './constants.js';

export const createItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.enum(CATEGORIES),
  unit: z.enum(UNITS),
});

export const updateItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).optional(),
  category: z.enum(CATEGORIES).optional(),
  unit: z.enum(UNITS).optional(),
});

export const createTransactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  quantity: z.number().positive('Quantity must be positive'),
  reason: z.enum(TRANSACTION_REASONS),
  notes: z.string().max(500).nullable().optional(),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
