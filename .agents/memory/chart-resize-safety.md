---
name: Chart resize safety
description: Browser runtime constraints for the Lightweight Charts resize lifecycle.
---

Chart container resize callbacks must avoid synchronous resize feedback loops: schedule dimension updates on the next animation frame, skip unchanged or zero-sized dimensions, and cancel pending frames when the chart unmounts.

**Why:** The browser surfaced a delayed uncaught runtime error while the chart and ResizeObserver repeatedly updated each other during live polling.

**How to apply:** Keep ResizeObserver callbacks guarded and frame-scheduled whenever the terminal chart lifecycle or layout is changed.