---
name: IntaSend payment setup
description: Durable constraints for the mobile-money payment integration.
---

IntaSend credentials must stay server-side in Replit Secrets, and the provider callback cannot be fully exercised from the local preview; it needs the published app URL.

**Why:** The payment provider is not available as a managed workspace connector, and exposing a live credential or treating a local callback as production-ready would be unsafe.

**How to apply:** Keep `INTASEND_SECRET_KEY` out of client code and chat. Configure the provider webhook to the published app's payment callback before enabling live M-Pesa deposits.