---
name: Binance ticker price field
description: The correct field name for current price in Binance 24hr ticker API responses.
---

# Binance 24hr ticker price field

## The rule
`GET /api/v3/ticker/24hr` returns `lastPrice` as the current price, NOT `price`.

**Why:** The Binance REST API uses `lastPrice` for the current trading price in the 24hr statistics endpoint. The `price` field is not present in this endpoint's response (it's used in other endpoints like `/api/v3/ticker/price`).

## How to apply
Always map: `price: Number(t.lastPrice || t.price || "0")` when processing ticker data from `getTickers()`.

The `BinanceTicker` interface should declare:
```ts
interface BinanceTicker {
  lastPrice: string;   // current price from 24hr ticker
  price?: string;      // optional fallback
  ...
}
```
