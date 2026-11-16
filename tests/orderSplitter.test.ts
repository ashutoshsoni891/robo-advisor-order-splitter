import { PricedHolding, splitOrder } from '../src/domain/orderSplitter';
import { AppError } from '../src/errors';

const holding = (symbol: string, weight: number, price: number): PricedHolding => ({
  symbol,
  weight,
  price,
  priceSource: 'FIXED',
});

describe('splitOrder', () => {
  it('splits $100 into $60 / $40 and works out the shares', () => {
    const result = splitOrder(100, [holding('AAPL', 60, 200), holding('TSLA', 40, 250)], 3);

    expect(result.lines.map((l) => [l.symbol, l.amount, l.quantity])).toEqual([
      ['AAPL', 60, 0.3],
      ['TSLA', 40, 0.16],
    ]);
    expect(result.unallocatedAmount).toBe(0);
  });

  it('rounds shares DOWN so we never spend more than the allocation', () => {
    // 100 / 3 = 33.333... shares of a $1 stock
    const result = splitOrder(100, [holding('AAA', 100, 3)], 3);

    expect(result.lines[0]?.quantity).toBe(33.333);
    expect(result.lines[0]?.unallocatedAmount).toBe(0); // 100 - 33.333*3 = 0.001 -> 0.00
    expect(result.unallocatedAmount).toBe(0);
  });

  it('reports the money left over after share rounding', () => {
    const result = splitOrder(100, [holding('AAA', 100, 30)], 0);

    expect(result.lines[0]?.quantity).toBe(3);
    expect(result.unallocatedAmount).toBe(10);
  });

  it('respects the configured number of decimal places', () => {
    const holdings = [holding('AAA', 100, 3)];

    expect(splitOrder(10, holdings, 3).lines[0]?.quantity).toBe(3.333);
    expect(splitOrder(10, holdings, 7).lines[0]?.quantity).toBe(3.3333333);
    expect(splitOrder(10, holdings, 0).lines[0]?.quantity).toBe(3);
  });

  it('gives 0 shares when the allocation is smaller than one share and decimals are 0', () => {
    const result = splitOrder(10, [holding('AAA', 100, 190)], 0);

    expect(result.lines[0]?.quantity).toBe(0);
    expect(result.unallocatedAmount).toBe(10);
  });

  it('never loses a cent: amounts always add up to the total', () => {
    // $100 split three ways would be 33.33 each -> one cent is left over
    const result = splitOrder(
      100,
      [holding('A', 33.33, 10), holding('B', 33.33, 10), holding('C', 33.34, 10)],
      3,
    );

    const sum = result.lines.reduce((s, l) => s + l.amount, 0);
    expect(Math.round(sum * 100)).toBe(10000);
  });

  it('gives the spare cent to the stock with the biggest rounding remainder', () => {
    // $0.10 at 33.33/33.33/33.34 -> exact cents 3.333, 3.333, 3.334 (floors 3,3,3, one cent spare)
    const result = splitOrder(
      0.1,
      [holding('A', 33.33, 1), holding('B', 33.33, 1), holding('C', 33.34, 1)],
      3,
    );

    expect(result.lines.map((l) => l.amount)).toEqual([0.03, 0.03, 0.04]);
  });

  it('avoids floating point drift in weights (0.1 + 0.2 style)', () => {
    const result = splitOrder(10, [holding('A', 0.1, 1), holding('B', 0.2, 1), holding('C', 99.7, 1)], 3);
    expect(result.lines.map((l) => l.amount)).toEqual([0.01, 0.02, 9.97]);
  });

  it('copies the price and its source into each line', () => {
    const result = splitOrder(
      100,
      [{ symbol: 'AAPL', weight: 100, price: 190, priceSource: 'REQUEST' }],
      3,
    );
    expect(result.lines[0]).toMatchObject({ price: 190, priceSource: 'REQUEST' });
  });

  describe('validation', () => {
    const expectRuleViolation = (fn: () => unknown, message: RegExp) => {
      try {
        fn();
        throw new Error('expected splitOrder to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).status).toBe(422);
        expect((err as AppError).message).toMatch(message);
      }
    };

    it('rejects an empty portfolio', () => {
      expectRuleViolation(() => splitOrder(100, [], 3), /at least one/);
    });

    it('rejects weights that do not add up to 100', () => {
      expectRuleViolation(() => splitOrder(100, [holding('A', 60, 1), holding('B', 30, 1)], 3), /add up to 100/);
      expectRuleViolation(() => splitOrder(100, [holding('A', 60, 1), holding('B', 50, 1)], 3), /add up to 100/);
    });

    it('rejects duplicate symbols', () => {
      expectRuleViolation(() => splitOrder(100, [holding('A', 50, 1), holding('A', 50, 1)], 3), /duplicate/);
    });

    it.each([0, -5, 10.123])('rejects an invalid total of %p', (total) => {
      expectRuleViolation(() => splitOrder(total, [holding('A', 100, 1)], 3), /totalAmount/);
    });
  });
});
