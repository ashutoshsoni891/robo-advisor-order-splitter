import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config';
import { nextExecutionTime } from '../domain/marketCalendar';
import { PricedHolding, splitOrder } from '../domain/orderSplitter';
import { Order, SplitOrderInput } from '../domain/types';
import { notFoundError } from '../errors';
import { OrderFilter, OrderRepository } from '../repositories/orderRepository';
import { PriceService } from './priceService';

export type Clock = () => Date;

/** Ties the pieces together: price lookup, splitting, scheduling and saving. */
export class OrderService {
  constructor(
    private readonly prices: PriceService,
    private readonly repository: OrderRepository,
    private readonly config: AppConfig,
    private readonly clock: Clock = () => new Date(),
  ) {}

  createOrder(input: SplitOrderInput): Order {
    const holdings: PricedHolding[] = input.portfolio.map((h) => {
      const { price, source } = this.prices.resolve(h.symbol, h.price);
      return { symbol: h.symbol, weight: h.weight, price, priceSource: source };
    });

    const { lines, unallocatedAmount } = splitOrder(input.totalAmount, holdings, this.config.shareDecimals);
    const now = this.clock();

    const order: Order = {
      id: randomUUID(),
      orderType: input.orderType,
      totalAmount: input.totalAmount,
      lines,
      unallocatedAmount,
      executionTime: nextExecutionTime(now, this.config.market).toISOString(),
      createdAt: now.toISOString(),
    };

    this.repository.save(order);
    return order;
  }

  getOrder(id: string): Order {
    const order = this.repository.findById(id);
    if (!order) throw notFoundError(`order ${id} not found`);
    return order;
  }

  listOrders(filter?: OrderFilter): Order[] {
    return this.repository.findAll(filter);
  }
}
