import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { errorHandler } from '../src/http/middleware';

describe('errorHandler', () => {
  it('hides internal details of unexpected errors and logs them', async () => {
    const logError = jest.fn();
    const app = express();
    app.get('/boom', () => {
      throw new Error('db password is hunter2');
    });
    app.use(errorHandler(logError));

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'something went wrong' });
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2/);
    expect(logError).toHaveBeenCalledTimes(1);
  });
});

describe('request body limit', () => {
  it('413 for an oversized body', async () => {
    const app = createApp({ config: loadConfig({}), logRequests: false });
    const huge = { orderType: 'BUY', totalAmount: 1, portfolio: [], padding: 'x'.repeat(200_000) };

    const res = await request(app).post('/api/v1/orders/split').send(huge);

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
