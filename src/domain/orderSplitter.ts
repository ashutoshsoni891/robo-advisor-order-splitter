import Decimal from 'decimal.js';
import { businessRuleError } from '../errors';
import { OrderLine, PriceSource } from './types';

export interface PricedHolding {
  symbol: string;
  weight: number;
  price: number;
  priceSource: PriceSource;
}

export interface SplitResult {
  lines: OrderLine[];
  unallocatedAmount: number;
}

const CENTS = 2;

/**
 * Splits `totalAmount` across the holdings by weight and works out how many
 * shares each allocation buys (or sells).
 *
 * Pure function: no I/O, no clock, so it is easy to test.
 *
 * Rules:
 *  - weights are percentages and must add up to exactly 100
 *  - dollar amounts are whole cents and always add back up to the total
 *    (leftover cents go to the stocks with the biggest rounding remainder)
 *  - shares are rounded DOWN to `shareDecimals`, so a BUY never spends more
 *    than the allocated amount. The unusable money is reported as unallocated.
 */
export function splitOrder(
  totalAmount: number,
  holdings: PricedHolding[],
  shareDecimals: number,
): SplitResult {
  assertValidHoldings(holdings);

  const total = new Decimal(totalAmount);
  if (total.lte(0) || total.decimalPlaces() > CENTS) {
    throw businessRuleError('totalAmount must be positive with at most 2 decimal places');
  }

  const amounts = allocateCents(total, holdings);

  let unallocatedTotal = new Decimal(0);
  const lines = holdings.map((holding, i): OrderLine => {
    const amount = amounts[i] as Decimal;
    const price = new Decimal(holding.price);
    const quantity = amount.div(price).toDecimalPlaces(shareDecimals, Decimal.ROUND_DOWN);
    const unallocated = amount.minus(quantity.times(price));
    unallocatedTotal = unallocatedTotal.plus(unallocated);

    return {
      symbol: holding.symbol,
      weight: holding.weight,
      amount: amount.toNumber(),
      price: holding.price,
      priceSource: holding.priceSource,
      quantity: quantity.toNumber(),
      unallocatedAmount: unallocated.toDecimalPlaces(CENTS).toNumber(),
    };
  });

  return { lines, unallocatedAmount: unallocatedTotal.toDecimalPlaces(CENTS).toNumber() };
}

function assertValidHoldings(holdings: PricedHolding[]): void {
  if (holdings.length === 0) {
    throw businessRuleError('portfolio must contain at least one stock');
  }

  const seen = new Set<string>();
  for (const { symbol } of holdings) {
    if (seen.has(symbol)) {
      throw businessRuleError(`duplicate symbol in portfolio: ${symbol}`);
    }
    seen.add(symbol);
  }

  const weightSum = holdings.reduce((sum, h) => sum.plus(h.weight), new Decimal(0));
  if (!weightSum.eq(100)) {
    throw businessRuleError(`portfolio weights must add up to 100, got ${weightSum.toString()}`);
  }
}

/**
 * Converts weights into dollar amounts without losing a cent.
 * Floors every share to whole cents, then hands the cents left over to the
 * holdings with the largest fractional part (largest remainder method).
 */
function allocateCents(total: Decimal, holdings: PricedHolding[]): Decimal[] {
  const totalCents = total.times(100);

  const exact = holdings.map((h) => totalCents.times(h.weight).div(100));
  const floored = exact.map((value) => value.floor());
  const remainders = exact.map((value, i) => ({ index: i, fraction: value.minus(floored[i] as Decimal) }));

  const flooredSum = floored.reduce((sum, value) => sum.plus(value), new Decimal(0));
  const centsLeft = totalCents.minus(flooredSum).toNumber();

  // Array.sort is stable, so ties go to the stock listed first.
  remainders.sort((a, b) => b.fraction.comparedTo(a.fraction));
  for (let k = 0; k < centsLeft; k++) {
    const target = (remainders[k] as { index: number }).index;
    floored[target] = (floored[target] as Decimal).plus(1);
  }

  return floored.map((cents) => cents.div(100));
}
