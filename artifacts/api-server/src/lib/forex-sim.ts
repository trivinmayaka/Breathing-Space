// Simulated forex price engine — in-memory random walk with mean reversion

export interface Instrument {
  base: number;
  spread: number;
  pip: number;
  dec: number;
  group: string;
  contractSize: number;
}

export const INSTRUMENTS: Record<string, Instrument> = {
  "EUR/USD": { base: 1.08542, spread: 0.00012, pip: 0.0001, dec: 5, group: "Major", contractSize: 100_000 },
  "GBP/USD": { base: 1.27380, spread: 0.00015, pip: 0.0001, dec: 5, group: "Major", contractSize: 100_000 },
  "USD/JPY": { base: 149.650, spread: 0.014,   pip: 0.01,   dec: 3, group: "Major", contractSize: 100_000 },
  "AUD/USD": { base: 0.65320, spread: 0.00018, pip: 0.0001, dec: 5, group: "Major", contractSize: 100_000 },
  "USD/CHF": { base: 0.89140, spread: 0.00015, pip: 0.0001, dec: 5, group: "Major", contractSize: 100_000 },
  "USD/CAD": { base: 1.36420, spread: 0.00020, pip: 0.0001, dec: 5, group: "Major", contractSize: 100_000 },
  "NZD/USD": { base: 0.60180, spread: 0.00022, pip: 0.0001, dec: 5, group: "Minor", contractSize: 100_000 },
  "EUR/GBP": { base: 0.85260, spread: 0.00013, pip: 0.0001, dec: 5, group: "Minor", contractSize: 100_000 },
  "EUR/JPY": { base: 162.430, spread: 0.016,   pip: 0.01,   dec: 3, group: "Cross", contractSize: 100_000 },
  "GBP/JPY": { base: 189.120, spread: 0.020,   pip: 0.01,   dec: 3, group: "Cross", contractSize: 100_000 },
  "USD/MXN": { base: 18.460, spread: 0.0040, pip: 0.001, dec: 3, group: "Minor", contractSize: 100_000 },
  "USD/ZAR": { base: 18.220, spread: 0.0060, pip: 0.001, dec: 3, group: "Minor", contractSize: 100_000 },
  "EUR/CHF": { base: 0.96220, spread: 0.00020, pip: 0.0001, dec: 5, group: "Cross", contractSize: 100_000 },
  "XAU/USD": { base: 2341.50, spread: 0.35, pip: 0.01, dec: 2, group: "Commodity", contractSize: 100 },
  "XAG/USD": { base: 28.70, spread: 0.04, pip: 0.01, dec: 2, group: "Commodity", contractSize: 5_000 },
  "USOIL":   { base: 78.20, spread: 0.05, pip: 0.01, dec: 2, group: "Commodity", contractSize: 1_000 },
  "BTC/USD": { base: 67420.0, spread: 12.0, pip: 1, dec: 2, group: "Crypto", contractSize: 1 },
  "ETH/USD": { base: 3560.0, spread: 3.0, pip: 0.01, dec: 2, group: "Crypto", contractSize: 1 },
};

export interface CandleBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Box–Muller Gaussian
function gauss(sigma: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const CANDLE_INTERVAL = 60; // seconds per bar

const _prices: Record<string, number> = {};
const _change24h: Record<string, number> = {};
const _candles: Record<string, CandleBar[]> = {};
let _lastTick = 0;

// ── Bootstrap ────────────────────────────────────────────────────────────────
(function init() {
  const now = Math.floor(Date.now() / 1000);
  for (const [pair, info] of Object.entries(INSTRUMENTS)) {
    let p = info.base * (1 + gauss(0.003));
    const bars: CandleBar[] = [];
    let t = now - CANDLE_INTERVAL * 150;
    for (let i = 0; i < 150; i++) {
      const open = p;
      const close = open + gauss(open * 0.0003);
      const hi = Math.max(open, close) * (1 + Math.abs(gauss(0.00008)));
      const lo = Math.min(open, close) * (1 - Math.abs(gauss(0.00008)));
      const dec = info.dec;
      bars.push({
        time: t,
        open:  parseFloat(open.toFixed(dec)),
        high:  parseFloat(hi.toFixed(dec)),
        low:   parseFloat(lo.toFixed(dec)),
        close: parseFloat(close.toFixed(dec)),
        volume: Math.floor(Math.random() * 4500) + 500,
      });
      p = close;
      t += CANDLE_INTERVAL;
    }
    _candles[pair] = bars;
    _prices[pair] = bars[bars.length - 1].close;
    _change24h[pair] = parseFloat(((Math.random() - 0.5) * 1.6).toFixed(4));
  }
})();

// ── Tick ─────────────────────────────────────────────────────────────────────
function tick() {
  const now = Date.now() / 1000;
  const dt = _lastTick ? Math.min(now - _lastTick, 5) : 1;
  _lastTick = now;
  const tSlot = Math.floor(now / CANDLE_INTERVAL) * CANDLE_INTERVAL;

  for (const [pair, info] of Object.entries(INSTRUMENTS)) {
    const sigma = info.base * 0.00025 * Math.sqrt(dt);
    const drift = (_prices[pair] - info.base) * -0.003;
    _prices[pair] = Math.max(
      info.base * 0.94,
      Math.min(info.base * 1.06, _prices[pair] + drift + gauss(sigma)),
    );

    const dec = info.dec;
    const cur = parseFloat(_prices[pair].toFixed(dec));
    const bars = _candles[pair];
    const last = bars[bars.length - 1];

    if (last && last.time === tSlot) {
      last.close = cur;
      last.high  = Math.max(last.high, cur);
      last.low   = Math.min(last.low, cur);
      last.volume += Math.floor(Math.random() * 18) + 1;
    } else {
      const prev = last ? last.close : cur;
      bars.push({
        time:   tSlot,
        open:   parseFloat(prev.toFixed(dec)),
        high:   parseFloat((Math.max(prev, cur) * (1 + Math.abs(gauss(0.00004)))).toFixed(dec)),
        low:    parseFloat((Math.min(prev, cur) * (1 - Math.abs(gauss(0.00004)))).toFixed(dec)),
        close:  cur,
        volume: Math.floor(Math.random() * 700) + 80,
      });
    if (bars.length > 10000) bars.shift();
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export function getPriceSnapshot(): Record<string, {
  bid: number; ask: number; mid: number; spreadPips: number;
  changePct: number; direction: string; dec: number; pip: number; group: string;
}> {
  tick();
  const snap: ReturnType<typeof getPriceSnapshot> = {};
  for (const [pair, info] of Object.entries(INSTRUMENTS)) {
    const mid  = _prices[pair];
    const bars = _candles[pair];
    const prev = bars.length >= 2 ? bars[bars.length - 2].close : mid;
    const dec  = info.dec;
    snap[pair] = {
      bid:        parseFloat((mid - info.spread / 2).toFixed(dec)),
      ask:        parseFloat((mid + info.spread / 2).toFixed(dec)),
      mid:        parseFloat(mid.toFixed(dec)),
      spreadPips: parseFloat((info.spread / info.pip).toFixed(1)),
      changePct:  _change24h[pair],
      direction:  mid >= prev ? "up" : "down",
      dec, pip: info.pip, group: info.group,
    };
  }
  return snap;
}

export function getCandleData(pairSlug: string, limit = 5000): CandleBar[] {
  tick();
  const pair = pairSlug.replace(/-/g, "/");
  return (_candles[pair] ?? []).slice(-limit);
}

export function getContractSize(pair: string): number {
  return INSTRUMENTS[pair]?.contractSize ?? 100_000;
}

export function calcMargin(pair: string, lots: number, price: number, leverage: number): number {
  const info = INSTRUMENTS[pair];
  if (!info) return 0;
  const notional = info.group === "Commodity" || info.group === "Crypto"
    ? info.contractSize * lots * price
    : info.contractSize * lots;
  return notional / Math.max(1, leverage);
}

export function calcPnl(
  pair: string, action: string, lots: number, openPrice: number, currentPrice: number,
): number {
  const info = INSTRUMENTS[pair];
  const unit = (info?.contractSize ?? 100_000) * lots;
  const diff = action === "BUY" ? currentPrice - openPrice : openPrice - currentPrice;
  const pnl = info?.group === "Major" || info?.group === "Minor" || info?.group === "Cross"
    ? pair.includes("JPY")
      ? unit * diff / currentPrice
      : unit * diff
    : unit * diff;
  return parseFloat(pnl.toFixed(2));
}
