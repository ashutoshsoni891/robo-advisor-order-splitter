/**
 * Price (USD) used for any stock when the caller does not send a market price.
 * A price in the request always takes priority. In production this would come
 * from a market data provider.
 */
export const DEFAULT_PRICE = 100;
