import { loadConfig } from '../src/config';
import { Order } from '../src/domain/types';
import { AppError } from '../src/errors';
import { InMemoryOrderRepository } from '../src/repositories/orderRepository';
import { PriceService } from '../src/services/priceService';

describe('PriceService', () => {
  const prices = new PriceService({ AAPL: 190 });

  it('uses the fixed price when none is sent', () => {
    expect(prices.resolve('AAPL')).toEqual({ price: 190, source: 'FIXED' });
  });

  it('gives the request price priority over the fixed price', () => {
    expect(prices.resolve('AAPL', 200.5)).toEqual({ price: 200.5, source: 'REQUEST' });
  });

  it('accepts a request price for a stock we have no fixed price for', () => {
    expect(prices.resolve('NVDA', 900)).toEqual({ price: 900, source: 'REQUEST' });
  });

  it('fails for an unknown stock with no request price', () => {
    expect(() => prices.resolve('NVDA')).toThrow(AppError);
  });

  it('does not treat object prototype keys as symbols', () => {
    expect(() => prices.resolve('constructor')).toThrow(/no price available/);
  });
});

describe('InMemoryOrderRepository', () => {
  const order = (id: string, orderType: Order['orderType'], symbol: string): Order => ({
    id,
    orderType,
    totalAmount: 100,
    lines: [{ symbol, weight: 100, amount: 100, price: 1, priceSource: 'FIXED', quantity: 100, unallocatedAmount: 0 }],
    unallocatedAmount: 0,
    executionTime: '2024-01-08T15:00:00.000Z',
    createdAt: '2024-01-08T15:00:00.000Z',
  });

  it('returns orders newest first', () => {
    const repo = new InMemoryOrderRepository();
    repo.save(order('1', 'BUY', 'AAPL'));
    repo.save(order('2', 'SELL', 'TSLA'));

    expect(repo.findAll().map((o) => o.id)).toEqual(['2', '1']);
  });

  it('filters by order type and symbol', () => {
    const repo = new InMemoryOrderRepository();
    repo.save(order('1', 'BUY', 'AAPL'));
    repo.save(order('2', 'SELL', 'TSLA'));

    expect(repo.findAll({ orderType: 'SELL' }).map((o) => o.id)).toEqual(['2']);
    expect(repo.findAll({ symbol: 'AAPL' }).map((o) => o.id)).toEqual(['1']);
    expect(repo.findAll({ orderType: 'BUY', symbol: 'TSLA' })).toEqual([]);
  });

  it('finds by id and returns undefined when missing', () => {
    const repo = new InMemoryOrderRepository();
    repo.save(order('1', 'BUY', 'AAPL'));

    expect(repo.findById('1')?.id).toBe('1');
    expect(repo.findById('nope')).toBeUndefined();
  });
});

describe('loadConfig', () => {
  it('uses sensible defaults', () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.shareDecimals).toBe(3);
  });

  it('reads values from the environment', () => {
    const config = loadConfig({ PORT: '8080', SHARE_DECIMALS: '7' });
    expect(config).toMatchObject({ port: 8080, shareDecimals: 7 });
  });

  it.each([
    [{ SHARE_DECIMALS: '8' }, /SHARE_DECIMALS/],
    [{ SHARE_DECIMALS: '-1' }, /SHARE_DECIMALS/],
    [{ SHARE_DECIMALS: '2.5' }, /integer/],
    [{ SHARE_DECIMALS: 'abc' }, /integer/],
    [{ PORT: '0' }, /PORT/],
    [{ PORT: '70000' }, /PORT/],
  ])('rejects bad settings %p', (env, message) => {
    expect(() => loadConfig(env)).toThrow(message);
  });
});
