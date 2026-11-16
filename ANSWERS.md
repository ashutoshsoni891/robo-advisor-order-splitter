# Answers

## What was your approach (thought process) to tackling this project?

I started with the core question: given weights and an amount, what are the orders? That is pure maths with no I/O, so I wrote it first as a standalone function (`src/domain/orderSplitter.ts`) and tested it heavily before adding any HTTP.

Then I built outwards in layers:

1. **Domain**: splitting money, rounding shares, and the market calendar for "when to execute". Both are pure functions. The calendar takes `now` as an argument, so tests never depend on the real clock.
2. **Services**: price lookup (request price, then fixed price, else error), and an `OrderService` that wires pricing, splitting, scheduling and saving together.
3. **Storage**: a repository interface with an in-memory `Map`. Data not surviving a restart falls out naturally, and a database can replace it later without touching the rest.
4. **HTTP**: Express routes, zod validation, one error handler that always returns the same JSON shape, and a middleware that prints response time in ms.

Two choices that shaped the maths:

- I used `decimal.js` rather than JS numbers, because `0.1 + 0.2` style errors are not acceptable for money.
- Shares are rounded **down**, so a BUY never spends more than was allocated. The money that can't be used is returned as `unallocatedAmount`, so nothing disappears silently.

Dollar amounts are allocated in whole cents with the largest remainder method, so the per-stock amounts always add back up to the total (for example $100 split three ways gives $33.33, $33.33 and $33.34, not $99.99).

## What assumptions did you make?

- **Weights are percentages** (60 means 60%) and must add up to exactly 100. I reject anything else rather than silently normalising, because that would hide client mistakes.
- **Currency is USD**, and `totalAmount` has at most 2 decimal places.
- **Price priority:** a price in the request overrides the fixed price table, as the brief says. A symbol with neither gets a 422.
- **Market hours** are 9:30 to 16:00 America/New_York, Monday to Friday. Orders outside those hours are scheduled for the next open. **Holidays are not modelled.**
- **"Execute now" when the market is open.** The API only tells the caller when to execute. It does not place trades or wait.
- **Every split is stored** as an order, so `GET /orders` returns what was split. There is no separate "confirm" step.
- **SELL uses the same maths as BUY.** The API doesn't know what the client holds, so it can't check there are enough shares to sell.
- Symbols are case-insensitive and stored in upper case.
- The brief was ambiguous in places (and parts of my copy of the PDF were hard to read), so these assumptions are the ones I'd confirm first with the product owner.

## What challenges did you face when creating your solution?

- **Rounding.** Splitting money fairly is surprisingly fiddly. Naive rounding of each line can make the total off by a cent, and rounding shares to nearest could overspend. I settled on largest remainder for cents and round-down for shares, and wrote tests for the awkward cases (three-way splits, 7 decimal places, allocations smaller than one share).
- **Time zones and daylight saving.** "Next open" must be computed in New York time, not the server's. I used luxon and added a test that crosses the March daylight saving change, where the open moves from 14:30Z to 13:30Z.
- **Deciding where validation lives.** Shape and type checks (zod) return 400. Business rules (weights, duplicates, missing price) live in the domain and return 422, so they hold no matter how the code is called.
- **Keeping it simple.** It would have been easy to over-build (DB, auth, queues). I kept the scope to what the brief asks and listed the rest below.

## If you were to migrate this to production, what changes and controls would you put in place?

**Security**
- Authentication and authorisation (OAuth2/JWT or API keys per client), and scoping so a client only sees its own orders.
- TLS everywhere, a WAF or API gateway, rate limiting, `helmet` headers, and strict CORS.
- Input limits (already a 100 KB body cap and 100-stock cap), plus audit logging of who created what. No sensitive data in logs.
- Dependency scanning (`npm audit`, Dependabot), a pinned base image, and a non-root container.

**Correctness and data**
- Replace the in-memory repository with a database (e.g. PostgreSQL) behind the existing interface. Store money as decimals or integer cents.
- **Idempotency keys** on `POST` so a retried request doesn't create a duplicate order.
- Real market data provider for prices, with staleness checks, instead of a fixed table. Reject orders priced off stale data.
- An exchange calendar service for holidays and early closes.
- For SELL: check current holdings, and handle fractional-share and minimum order rules per broker.
- Order lifecycle (pending, executed, failed, cancelled) and a worker that actually places orders at `executionTime`.

**Operations**
- Structured JSON logs with request IDs, metrics (latency percentiles, error rates) and tracing instead of console timing; alerts on SLOs.
- Health and readiness probes, graceful shutdown, containerised deployment with CI running lint, tests and build on every PR.
- API versioning (already under `/api/v1`) and an OpenAPI spec for consumers.
- Load testing; the split logic is CPU-light, so the main risk is dependencies such as price feeds and the database.

## Did you use AI tools? How did they help?

> **Note to self before submitting:** this section must describe your own experience honestly. The draft below describes how this project was built; edit it so it is accurate and in your words, and make sure you can explain every part of the code in the interview.

Yes. I used Claude Code (Anthropic's CLI assistant) as a pair programmer. The brief explicitly allows AI tools, so I want to be clear about where it helped and where I made the decisions.

- **Planning:** I had it read the brief and propose a stack and layered structure, which I reviewed and approved before any code was written.
- **Money maths:** It suggested the largest remainder method to keep cent amounts adding up to the total, and I asked for round-down for shares. I checked the results by hand, for example $100 split 60/40 at $190 and $250 gives 0.315 and 0.16 shares.
- **Tests:** It generated a first set of edge-case tests (weekend and Friday rollover, daylight saving, duplicate symbols, 0 to 7 decimal places, malformed JSON). I ran them and used the coverage report to find gaps (the 413 and 500 paths), which led to extra tests.
- **Tooling friction:** Node wasn't installed on my machine, so the build and tests were run inside a Docker container. It also helped debug a slow-start problem in that setup, which was bind-mount file speed, not an app bug.
- **What I did myself:** chose the scope, reviewed every file, simplified a response-time header hack it first wrote (I only wanted the console log the brief asks for), and decided the assumptions listed above.
