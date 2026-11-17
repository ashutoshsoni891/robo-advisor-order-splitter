import express, { Express } from 'express';
import { AppConfig } from './config';
import { DEFAULT_PRICE } from './config/prices';
import { errorHandler, notFoundHandler, requireJsonBody, responseTimer } from './http/middleware';
import { createOrderRouter } from './http/orderRoutes';
import { InMemoryOrderRepository } from './repositories/orderRepository';
import { Clock, OrderService } from './services/orderService';
import { PriceService } from './services/priceService';

export interface AppOptions {
  config: AppConfig;
  /** Injectable so tests can pin "now". */
  clock?: Clock;
  /** Set to false to silence request logs (used in tests). */
  logRequests?: boolean;
}

export function createApp({ config, clock, logRequests = true }: AppOptions): Express {
  const orderService = new OrderService(
    new PriceService(DEFAULT_PRICE),
    new InMemoryOrderRepository(),
    config,
    clock,
  );

  const app = express();
  app.disable('x-powered-by');

  if (logRequests) app.use(responseTimer());
  app.use(requireJsonBody);
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/v1/orders', createOrderRouter(orderService));

  app.use(notFoundHandler);
  app.use(errorHandler(logRequests ? console.error : () => undefined));

  return app;
}
