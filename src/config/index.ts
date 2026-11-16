export interface MarketConfig {
  /** IANA time zone the exchange runs in. */
  timeZone: string;
  open: { hour: number; minute: number };
  close: { hour: number; minute: number };
}

export interface AppConfig {
  port: number;
  /** Max decimal places allowed for a share quantity. */
  shareDecimals: number;
  market: MarketConfig;
}

export const MAX_SHARE_DECIMALS = 7;

const DEFAULT_MARKET: MarketConfig = {
  timeZone: 'America/New_York',
  open: { hour: 9, minute: 30 },
  close: { hour: 16, minute: 0 },
};

function readInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer, got "${raw}"`);
  }
  return value;
}

/** Reads settings from the environment and fails fast on bad values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = readInt(env.PORT, 3000, 'PORT');
  const shareDecimals = readInt(env.SHARE_DECIMALS, 3, 'SHARE_DECIMALS');

  if (port < 1 || port > 65535) {
    throw new Error(`PORT must be between 1 and 65535, got ${port}`);
  }
  if (shareDecimals < 0 || shareDecimals > MAX_SHARE_DECIMALS) {
    throw new Error(`SHARE_DECIMALS must be between 0 and ${MAX_SHARE_DECIMALS}, got ${shareDecimals}`);
  }

  return { port, shareDecimals, market: DEFAULT_MARKET };
}
