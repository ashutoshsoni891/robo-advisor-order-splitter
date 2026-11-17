import { PriceSource } from '../domain/types';

export interface ResolvedPrice {
  price: number;
  source: PriceSource;
}

/** Decides which price to use for a stock: the caller's market price first, otherwise the default. */
export class PriceService {
  constructor(private readonly defaultPrice: number) {}

  resolve(requestPrice?: number): ResolvedPrice {
    if (requestPrice !== undefined) {
      return { price: requestPrice, source: 'REQUEST' };
    }
    return { price: this.defaultPrice, source: 'DEFAULT' };
  }
}
