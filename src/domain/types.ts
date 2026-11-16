export type OrderType = 'BUY' | 'SELL';

export type PriceSource = 'REQUEST' | 'FIXED';

/** One stock in the model portfolio. `weight` is a percentage (60 = 60%). */
export interface PortfolioHolding {
  symbol: string;
  weight: number;
  /** Optional market price sent by the caller. Takes priority over the fixed price. */
  price?: number;
}

export interface SplitOrderInput {
  orderType: OrderType;
  totalAmount: number;
  portfolio: PortfolioHolding[];
}

export interface OrderLine {
  symbol: string;
  weight: number;
  /** Dollar amount allocated to this stock. */
  amount: number;
  price: number;
  priceSource: PriceSource;
  /** Shares to trade, rounded down to the configured decimal places. */
  quantity: number;
  /** Money that cannot be used because of share rounding. */
  unallocatedAmount: number;
}

export interface Order {
  id: string;
  orderType: OrderType;
  totalAmount: number;
  lines: OrderLine[];
  /** Sum of the per-line unallocated amounts. */
  unallocatedAmount: number;
  /** When the order should be sent to the market (ISO 8601, UTC). */
  executionTime: string;
  createdAt: string;
}
