# Robo-Advisor Order Splitter

A small REST API for a robo-advisor. You send a model portfolio (stocks and percentage weights) plus a total amount and a BUY or SELL. It answers with the dollar amount and number of shares for each stock, and when the orders should be executed. Orders are kept in memory, so history disappears when the app restarts.

Written in Node.js and TypeScript. See [ANSWERS.md](ANSWERS.md) for the design discussion.

## Run it

Requires Node.js 20 or newer.

```bash
npm install
npm run build
npm start            # http://localhost:3000
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-reload (tsx) |
| `npm test` | Run the unit and API tests |
| `npm run test:coverage` | Tests with a coverage report |
| `npm run lint` | ESLint |

### Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `SHARE_DECIMALS` | `3` | Max decimal places for share quantities, 0 to 7. Quantities are rounded **down** |

```bash
SHARE_DECIMALS=7 npm start                  # macOS / Linux
$env:SHARE_DECIMALS=7; npm start            # Windows PowerShell
```

The app refuses to start if either value is invalid. Response times are printed to the console for every request:

```
POST /api/v1/orders/split 201 - 3.42 ms
```

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/orders/split` | Split an amount across a portfolio and store the order (201) |
| `GET` | `/api/v1/orders` | Historic orders, newest first. Optional `?orderType=BUY&symbol=AAPL` |
| `GET` | `/api/v1/orders/:id` | One order (404 if unknown) |
| `GET` | `/health` | Liveness check |

### POST /api/v1/orders/split

Request body:

| Field | Type | Notes |
|---|---|---|
| `orderType` | `"BUY"` or `"SELL"` | required |
| `totalAmount` | number | required, 0.01 to 1,000,000,000, max 2 decimal places (USD) |
| `portfolio` | array | required, 1 to 100 stocks |
| `portfolio[].symbol` | string | ticker, case-insensitive |
| `portfolio[].weight` | number | percentage, 0.01 to 100. All weights must add up to exactly 100 |
| `portfolio[].price` | number, optional | current market price. 0.01 to 10,000,000. **If sent, it overrides the default price ($100)** |

```bash
curl -X POST http://localhost:3000/api/v1/orders/split \
  -H "Content-Type: application/json" \
  -d '{
    "orderType": "BUY",
    "totalAmount": 100,
    "portfolio": [
      { "symbol": "AAPL", "weight": 60 },
      { "symbol": "TSLA", "weight": 40, "price": 245.10 }
    ]
  }'
```

Response `201 Created`:

```json
{
  "id": "b1ea2e69-f7fc-4750-9648-6b051419d061",
  "orderType": "BUY",
  "totalAmount": 100,
  "lines": [
    { "symbol": "AAPL", "weight": 60, "amount": 60, "price": 100, "priceSource": "DEFAULT",
      "quantity": 0.6, "unallocatedAmount": 0 },
    { "symbol": "TSLA", "weight": 40, "amount": 40, "price": 245.1, "priceSource": "REQUEST",
      "quantity": 0.163, "unallocatedAmount": 0.05 }
  ],
  "unallocatedAmount": 0.05,
  "executionTime": "2024-01-15T14:30:00.000Z",
  "createdAt": "2024-01-13T15:00:00.000Z"
}
```

- `amount` is the dollar value allocated to that stock.
- `quantity` is the number of shares, rounded down to `SHARE_DECIMALS`.
- `unallocatedAmount` is the small amount that can't be traded because of that rounding.
- `executionTime` is when to send the order (see below).

### Execution time

Markets are open Monday to Friday, 9:30 to 16:00 New York time.

- Placed while the market is open: `executionTime` is now.
- Placed before the open on a weekday: today's open.
- Placed after the close, on a weekend: the next weekday's open.

Exchange holidays are not modelled.

### Errors

Every error has the same shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "request validation failed",
             "details": [{ "path": "totalAmount", "message": "Number must be greater than 0" }] } }
```

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad shape or types, values outside the limits, malformed JSON, unknown fields, order id that is not a UUID |
| 404 | `NOT_FOUND` | Unknown order or route |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 100 KB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Request body is not `application/json` |
| 422 | `BUSINESS_RULE_VIOLATION` | Weights not adding up to 100, duplicate symbols |
| 500 | `INTERNAL_ERROR` | Anything unexpected (details are logged, not returned) |

### Default price

Any stock without a `price` in the request is priced at **$100** (`priceSource: "DEFAULT"`). A price in the request always wins (`priceSource: "REQUEST"`). The default lives in [src/config/prices.ts](src/config/prices.ts).

## Project layout

```
src/
  server.ts                 start-up
  app.ts                    builds the Express app (also used by tests)
  config/                   env settings and default price
  domain/                   pure logic: orderSplitter, marketCalendar, types
  services/                 priceService, orderService (glue)
  repositories/             order storage (in-memory behind an interface)
  http/                     routes, zod schemas, middleware (timing, errors)
tests/                      unit tests plus API tests with supertest
```

## Dependencies

| Package | Why |
|---|---|
| express | HTTP server and routing |
| zod | Validates request bodies and query strings |
| decimal.js | Exact decimal maths, so money and share quantities don't suffer floating point errors |
| luxon | Time zone and daylight saving handling for the market calendar |
| typescript, tsx | Language and dev runner |
| jest, ts-jest, supertest | Unit and API tests |
| eslint, typescript-eslint | Linting |
