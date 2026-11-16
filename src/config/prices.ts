/**
 * Fixed fallback prices (USD). They are only used when the caller does not
 * send a market price for a stock. In production this would come from a
 * market data provider.
 */
export const FIXED_PRICES: Readonly<Record<string, number>> = {
  AAPL: 190,
  TSLA: 250,
  GOOGL: 170,
  MSFT: 420,
  AMZN: 185,
};
