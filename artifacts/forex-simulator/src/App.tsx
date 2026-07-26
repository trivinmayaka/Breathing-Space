import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import { Terminal } from './pages/Terminal';
import { OwnerTerminal } from './pages/OwnerTerminal';
import LiveAuth from './pages/LiveAuth';
import { LiveTerminal } from './pages/LiveTerminal';

const BRAND = 'TrivinFX';
const BRAND_SUB = 'Pro';
const API = '/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function Logo({ size = 'md', light = false }: { size?: 'sm' | 'md' | 'lg'; light?: boolean }) {
  const sz = { sm: 'text-sm', md: 'text-xl', lg: 'text-2xl' }[size];
  const ico = { sm: 'w-6 h-6 text-[10px]', md: 'w-8 h-8 text-sm', lg: 'w-10 h-10 text-base' }[size];
  return (
    <div className="flex items-center gap-2 select-none">
      <div className={`${ico} rounded-lg brand-gradient flex items-center justify-center font-black text-white shadow-lg shrink-0`}>T</div>
      <span className={`font-bold ${sz} tracking-tight ${light ? 'text-white' : 'text-foreground'}`}>
        {BRAND}<span className="brand-gradient-text">{BRAND_SUB}</span>
      </span>
    </div>
  );
}

// ─── Ticker strip ─────────────────────────────────────────────────────────────
const TICKER_PAIRS = [
  { pair: 'EUR/USD', base: 1.0872 },
  { pair: 'GBP/USD', base: 1.2741 },
  { pair: 'USD/JPY', base: 149.82 },
  { pair: 'AUD/USD', base: 0.6521 },
  { pair: 'USD/CAD', base: 1.3587 },
  { pair: 'USD/CHF', base: 0.8923 },
  { pair: 'NZD/USD', base: 0.5987 },
  { pair: 'EUR/GBP', base: 0.8532 },
  { pair: 'EUR/JPY', base: 162.74 },
  { pair: 'GBP/JPY', base: 190.83 },
  { pair: 'XAU/USD', base: 2341.50 },
  { pair: 'BTC/USD', base: 67420.0 },
];

function useLiveTicker() {
  const [prices, setPrices] = useState(() =>
    TICKER_PAIRS.map(p => ({ ...p, price: p.base, change: (Math.random() - 0.48) * 0.003, dir: Math.random() > 0.5 ? 1 : -1 }))
  );
  useEffect(() => {
    const id = setInterval(() => {
      setPrices(prev => prev.map(p => {
        const drift = (Math.random() - 0.5) * 0.0008 * p.base;
        const np = p.price + drift;
        const change = ((np - p.base) / p.base) * 100;
        return { ...p, price: np, change, dir: drift >= 0 ? 1 : -1 };
      }));
    }, 1200);
    return () => clearInterval(id);
  }, []);
  return prices;
}

function TickerStrip() {
  const prices = useLiveTicker();
  const doubled = [...prices, ...prices];
  return (
    <div className="overflow-hidden bg-[hsl(220_28%_6%)] border-y border-border/60 py-0" style={{ height: 36 }}>
      <div className="flex items-center h-full ticker-scroll gap-0">
        {doubled.map((p, i) => (
          <div key={i} className="flex items-center gap-3 px-5 shrink-0 border-r border-border/30 h-full">
            <span className="text-[11px] font-bold text-foreground/70 tracking-wider">{p.pair}</span>
            <span className={`text-[12px] font-mono font-bold ${p.dir >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {p.price < 10 ? p.price.toFixed(4) : p.price < 1000 ? p.price.toFixed(3) : p.price.toFixed(1)}
            </span>
            <span className={`text-[10px] font-semibold ${p.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {p.change >= 0 ? '+' : ''}{p.change.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Demo Login Modal ─────────────────────────────────────────────────────────
function DemoLoginModal({ onLogin, onClose }: { onLogin: () => void; onClose: () => void }) {
  const [user, setUser] = useState('demo');
  const [pass, setPass] = useState('demo');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      if (user === 'demo' && pass === 'demo') { onLogin(); }
      else { setErr('Invalid credentials. Use demo / demo'); setLoading(false); }
    }, 700);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-[hsl(220_28%_7%)] border border-border rounded-2xl shadow-2xl p-8 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Demo Account Login</h2>
            <p className="text-xs text-muted-foreground">$10,000 virtual funds — risk free</p>
          </div>
        </div>

        <div className="mb-5 bg-blue-500/8 border border-blue-500/20 rounded-lg px-4 py-3 text-[11px] text-blue-300/80">
          Practice credentials: <span className="font-mono text-blue-200 font-semibold">demo</span> / <span className="font-mono text-blue-200 font-semibold">demo</span>
        </div>

        {err && (
          <div className="mb-4 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {err}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Account ID</label>
            <input value={user} onChange={e => setUser(e.target.value)} autoComplete="username"
              className="w-full h-11 bg-[hsl(var(--input))] border border-border rounded-lg px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Password</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} autoComplete="current-password"
              className="w-full h-11 bg-[hsl(var(--input))] border border-border rounded-lg px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full h-12 brand-gradient text-white font-bold rounded-xl text-sm disabled:opacity-70 flex items-center justify-center gap-2 shadow-lg mt-2">
            {loading ? (
              <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Connecting…</>
            ) : 'Launch Demo Terminal'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
function LandingPage({ onDemo, onReal }: { onDemo: () => void; onReal: () => void }) {
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const prices = useLiveTicker();

  const NAV_LINKS = ['Markets', 'Platforms', 'Education', 'Analytics', 'Support'];
  const instruments = prices.slice(0, 8);

  return (
    <div className="min-h-screen bg-background landing-scroll">
      {showDemoModal && <DemoLoginModal onLogin={onDemo} onClose={() => setShowDemoModal(false)} />}

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-40 bg-[hsl(220_28%_5%/0.95)] backdrop-blur-md border-b border-border/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-16 gap-6">
          <Logo size="md" />

          <div className="hidden lg:flex items-center gap-1 ml-4">
            {NAV_LINKS.map(l => (
              <button key={l} className="px-3.5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-white/5">
                {l}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button onClick={() => setShowDemoModal(true)}
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:border-primary/40 hover:text-primary transition-all">
              Demo Login
            </button>
            <button onClick={onReal}
              className="flex items-center gap-2 px-4 py-2 rounded-lg brand-gradient text-white text-sm font-bold shadow-lg hover:opacity-90 transition-opacity">
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              Real Account
            </button>
            <button className="lg:hidden ml-1 p-2 rounded-lg hover:bg-white/5 text-muted-foreground" onClick={() => setMobileMenuOpen(v => !v)}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-border bg-[hsl(220_28%_6%)] px-4 py-3 space-y-1">
            {NAV_LINKS.map(l => (
              <button key={l} className="block w-full text-left px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground rounded-lg">{l}</button>
            ))}
            <div className="pt-2 border-t border-border mt-2">
              <button onClick={() => { setMobileMenuOpen(false); setShowDemoModal(true); }} className="block w-full text-left px-3 py-2.5 text-sm text-muted-foreground">Demo Login</button>
            </div>
          </div>
        )}
      </nav>

      {/* ── Live Ticker ── */}
      <TickerStrip />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* bg glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[600px] h-[400px] rounded-full opacity-[0.07]" style={{ background: 'radial-gradient(circle, hsl(215,90%,55%), transparent 70%)' }} />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[300px] rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, hsl(185,80%,45%), transparent 70%)' }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-20">
          {/* Badge */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-xs font-semibold text-blue-300 uppercase tracking-widest">
              <span className="live-dot" style={{ width: 6, height: 6, background: '#60a5fa', boxShadow: 'none' }} />
              Institutional-Grade Trading Platform
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-center text-5xl sm:text-6xl font-black leading-tight text-foreground mb-5">
            Trade Forex Like<br />
            <span className="brand-gradient-text">a Professional</span>
          </h1>
          <p className="text-center text-muted-foreground text-lg max-w-2xl mx-auto mb-14 leading-relaxed">
            Access 50+ currency pairs, commodities &amp; crypto with real-time pricing,
            institutional-grade charting, and one-click order execution.
          </p>

          {/* ★ ACCOUNT CHOICE CARDS ★ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-16">
            {/* Demo Card */}
            <div className="group relative rounded-2xl border-2 border-border hover:border-blue-500/50 bg-[hsl(220_25%_8%)] hover:bg-[hsl(220_25%_9%)] transition-all duration-300 overflow-hidden cursor-pointer"
              onClick={() => setShowDemoModal(true)}>
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-t-2xl" />
              <div className="p-7">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                    </svg>
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-full">Free</span>
                </div>
                <h2 className="text-xl font-black text-foreground mb-1">Demo Account</h2>
                <p className="text-sm text-muted-foreground mb-5">Practice trading with virtual funds. Zero risk, full features.</p>

                <div className="space-y-2.5 mb-6">
                  {[
                    ['Starting Balance', '$10,000 Virtual'],
                    ['Risk', 'Zero — no real money'],
                    ['Access', 'Instant, no verification'],
                    ['Instruments', '50+ pairs & commodities'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-semibold text-foreground">{v}</span>
                    </div>
                  ))}
                </div>

                <button className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 group-hover:shadow-lg group-hover:shadow-blue-900/40">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"/></svg>
                  Open Demo Account
                </button>
                <p className="text-center text-[11px] text-muted-foreground/60 mt-3">Use: demo / demo</p>
              </div>
            </div>

            {/* Real Card */}
            <div className="group relative rounded-2xl border-2 border-emerald-700/40 hover:border-emerald-500/60 bg-[hsl(150_20%_7%)] hover:bg-[hsl(150_20%_8%)] transition-all duration-300 overflow-hidden cursor-pointer"
              onClick={onReal}>
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-600 to-teal-500 rounded-t-2xl" />
              {/* glow */}
              <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgb(16 185 129 / 0.05), transparent 60%)' }} />
              <div className="p-7 relative">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                    </svg>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                    <span className="live-dot" style={{ width: 5, height: 5 }} />
                    Live
                  </div>
                </div>
                <h2 className="text-xl font-black text-foreground mb-1">Real Account</h2>
                <p className="text-sm text-muted-foreground mb-5">Live trading terminal with full owner controls and unlimited access.</p>

                <div className="space-y-2.5 mb-6">
                  {[
                    ['Starting Balance', '$100,000 (adjustable)'],
                    ['Lot Size', 'Unlimited'],
                    ['Controls', 'Full owner access'],
                    ['Admin Panel', 'Manage all accounts'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-semibold text-emerald-300">{v}</span>
                    </div>
                  ))}
                </div>

                <button className="w-full h-12 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 group-hover:shadow-lg group-hover:shadow-emerald-900/40">
                  <span className="live-dot" style={{ width: 6, height: 6 }} />
                  Access Real Account
                </button>
                <p className="text-center text-[11px] text-muted-foreground/60 mt-3">Owner authentication required</p>
              </div>
            </div>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-8 text-[11px] text-muted-foreground/60 uppercase tracking-widest font-semibold">
            {['256-bit SSL Encryption', '24/5 Market Access', '50+ Instruments', 'Real-time Execution', 'No Hidden Fees'].map(b => (
              <div key={b} className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                {b}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Live Markets Table ── */}
      <section className="border-t border-border/50 bg-[hsl(220_25%_6%)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-[11px] text-blue-400 uppercase tracking-widest font-bold mb-1">Live Markets</p>
              <h2 className="text-2xl font-black text-foreground">Real-Time Prices</h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
              <span className="live-dot" />
              Live Feed
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-[hsl(220_25%_8%)]">
                  {['Instrument', 'Bid', 'Ask', 'Spread', '24h Change', 'Action'].map(h => (
                    <th key={h} className="text-left px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {instruments.map((p, i) => {
                  const spread = p.pair.includes('JPY') ? 0.8 : p.pair.includes('XAU') ? 0.35 : p.pair.includes('BTC') ? 12 : 0.2;
                  const bid = p.price - (p.pair.includes('JPY') ? 0.004 : p.pair.includes('BTC') ? 6 : 0.00010);
                  const ask = bid + (p.pair.includes('JPY') ? 0.008 : p.pair.includes('BTC') ? 12 : 0.00020);
                  const dp = p.pair.includes('JPY') ? 3 : p.pair.includes('XAU') ? 2 : p.pair.includes('BTC') ? 1 : 5;
                  return (
                    <tr key={i} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-bold text-foreground">{p.pair}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{p.pair.includes('BTC') ? 'Crypto' : p.pair.includes('XAU') ? 'Commodity' : 'Forex'}</div>
                      </td>
                      <td className="px-5 py-4 font-mono font-semibold text-foreground">{bid.toFixed(dp)}</td>
                      <td className="px-5 py-4 font-mono font-semibold text-foreground">{ask.toFixed(dp)}</td>
                      <td className="px-5 py-4 text-muted-foreground font-mono">{spread}</td>
                      <td className="px-5 py-4">
                        <span className={`font-mono font-semibold ${p.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {p.change >= 0 ? '+' : ''}{p.change.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <button onClick={() => setShowDemoModal(true)} className="px-3.5 py-1.5 rounded-lg brand-gradient text-white text-xs font-bold hover:opacity-90 transition-opacity">
                          Trade
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Platform Features ── */}
      <section className="border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center mb-12">
            <p className="text-[11px] text-blue-400 uppercase tracking-widest font-bold mb-2">Why TrivinFX Pro</p>
            <h2 className="text-3xl font-black text-foreground">Everything You Need to Trade</h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">Professional-grade tools used by institutional traders, available to everyone.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />,
                title: 'Advanced Charting',
                desc: 'Professional candlestick charts with multiple timeframes, technical indicators, and drawing tools.',
                color: 'blue',
              },
              {
                icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />,
                title: 'Real-Time Prices',
                desc: 'Live streaming bid/ask prices across 50+ instruments with millisecond refresh rates.',
                color: 'cyan',
              },
              {
                icon: <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />,
                title: 'One-Click Trading',
                desc: 'Instant order execution with market orders, custom lot sizes, and real-time P&L tracking.',
                color: 'violet',
              },
              {
                icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />,
                title: 'Trade History',
                desc: 'Complete record of all open and closed positions with detailed P&L and performance analytics.',
                color: 'emerald',
              },
              {
                icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />,
                title: 'Account Management',
                desc: 'Full admin dashboard to manage user accounts, adjust balances, and monitor platform activity.',
                color: 'amber',
              },
              {
                icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />,
                title: 'Secure & Private',
                desc: 'End-to-end encrypted sessions, secure admin authentication, and isolated account data.',
                color: 'rose',
              },
            ].map(f => {
              const colors: Record<string, string> = {
                blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
                cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
                violet: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
                emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
                amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
                rose: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
              };
              return (
                <div key={f.title} className="card-panel p-6 hover:border-border/80 transition-colors">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-4 ${colors[f.color]}`}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>{f.icon}</svg>
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Account Comparison Banner ── */}
      <section className="border-t border-border/50 bg-[hsl(220_25%_6%)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center mb-10">
            <p className="text-[11px] text-blue-400 uppercase tracking-widest font-bold mb-2">Account Types</p>
            <h2 className="text-3xl font-black text-foreground">Choose Your Account</h2>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[hsl(220_25%_8%)] border-b border-border">
                  <th className="text-left px-6 py-4 text-muted-foreground font-semibold">Feature</th>
                  <th className="px-6 py-4 text-center">
                    <div className="text-blue-400 font-bold text-base">Demo</div>
                    <div className="text-[11px] text-muted-foreground">Practice Account</div>
                  </th>
                  <th className="px-6 py-4 text-center">
                    <div className="text-emerald-400 font-bold text-base flex items-center justify-center gap-1.5"><span className="live-dot" />Real</div>
                    <div className="text-[11px] text-muted-foreground">Live Account</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Starting Balance', '$10,000 Virtual', '$100,000 (editable)'],
                  ['Real Money Risk', 'None', 'None (simulated)'],
                  ['Trading Instruments', '50+ pairs', '50+ pairs'],
                  ['Lot Size Limit', 'Standard', 'Unlimited'],
                  ['Candlestick Charts', '✓', '✓'],
                  ['Position Management', '✓', '✓'],
                  ['Trade History', '✓', '✓'],
                  ['Balance Adjustment', '—', '✓ Click to edit'],
                  ['Admin Dashboard', '—', '✓ Full access'],
                  ['Account Reset', '✓', '✓ Restore to $100k'],
                ].map(([feat, demo, real], i) => (
                  <tr key={i} className={`border-b border-border/50 ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
                    <td className="px-6 py-3.5 text-muted-foreground">{feat}</td>
                    <td className="px-6 py-3.5 text-center font-semibold text-blue-300">{demo}</td>
                    <td className="px-6 py-3.5 text-center font-semibold text-emerald-300">{real}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <button onClick={() => setShowDemoModal(true)}
              className="flex items-center justify-center gap-2 h-13 px-10 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-base transition-all shadow-lg shadow-blue-900/30">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"/></svg>
              Start Demo Trading
            </button>
            <button onClick={onReal}
              className="flex items-center justify-center gap-2 h-13 px-10 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-base transition-all shadow-lg shadow-emerald-900/30">
              <span className="live-dot" style={{ width: 7, height: 7 }} />
              Access Real Account
            </button>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section className="border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            {[
              { val: '50+', label: 'Trading Instruments' },
              { val: '0.0', label: 'Pip Spreads from' },
              { val: '24/5', label: 'Market Hours' },
              { val: '<1ms', label: 'Order Execution' },
            ].map(s => (
              <div key={s.label}>
                <div className="text-4xl font-black brand-gradient-text mb-1">{s.val}</div>
                <div className="text-sm text-muted-foreground uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/50 bg-[hsl(220_28%_5%)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-8">
            <Logo size="md" />
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground/60">
              {['Terms of Service', 'Privacy Policy', 'Risk Disclosure', 'Cookie Policy', 'Contact'].map(l => (
                <a key={l} href="#" className="hover:text-foreground transition-colors">{l}</a>
              ))}
            </div>
          </div>
          <div className="border-t border-border/40 pt-6 text-[11px] text-muted-foreground/40 leading-relaxed max-w-4xl">
            <strong className="text-muted-foreground/60">Risk Warning:</strong> {BRAND}{BRAND_SUB} is a simulated trading platform provided strictly for educational and practice purposes. 
            All accounts use virtual funds only — no real money is deposited, traded, or at risk. 
            Past simulated performance is not indicative of future results. 
            CFDs are complex instruments and come with a high risk of losing money rapidly. 
            Please ensure you fully understand the risks involved before trading real financial instruments.
          </div>
          <div className="mt-4 text-[11px] text-muted-foreground/30">
            © {new Date().getFullYear()} {BRAND}{BRAND_SUB}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Admin Hub ────────────────────────────────────────────────────────────────
function AdminHub({ onDashboard, onRealAccount, onLogout }: {
  onDashboard: () => void; onRealAccount: () => void; onLogout: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between px-6 h-14 border-b border-border bg-panel">
        <Logo size="sm" />
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-muted-foreground/60 uppercase tracking-widest font-semibold">Owner Portal</span>
          <div className="w-px h-4 bg-border" />
          <button onClick={onLogout} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Sign Out</button>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <div className="mb-10">
            <p className="text-[11px] text-blue-400/80 uppercase tracking-widest font-semibold mb-2">Owner Portal</p>
            <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
            <p className="text-muted-foreground text-sm mt-1">Select your workspace below</p>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <button onClick={onRealAccount} className="group card-panel p-7 text-left hover:border-emerald-600/40 hover:bg-emerald-950/10 transition-all">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                  </svg>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="live-dot" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Live Account</span>
                </div>
              </div>
              <h2 className="text-base font-bold text-foreground mb-1.5">Trading Terminal</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">Your personal live account with full owner controls. Set any balance, unlimited lots, real-time execution.</p>
              <div className="mt-5 flex items-center gap-1 text-[11px] text-emerald-500/60 font-semibold uppercase tracking-widest group-hover:text-emerald-400 transition-colors">
                Open Terminal <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </div>
            </button>

            <button onClick={onDashboard} className="group card-panel p-7 text-left hover:border-blue-600/40 hover:bg-blue-950/10 transition-all">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                  </svg>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Management</span>
              </div>
              <h2 className="text-base font-bold text-foreground mb-1.5">Admin Dashboard</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">Manage all practice accounts, view platform analytics, adjust balances, and configure user access.</p>
              <div className="mt-5 flex items-center gap-1 text-[11px] text-blue-500/60 font-semibold uppercase tracking-widest group-hover:text-blue-400 transition-colors">
                Open Dashboard <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
type View = 'landing' | 'demo-dash' | 'admin-login' | 'admin-hub' | 'admin-dash' | 'real-account' | 'live-auth' | 'live-dash';

export default function App() {
  const [view, setView] = useState<View>(() => {
    if (localStorage.getItem('admin_auth') === '1') return 'admin-hub';
    if (localStorage.getItem('fx_demo_auth') === '1') return 'demo-dash';
    if (localStorage.getItem('fx_live_auth') === '1') return 'live-dash';
    return 'landing';
  });

  // Control body overflow: allow scroll on landing, hide on terminals
  useEffect(() => {
    const terminals = ['demo-dash', 'real-account', 'live-dash'];
    document.body.style.overflow = terminals.includes(view) ? 'hidden' : 'auto';
    return () => { document.body.style.overflow = ''; };
  }, [view]);

  function demoLogin()  { localStorage.setItem('fx_demo_auth', '1'); setView('demo-dash'); }
  function demoLogout() { localStorage.removeItem('fx_demo_auth'); setView('landing'); }
  function adminLogin() { localStorage.setItem('admin_auth', '1'); setView('admin-hub'); }
  function adminLogout() {
    localStorage.removeItem('admin_auth');
    fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
    setView('landing');
  }
  function liveLogin() { localStorage.setItem('fx_live_auth', '1'); setView('live-dash'); }
  function liveLogout() {
    localStorage.removeItem('fx_live_auth');
    fetch('/api/live/logout', { method: 'POST' }).catch(() => {});
    setView('landing');
  }

  return (
    <>
      {view === 'landing'      && <LandingPage onDemo={demoLogin} onReal={() => setView('live-auth')} />}
      {view === 'demo-dash'    && <Terminal onLogout={demoLogout} />}
      {view === 'live-auth'    && <LiveAuth onLogin={liveLogin} onBack={() => setView('landing')} />}
      {view === 'live-dash'    && <LiveTerminal onLogout={liveLogout} />}
      {view === 'admin-login'  && <AdminLogin onLogin={adminLogin} onBack={() => setView('landing')} />}
      {view === 'admin-hub'    && <AdminHub onDashboard={() => setView('admin-dash')} onRealAccount={() => setView('real-account')} onLogout={adminLogout} />}
      {view === 'admin-dash'   && <AdminDashboard onLogout={adminLogout} onBack={() => setView('admin-hub')} />}
      {view === 'real-account' && <OwnerTerminal onLogout={adminLogout} onGoAdmin={() => setView('admin-hub')} />}
      <Toaster theme="dark" position="bottom-right" richColors />
    </>
  );
}
