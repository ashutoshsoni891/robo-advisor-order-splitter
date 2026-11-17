import Decimal from 'decimal.js';
import { z } from 'zod';

/** Sanity limits so absurd values (1e300, 1e-300) are rejected up front. */
export const LIMITS = {
  totalAmount: { min: 0.01, max: 1_000_000_000 },
  price: { min: 0.01, max: 10_000_000 },
  weight: { min: 0.01, max: 100 },
  maxHoldings: 100,
} as const;

const symbol = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9.-]{0,9}$/, 'symbol must be 1-10 characters: letters, digits, "." or "-"');

const holding = z.strictObject({
  symbol,
  weight: z.number().min(LIMITS.weight.min).max(LIMITS.weight.max),
  price: z.number().min(LIMITS.price.min).max(LIMITS.price.max).optional(),
});

export const splitOrderSchema = z.strictObject({
  orderType: z.enum(['BUY', 'SELL']),
  totalAmount: z
    .number()
    .min(LIMITS.totalAmount.min)
    .max(LIMITS.totalAmount.max)
    .refine((n) => new Decimal(n).decimalPlaces() <= 2, 'must have at most 2 decimal places'),
  portfolio: z.array(holding).min(1).max(LIMITS.maxHoldings),
});

export const listOrdersQuerySchema = z.object({
  orderType: z.enum(['BUY', 'SELL']).optional(),
  symbol: symbol.optional(),
});

/** Order ids are UUIDs; anything else is a client error, not a "not found". */
export const orderIdSchema = z.uuid('order id must be a valid UUID');
