import request from 'supertest';
import { createApp } from '../src/app';
import { AppConfig, loadConfig } from '../src/config';

// Monday 2024-01-08, 10:00 New York time: market is open
const MARKET_OPEN_NOW = new Date('2024-01-08T15:00:00Z');
// Saturday 2024-01-13
const WEEKEND_NOW = new Date('2024-01-13T15:00:00Z');

const buildApp = (now = MARKET_OPEN_NOW, config: AppConfig = loadConfig({})) =>
  createApp({ config, clock: () => now, logRequests: false });

const splitBody = {
  orderType: 'BUY',
  totalAmount: 100,
  portfolio: [
    { symbol: 'AAPL', weight: 60 },
    { symbol: 'TSLA', weight: 40 },
  ],
};

describe('POST /api/v1/orders/split', () => {
  it('returns the breakdown for the 60/40 example', async () => {
    const res = await request(buildApp()).post('/api/v1/orders/split').send(splitBody);

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/orders/${res.body.id}`);
    expect(res.body).toMatchObject({
      orderType: 'BUY',
      totalAmount: 100,
      executionTime: '2024-01-08T15:00:00.000Z',
    });
    expect(res.body.lines).toEqual([
      expect.objectContaining({ symbol: 'AAPL', amount: 60, price: 100, priceSource: 'DEFAULT', quantity: 0.6 }),
      expect.objectContaining({ symbol: 'TSLA', amount: 40, price: 100, priceSource: 'DEFAULT', quantity: 0.4 }),
    ]);
  });

  it('prices any symbol at the $100 default, not just well-known tickers', async () => {
    const body = { ...splitBody, portfolio: [{ symbol: 'NVDA', weight: 100 }] };
    const res = await request(buildApp()).post('/api/v1/orders/split').send(body);

    expect(res.status).toBe(201);
    expect(res.body.lines[0]).toMatchObject({ symbol: 'NVDA', price: 100, priceSource: 'DEFAULT', quantity: 1 });
  });

  it('mixes request prices and default prices in one order', async () => {
    const body = {
      ...splitBody,
      portfolio: [
        { symbol: 'AAPL', weight: 50, price: 200 },
        { symbol: 'TSLA', weight: 50 },
      ],
    };
    const res = await request(buildApp()).post('/api/v1/orders/split').send(body);

    expect(res.body.lines.map((l: { priceSource: string }) => l.priceSource)).toEqual(['REQUEST', 'DEFAULT']);
  });

  it('prefers a price sent in the request over the fixed one', async () => {
    const body = { ...splitBody, portfolio: [{ symbol: 'aapl', weight: 100, price: 200 }] }; // default is 100
    const res = await request(buildApp()).post('/api/v1/orders/split').send(body);

    expect(res.status).toBe(201);
    expect(res.body.lines[0]).toMatchObject({ symbol: 'AAPL', price: 200, priceSource: 'REQUEST', quantity: 0.5 });
  });

  it('supports SELL orders', async () => {
    const res = await request(buildApp()).post('/api/v1/orders/split').send({ ...splitBody, orderType: 'SELL' });

    expect(res.status).toBe(201);
    expect(res.body.orderType).toBe('SELL');
  });

  it('schedules weekend orders for Monday morning', async () => {
    const res = await request(buildApp(WEEKEND_NOW)).post('/api/v1/orders/split').send(splitBody);

    expect(res.body.executionTime).toBe('2024-01-15T14:30:00.000Z');
  });

  it('uses the configured share precision', async () => {
    const config = loadConfig({ SHARE_DECIMALS: '1' });
    const body = { ...splitBody, portfolio: [{ symbol: 'AAPL', weight: 100, price: 190 }] };
    const res = await request(buildApp(MARKET_OPEN_NOW, config)).post('/api/v1/orders/split').send(body);

    expect(res.body.lines[0].quantity).toBe(0.5); // 100 / 190 = 0.526 -> 0.5
  });

  describe('errors', () => {
    const post = (body: unknown) => request(buildApp()).post('/api/v1/orders/split').send(body as object);

    it.each([
      ['missing orderType', { ...splitBody, orderType: undefined }],
      ['unknown orderType', { ...splitBody, orderType: 'HOLD' }],
      ['negative amount', { ...splitBody, totalAmount: -1 }],
      ['zero amount', { ...splitBody, totalAmount: 0 }],
      ['amount as a string', { ...splitBody, totalAmount: '100' }],
      ['amount with 3 decimals', { ...splitBody, totalAmount: 10.001 }],
      ['empty portfolio', { ...splitBody, portfolio: [] }],
      ['missing portfolio', { orderType: 'BUY', totalAmount: 100 }],
      ['zero weight', { ...splitBody, portfolio: [{ symbol: 'AAPL', weight: 0 }] }],
      ['bad symbol', { ...splitBody, portfolio: [{ symbol: '$$', weight: 100 }] }],
      ['negative price', { ...splitBody, portfolio: [{ symbol: 'AAPL', weight: 100, price: -1 }] }],
      ['unexpected field', { ...splitBody, extra: true }],
      ['huge amount (1e300)', { ...splitBody, totalAmount: 1e300 }],
      ['amount above the limit', { ...splitBody, totalAmount: 1_000_000_001 }],
      ['tiny amount (1e-300)', { ...splitBody, totalAmount: 1e-300 }],
      ['huge price (1e300)', { ...splitBody, portfolio: [{ symbol: 'AAPL', weight: 100, price: 1e300 }] }],
      ['tiny price (1e-300)', { ...splitBody, portfolio: [{ symbol: 'AAPL', weight: 100, price: 1e-300 }] }],
      ['tiny weight (1e-300)', { ...splitBody, portfolio: [{ symbol: 'AAPL', weight: 1e-300 }] }],
      ['too many stocks', { ...splitBody, portfolio: Array.from({ length: 101 }, (_, i) => ({ symbol: `S${i}`, weight: 1 })) }],
    ])('400 for %s', async (_name, body) => {
      const res = await post(body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });

    it('400 for malformed JSON', async () => {
      const res = await request(buildApp())
        .post('/api/v1/orders/split')
        .set('Content-Type', 'application/json')
        .send('{"orderType": ');

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/JSON/);
    });

    it('422 when weights do not add up to 100', async () => {
      const res = await post({ ...splitBody, portfolio: [{ symbol: 'AAPL', weight: 50 }, { symbol: 'TSLA', weight: 40 }] });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
    });

    it('422 for duplicate symbols', async () => {
      const res = await post({ ...splitBody, portfolio: [{ symbol: 'AAPL', weight: 50 }, { symbol: 'aapl', weight: 50 }] });

      expect(res.status).toBe(422);
    });

    it('accepts values exactly at the limits', async () => {
      const res = await post({
        ...splitBody,
        totalAmount: 1_000_000_000,
        portfolio: [{ symbol: 'AAPL', weight: 100, price: 0.01 }],
      });

      expect(res.status).toBe(201);
    });

    it('415 when the body is not JSON', async () => {
      const res = await request(buildApp())
        .post('/api/v1/orders/split')
        .set('Content-Type', 'text/plain')
        .send(JSON.stringify(splitBody));

      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('415 for form-encoded bodies', async () => {
      const res = await request(buildApp()).post('/api/v1/orders/split').type('form').send({ orderType: 'BUY' });

      expect(res.status).toBe(415);
    });

    it('400 (not 415) when there is no body at all', async () => {
      const res = await request(buildApp()).post('/api/v1/orders/split');

      expect(res.status).toBe(400);
    });

    it('does not store failed orders', async () => {
      const app = buildApp();
      await request(app).post('/api/v1/orders/split').send({ ...splitBody, totalAmount: -1 });

      const history = await request(app).get('/api/v1/orders');
      expect(history.body).toEqual({ count: 0, orders: [] });
    });
  });
});

describe('GET /api/v1/orders', () => {
  it('returns historic orders, newest first', async () => {
    const app = buildApp();
    const first = await request(app).post('/api/v1/orders/split').send(splitBody);
    const second = await request(app).post('/api/v1/orders/split').send({ ...splitBody, orderType: 'SELL' });

    const res = await request(app).get('/api/v1/orders');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.orders.map((o: { id: string }) => o.id)).toEqual([second.body.id, first.body.id]);
  });

  it('filters by orderType and symbol', async () => {
    const app = buildApp();
    await request(app).post('/api/v1/orders/split').send(splitBody);
    await request(app)
      .post('/api/v1/orders/split')
      .send({ orderType: 'SELL', totalAmount: 50, portfolio: [{ symbol: 'MSFT', weight: 100 }] });

    const sells = await request(app).get('/api/v1/orders?orderType=SELL');
    const tesla = await request(app).get('/api/v1/orders?symbol=tsla');

    expect(sells.body.count).toBe(1);
    expect(tesla.body.count).toBe(1);
    expect(tesla.body.orders[0].orderType).toBe('BUY');
  });

  it('400 for an invalid filter', async () => {
    const res = await request(buildApp()).get('/api/v1/orders?orderType=HOLD');
    expect(res.status).toBe(400);
  });

  it('starts empty: a new app instance has no history', async () => {
    const used = buildApp();
    await request(used).post('/api/v1/orders/split').send(splitBody);

    const restarted = await request(buildApp()).get('/api/v1/orders');
    expect(restarted.body.count).toBe(0);
  });
});

describe('GET /api/v1/orders/:id', () => {
  it('returns a single order', async () => {
    const app = buildApp();
    const created = await request(app).post('/api/v1/orders/split').send(splitBody);

    const res = await request(app).get(`/api/v1/orders/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created.body);
  });

  it('404 for a well-formed id that does not exist', async () => {
    const res = await request(buildApp()).get('/api/v1/orders/b1ea2e69-f7fc-4750-9648-6b051419d061');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it.each(['does-not-exist', '123', 'b1ea2e69-f7fc-4750-9648-6b051419d06'])('400 for the malformed id %p', async (id) => {
    const res = await request(buildApp()).get(`/api/v1/orders/${id}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('other routes', () => {
  it('serves a health check', async () => {
    const res = await request(buildApp()).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('404 with the standard error shape for unknown routes', async () => {
    const res = await request(buildApp()).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('response time logging', () => {
  it('prints method, path, status and duration in ms', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const app = createApp({ config: loadConfig({}) });

    await request(app).get('/health');

    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/^GET \/health 200 - \d+\.\d{2} ms$/));
    logSpy.mockRestore();
  });
});
