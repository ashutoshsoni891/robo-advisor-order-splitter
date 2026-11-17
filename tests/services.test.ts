import { loadConfig } from '../src/config';
import { Order } from '../src/domain/types';
import { InMemoryOrderRepository } from '../src/repositories/orderRepository';
import { PriceService } from '../src/services/priceService';

describe('PriceService', () => {
  const prices = new PriceService(100);

  it('uses the default price when none is sent', () => {
    expect(prices.resolve()).toEqual({ price: 100, source: 'DEFAULT' });
  });

  it('gives the request price priority over the default price', () => {
    expect(prices.resolve(200.5)).toEqual({ price: 200.5, source: 'REQUEST' });
  });
});

describe('InMemoryOrderRepository', () => {
  const order = (id: string, orderType: Order['orderType'], symbol: string): Order => ({
    id,
    orderType,
    totalAmount: 100,
    lines: [{ symbol, weight: 100, amount: 100, price: 1, priceSource: 'DEFAULT', quantity: 100, unallocatedAmount: 0 }],
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
