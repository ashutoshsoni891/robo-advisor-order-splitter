import { Order, OrderType } from '../domain/types';

export interface OrderFilter {
  orderType?: OrderType;
  symbol?: string;
}

export interface OrderRepository {
  save(order: Order): void;
  findById(id: string): Order | undefined;
  /** Newest first. */
  findAll(filter?: OrderFilter): Order[];
}

/** Keeps orders in memory only, so history is lost on restart (as required). */
export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();

  save(order: Order): void {
    this.orders.set(order.id, order);
  }

  findById(id: string): Order | undefined {
    return this.orders.get(id);
  }

  findAll({ orderType, symbol }: OrderFilter = {}): Order[] {
    return [...this.orders.values()]
      .filter((o) => !orderType || o.orderType === orderType)
      .filter((o) => !symbol || o.lines.some((l) => l.symbol === symbol))
      .reverse();
  }
}
