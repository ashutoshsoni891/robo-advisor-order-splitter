import { businessRuleError } from '../errors';
import { PriceSource } from '../domain/types';

export interface ResolvedPrice {
  price: number;
  source: PriceSource;
}

/** Decides which price to use for a stock: caller's market price first, then the fixed table. */
export class PriceService {
  constructor(private readonly fixedPrices: Readonly<Record<string, number>>) {}

  resolve(symbol: string, requestPrice?: number): ResolvedPrice {
    if (requestPrice !== undefined) {
      return { price: requestPrice, source: 'REQUEST' };
    }

    const fixed = Object.hasOwn(this.fixedPrices, symbol) ? this.fixedPrices[symbol] : undefined;
    if (fixed === undefined) {
      throw businessRuleError(`no price available for ${symbol}; send a "price" for it in the request`);
    }
    return { price: fixed, source: 'FIXED' };
  }
}
