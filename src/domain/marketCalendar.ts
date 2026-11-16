import { DateTime } from 'luxon';
import { MarketConfig } from '../config';

const SATURDAY = 6; // luxon: Monday = 1 ... Sunday = 7

const isWeekday = (date: DateTime): boolean => date.weekday < SATURDAY;

/**
 * Returns the moment an order placed at `now` should be executed.
 *
 *  - market open (Mon-Fri, between open and close): execute immediately
 *  - before the open on a weekday: execute at today's open
 *  - after the close, or on a weekend: execute at the next weekday's open
 *
 * Exchange holidays are not modelled.
 */
export function nextExecutionTime(now: Date, market: MarketConfig): Date {
  const local = DateTime.fromJSDate(now, { zone: market.timeZone });
  const atTime = (day: DateTime, t: { hour: number; minute: number }) =>
    day.set({ hour: t.hour, minute: t.minute, second: 0, millisecond: 0 });

  if (isWeekday(local)) {
    const open = atTime(local, market.open);
    const close = atTime(local, market.close);

    if (local < open) return open.toJSDate();
    if (local < close) return now;
  }

  let next = local.plus({ days: 1 });
  while (!isWeekday(next)) {
    next = next.plus({ days: 1 });
  }
  return atTime(next, market.open).toJSDate();
}
