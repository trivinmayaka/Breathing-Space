---
name: Forex terminal safety boundaries
description: Durable product boundaries for simulated pricing, internal ledger balances, and verified funding flows.
---

The terminal must visibly identify its market feed as simulated practice data, and account balances as an internal trading ledger rather than broker custody or guaranteed liquidity.

**Why:** The product currently uses an in-memory random-walk feed and provider-confirmed deposits; presenting either as a live broker execution or instantly verified funding would be misleading and unsafe.

**How to apply:** Keep order, margin, alert, and chart features functional as simulator features. Keep funding methods disabled unless they have a verifiable provider callback or an explicit admin review path, and keep pending states visible until confirmation.