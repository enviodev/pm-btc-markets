# Polymarket BTC 5-min Market Indexer

Envio HyperIndex for Polymarket's "BTC Up or Down 5m" markets on Polygon.

## What it does

- **OrderFilled events** — indexes `OrderFilled` from the three CTFExchangeV2
  contracts on Polygon. Derives a price from `makerAmountFilled` /
  `takerAmountFilled` (orientation depends on `side`).
- **Market filter** — only fills whose `tokenId` corresponds to an active
  Polymarket BTC 5-min market are persisted. Other tokens are dropped at
  the handler.
- **Market sync (block handler)** — every ~150 blocks (~5 min on Polygon),
  sweeps the past 24h of 5-min slots, calls
  `https://gamma-api.polymarket.com/events/slug/btc-updown-5m-{slot}` via
  the Effect API (cached, rate-limited), and upserts a `Market` entity per
  `clobTokenId` (Up + Down). Markets whose `endDate` is older than
  24h + 5min are deleted.
- **Window** — `start_block` is set ~48h before the head; the Market table
  tracks the past 24h. So roughly the first day of fills is filtered out
  (no matching markets), and the second day is indexed against live
  markets.

## Schema

- `Market` — keyed by `tokenId` (`clobTokenId`). Holds `slug`,
  `conditionId`, `outcome` (`"Up"` or `"Down"`), `slotTimestamp`,
  `endDate`.
- `OrderFill` — keyed by `${chainId}_${blockNumber}_${logIndex}`, references
  `Market`.

## Run locally

```bash
pnpm install
pnpm codegen           # after any schema.graphql / config.yaml change
TUI_OFF=true pnpm dev  # run indexer with AI-friendly logs
```

GraphQL: https://envio.dev/console

Other useful commands:

```bash
pnpm tsc --noEmit      # type-check
pnpm test              # vitest
```

## Env

- `ENVIO_API_TOKEN` — required for HyperSync data source.

## Notes
