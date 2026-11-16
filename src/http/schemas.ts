import Decimal from 'decimal.js';
import { z } from 'zod';

const symbol = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9.-]{0,9}$/, 'symbol must be 1-10 characters: letters, digits, "." or "-"');

const holding = z
  .object({
    symbol,
    weight: z.number().positive().max(100),
    price: z.number().positive().optional(),
  })
  .strict();

export const splitOrderSchema = z
  .object({
    orderType: z.enum(['BUY', 'SELL']),
    totalAmount: z
      .number()
      .positive()
      .refine((n) => new Decimal(n).decimalPlaces() <= 2, 'must have at most 2 decimal places'),
    portfolio: z.array(holding).min(1).max(100),
  })
  .strict();

export const listOrdersQuerySchema = z.object({
  orderType: z.enum(['BUY', 'SELL']).optional(),
  symbol: symbol.optional(),
});
