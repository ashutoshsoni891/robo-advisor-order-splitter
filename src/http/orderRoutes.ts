import { RequestHandler, Router } from 'express';
import { OrderService } from '../services/orderService';
import { listOrdersQuerySchema, splitOrderSchema } from './schemas';

/** Express 4 does not catch async errors, but our handlers are sync so a plain try/catch wrapper is enough. */
const handle =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) => {
    try {
      fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };

export function createOrderRouter(orders: OrderService): Router {
  const router = Router();

  // POST creates a new "split" order, so it returns 201 and the stored order.
  router.post(
    '/split',
    handle((req, res) => {
      const input = splitOrderSchema.parse(req.body);
      const order = orders.createOrder(input);
      res.status(201).location(`/api/v1/orders/${order.id}`).json(order);
    }),
  );

  router.get(
    '/',
    handle((req, res) => {
      const filter = listOrdersQuerySchema.parse(req.query);
      const items = orders.listOrders(filter);
      res.json({ count: items.length, orders: items });
    }),
  );

  router.get(
    '/:id',
    handle((req, res) => {
      res.json(orders.getOrder(String(req.params.id)));
    }),
  );

  return router;
}
