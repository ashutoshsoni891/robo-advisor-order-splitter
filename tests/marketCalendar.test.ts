import { MarketConfig } from '../src/config';
import { nextExecutionTime } from '../src/domain/marketCalendar';

const market: MarketConfig = {
  timeZone: 'America/New_York',
  open: { hour: 9, minute: 30 },
  close: { hour: 16, minute: 0 },
};

const next = (iso: string) => nextExecutionTime(new Date(iso), market).toISOString();

describe('nextExecutionTime', () => {
  // January: New York is on EST (UTC-5), so 9:30 open = 14:30Z
  it('executes immediately while the market is open', () => {
    expect(next('2024-01-08T15:00:00Z')).toBe('2024-01-08T15:00:00.000Z'); // Mon 10:00 ET
  });

  it('waits for the open on a weekday morning', () => {
    expect(next('2024-01-08T12:00:00Z')).toBe('2024-01-08T14:30:00.000Z'); // Mon 07:00 ET
  });

  it('treats the open as inclusive and the close as exclusive', () => {
    expect(next('2024-01-08T14:30:00Z')).toBe('2024-01-08T14:30:00.000Z'); // exactly 9:30
    expect(next('2024-01-08T21:00:00Z')).toBe('2024-01-09T14:30:00.000Z'); // exactly 16:00
  });

  it('rolls to the next day after the close', () => {
    expect(next('2024-01-09T22:00:00Z')).toBe('2024-01-10T14:30:00.000Z'); // Tue 17:00 ET -> Wed
  });

  it('rolls from Friday evening to Monday', () => {
    expect(next('2024-01-12T22:00:00Z')).toBe('2024-01-15T14:30:00.000Z');
  });

  it('rolls from Saturday and Sunday to Monday', () => {
    expect(next('2024-01-13T15:00:00Z')).toBe('2024-01-15T14:30:00.000Z');
    expect(next('2024-01-14T15:00:00Z')).toBe('2024-01-15T14:30:00.000Z');
  });

  it('uses the exchange time zone, not the server time zone', () => {
    // 03:00Z Tuesday is still Monday 22:00 in New York -> next open is Tuesday
    expect(next('2024-01-09T03:00:00Z')).toBe('2024-01-09T14:30:00.000Z');
  });

  it('handles daylight saving time (9:30 EDT = 13:30Z)', () => {
    // DST started Sunday 2024-03-10
    expect(next('2024-03-08T22:00:00Z')).toBe('2024-03-11T13:30:00.000Z');
  });
});
