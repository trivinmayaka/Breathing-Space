import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Stats {
  totalAccounts: number;
  openPositions: number;
  totalTrades: number;
  totalPnl: number;
  winRate: number;
  liveTraderCount: number;
  suspendedCount: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  totalLiveBalance: number;
}

interface LiveTrader {
  id: number;
  email: string;
  fullName: string;
  balance: number;
  suspended: boolean;
  createdAt: string | null;
  openPositions: number;
  totalTrades: number;
  netPnl: number;
  winRate: number;
  pendingDeposits: number;
}

interface ClosedTrade {
  id: number;
  sessionId: string;
  pair: string;
  action: string;
  lots: number;
  openPrice: number;
  closePrice: number;
  pnl: number;
  openedAt: string;
  closedAt: string | null;
}

interface DemoAccount {
  id: number;
  sessionId: string;
  balance: number;
  createdAt: string | null;
  openPositions: number;
  totalTrades: number;
  netPnl: number;
  winRate: number;
}

interface DepositRequest {
  id: number;
  sessionId: string;
  traderName: string;
  contact: string;
  amount: number;
  paymentMethod: string;
  paymentReference: string;
  status: string;
  createdAt: string | null;
  reviewedAt: string | null;
}

interface WithdrawalRequest {
  id: number;
  sessionId: string;
  traderName: string;
  amount: number;
  paymentMethod: string;
  accountDetails: string;
  status: string;
  note: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
}

interface CompanyWalletTxn {
  id: number;
  type: 'credit' | 'debit';
  amount: number;
  note: string | null;
  fromTraderId: number | null;
  fromTraderName: string | null;
  toTraderId: number | null;
  toTraderName: string | null;
  createdAt: string | null;
}

type Tab = 'live-traders' | 'deposits' | 'withdrawals' | 'demo-accounts' | 'company-wallet';
type DepositFilter = 'all' | 'approved' | 'reversed' | 'pending';

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt$  = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pnlStr = (n: number) => `${n >= 0 ? '+' : '-'}${fmt$(n)}`;
const pnlCls = (n: number) => n >= 0 ? 'text-emerald-400' : 'text-red-400';
const fmtDate = (s: string | null | undefined) => s ? new Date(s).toLocaleString() : '—';
const fmtDateShort = (s: string | null | undefined) => s ? new Date(s).toLocaleDateString() : '—';

// ── Shared UI pieces ───────────────────────────────────────────────────────────
function Badge({ children, color }: { children: React.ReactNode; color: 'green' | 'red' | 'amber' | 'blue' | 'gray' }) {
  const cls = {
    green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    red:   'bg-red-500/15 text-red-400 border-red-500/25',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    blue:  'bg-blue-500/15 text-blue-400 border-blue-500/25',
    gray:  'bg-white/5 text-muted-foreground border-border',
  }[color];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${cls}`}>
      {children}
    </span>
  );
}

function IconBtn({
  onClick, disabled, title, danger, children,
}: {
  onClick: () => void; disabled?: boolean; title: string; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-all disabled:opacity-30 disabled:cursor-not-allowed text-[13px]
        ${danger
          ? 'border-red-900/40 text-red-500/60 hover:text-red-400 hover:border-red-700/50 hover:bg-red-500/10'
          : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-white/5'
        }`}
    >
      {children}
    </button>
  );
}

// ── Stats Bar ──────────────────────────────────────────────────────────────────
function StatsBar({ stats, onTabChange }: { stats: Stats; onTabChange: (tab: Tab) => void }) {
  const cards = [
    {
      label: 'Live Traders',
      value: stats.liveTraderCount,
      sub: stats.suspendedCount > 0 ? `${stats.suspendedCount} suspended` : 'all active',
      color: 'text-blue-400',
      icon: '👥',
    },
    {
      label: 'Pending Deposits',
      value: stats.pendingDeposits,
      sub: 'awaiting approval',
      color: stats.pendingDeposits > 0 ? 'text-amber-400' : 'text-muted-foreground',
      icon: '💰',
      tab: 'deposits' as Tab,
      urgent: stats.pendingDeposits > 0,
    },
    {
      label: 'Pending Withdrawals',
      value: stats.pendingWithdrawals,
      sub: 'awaiting approval',
      color: stats.pendingWithdrawals > 0 ? 'text-amber-400' : 'text-muted-foreground',
      icon: '💸',
      tab: 'withdrawals' as Tab,
      urgent: stats.pendingWithdrawals > 0,
    },
    {
      label: 'Total Live Balance',
      value: fmt$(stats.totalLiveBalance),
      sub: `across ${stats.liveTraderCount} trader${stats.liveTraderCount !== 1 ? 's' : ''}`,
      color: 'text-emerald-400',
      icon: '📊',
      isString: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 py-4 border-b border-border bg-[hsl(220_28%_5%)]">
      {cards.map(c => (
        <div
          key={c.label}
          onClick={() => c.tab && onTabChange(c.tab)}
          className={`rounded-xl border p-4 transition-all ${c.urgent ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-white/[0.02]'} ${c.tab ? 'cursor-pointer hover:border-border/80 hover:bg-white/[0.04]' : ''}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{c.label}</span>
            <span className="text-base">{c.icon}</span>
          </div>
          <div className={`text-2xl font-black font-mono ${c.color}`}>
            {c.isString ? c.value : String(c.value)}
          </div>
          <div className="text-[11px] text-muted-foreground/60 mt-0.5">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── Edit Balance Modal ─────────────────────────────────────────────────────────
function EditBalanceModal({ name, currentBalance, onSave, onClose }: {
  name: string; currentBalance: number; onSave: (b: number) => Promise<void>; onClose: () => void;
}) {
  const [val, setVal] = useState(String(currentBalance));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    const n = parseFloat(val);
    if (isNaN(n) || n < 0 || n > 10_000_000) { setErr('Enter a valid amount (0 – 10,000,000)'); return; }
    setBusy(true);
    try { await onSave(n); onClose(); }
    catch (e: any) { setErr(e.message ?? 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[hsl(220_28%_8%)] border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold mb-0.5">Edit Balance</h2>
        <p className="text-xs text-muted-foreground mb-5">{name}</p>
        {err && <div className="mb-3 text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">{err}</div>}
        <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">New Balance (USD)</label>
        <input
          type="number" value={val} onChange={e => setVal(e.target.value)}
          min="0" max="10000000" step="0.01" autoFocus
          className="w-full bg-[hsl(var(--input))] border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50 mb-5"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm border border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button onClick={save} disabled={busy} className="flex-1 py-2.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
            {busy ? 'Saving…' : 'Save Balance'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Trade History Modal ────────────────────────────────────────────────────────
function TradeHistoryModal({ trader, onClose }: { trader: LiveTrader; onClose: () => void }) {
  const [trades, setTrades] = useState<ClosedTrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/live-traders/${trader.id}/trades`)
      .then(r => r.json())
      .then(data => { setTrades(Array.isArray(data) ? data : []); setLoading(false); });
  }, [trader.id]);

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[hsl(220_28%_8%)] border border-border rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-bold text-base">{trader.fullName}</h2>
            <p className="text-xs text-muted-foreground">{trader.email} · Trade history</p>
          </div>
          <div className="flex items-center gap-4">
            {trades.length > 0 && (
              <div className="text-right">
                <div className={`text-sm font-bold font-mono ${pnlCls(totalPnl)}`}>{pnlStr(totalPnl)}</div>
                <div className="text-[10px] text-muted-foreground">total P&L</div>
              </div>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">Loading…</div>
          ) : trades.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">No closed trades yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[hsl(220_28%_8%)]">
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  {['Pair', 'Dir', 'Lots', 'Open', 'Close', 'P&L', 'Opened', 'Closed'].map(h => (
                    <th key={h} className="text-left px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map(t => (
                  <tr key={t.id} className="border-b border-border/40 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-bold text-xs">{t.pair}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.action === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                        {t.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.lots}</td>
                    <td className="px-4 py-3 font-mono text-xs">{t.openPrice.toFixed(5)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{t.closePrice.toFixed(5)}</td>
                    <td className={`px-4 py-3 font-mono text-xs font-bold ${pnlCls(t.pnl)}`}>{pnlStr(t.pnl)}</td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground/60 whitespace-nowrap">{fmtDateShort(t.openedAt)}</td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground/60 whitespace-nowrap">{fmtDateShort(t.closedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Live Traders Tab ───────────────────────────────────────────────────────────
function LiveTradersTab({ onLogout, onStatsChange }: { onLogout: () => void; onStatsChange: () => void }) {
  const [traders, setTraders]       = useState<LiveTrader[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState<'all' | 'active' | 'suspended'>('all');
  const [busy, setBusy]             = useState<Record<number, string>>({});
  const [editTrader, setEditTrader] = useState<LiveTrader | null>(null);
  const [histTrader, setHistTrader] = useState<LiveTrader | null>(null);
  const [toast, setToast]           = useState('');
  const toastRef = useRef<ReturnType<typeof setTimeout>>();

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 3000);
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/live-traders');
      if (res.status === 401) { onLogout(); return; }
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Failed to load live traders'); setLoading(false); return; }
      setTraders(Array.isArray(data) ? data : []);
      setError('');
    } catch { setError('Failed to load live traders'); }
    finally { setLoading(false); }
  }, [onLogout]);

  useEffect(() => { load(); }, [load]);

  async function setBalance(id: number, balance: number) {
    await fetch(`/api/admin/live-traders/${id}/balance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance }),
    });
    await load(); onStatsChange(); showToast('Balance updated');
  }

  async function toggleSuspend(t: LiveTrader) {
    const next = !t.suspended;
    setBusy(b => ({ ...b, [t.id]: 'suspend' }));
    try {
      await fetch(`/api/admin/live-traders/${t.id}/suspend`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspended: next }),
      });
      await load(); onStatsChange();
      showToast(next ? `${t.fullName} suspended` : `${t.fullName} reactivated`);
    } finally { setBusy(b => { const n = { ...b }; delete n[t.id]; return n; }); }
  }

  async function closeAll(t: LiveTrader) {
    if (!confirm(`Force-close ALL open positions for ${t.fullName}? This cannot be undone.`)) return;
    setBusy(b => ({ ...b, [t.id]: 'close-all' }));
    try {
      const res  = await fetch(`/api/admin/live-traders/${t.id}/close-all`, { method: 'POST' });
      const data = await res.json();
      await load();
      showToast(data.closed > 0
        ? `Closed ${data.closed} position${data.closed !== 1 ? 's' : ''} · P&L ${pnlStr(data.pnl)}`
        : `${t.fullName} has no open positions`);
    } finally { setBusy(b => { const n = { ...b }; delete n[t.id]; return n; }); }
  }

  async function deleteTrader(t: LiveTrader) {
    if (!confirm(`Permanently delete account for ${t.fullName} (${t.email})?\nAll their trades will also be removed.`)) return;
    setBusy(b => ({ ...b, [t.id]: 'delete' }));
    try {
      await fetch(`/api/admin/live-traders/${t.id}`, { method: 'DELETE' });
      await load(); onStatsChange();
      showToast(`${t.fullName} deleted`);
    } finally { setBusy(b => { const n = { ...b }; delete n[t.id]; return n; }); }
  }

  const visible = traders.filter(t => {
    const matchSearch = !search || t.fullName.toLowerCase().includes(search.toLowerCase()) || t.email.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || (filter === 'active' && !t.suspended) || (filter === 'suspended' && t.suspended);
    return matchSearch && matchFilter;
  });

  return (
    <div className="flex-1 p-6 overflow-y-auto relative">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[hsl(220_28%_12%)] border border-border rounded-xl px-5 py-3 text-sm font-medium shadow-2xl animate-in fade-in">
          {toast}
        </div>
      )}

      {error && <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3">{error}</div>}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/></svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-4 h-9 bg-[hsl(var(--input))] border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'suspended'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3.5 h-9 rounded-xl text-xs font-semibold border transition-all capitalize ${filter === f ? 'bg-blue-600 border-blue-600 text-white' : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'}`}>
              {f}
            </button>
          ))}
          <button onClick={load} title="Refresh" className="px-3 h-9 rounded-xl text-xs border border-border text-muted-foreground hover:text-foreground transition-all">↻</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Loading traders…</div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground text-sm">
          <svg className="w-10 h-10 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"/></svg>
          {traders.length === 0 ? 'No live traders registered yet' : 'No traders match your filter'}
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[hsl(220_28%_7%)] border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-4 py-3.5">Trader</th>
                  <th className="text-right px-4 py-3.5">Balance</th>
                  <th className="text-center px-4 py-3.5">Status</th>
                  <th className="text-center px-4 py-3.5">Open</th>
                  <th className="text-center px-4 py-3.5">Trades</th>
                  <th className="text-right px-4 py-3.5">Net P&L</th>
                  <th className="text-center px-4 py-3.5">Dep?</th>
                  <th className="px-4 py-3.5">Joined</th>
                  <th className="text-center px-4 py-3.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(t => (
                  <tr key={t.id} className={`border-b border-border/50 transition-colors ${t.suspended ? 'opacity-60 bg-red-500/[0.03]' : 'hover:bg-white/[0.02]'}`}>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-sm text-foreground leading-tight">{t.fullName}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{t.email}</div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-400 text-sm">{fmt$(t.balance)}</td>
                    <td className="px-4 py-3.5 text-center">
                      {t.suspended
                        ? <Badge color="red">Suspended</Badge>
                        : <Badge color="green">Active</Badge>}
                    </td>
                    <td className="px-4 py-3.5 text-center text-muted-foreground text-xs">
                      {t.openPositions > 0 ? <span className="text-blue-400 font-bold">{t.openPositions}</span> : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-center text-muted-foreground text-xs">{t.totalTrades || '—'}</td>
                    <td className={`px-4 py-3.5 text-right font-mono text-xs font-semibold ${pnlCls(t.netPnl)}`}>
                      {t.totalTrades > 0 ? pnlStr(t.netPnl) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {t.pendingDeposits > 0 && <Badge color="amber">{t.pendingDeposits}</Badge>}
                    </td>
                    <td className="px-4 py-3.5 text-[11px] text-muted-foreground/60 whitespace-nowrap">{fmtDateShort(t.createdAt)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <IconBtn onClick={() => setEditTrader(t)} title="Edit balance">💰</IconBtn>
                        <IconBtn
                          onClick={() => toggleSuspend(t)}
                          disabled={busy[t.id] === 'suspend'}
                          title={t.suspended ? 'Reactivate account' : 'Suspend account'}
                        >
                          {busy[t.id] === 'suspend' ? '…' : t.suspended ? '✅' : '🔒'}
                        </IconBtn>
                        <IconBtn
                          onClick={() => closeAll(t)}
                          disabled={busy[t.id] === 'close-all' || t.openPositions === 0}
                          title={t.openPositions === 0 ? 'No open positions' : 'Force close all positions'}
                        >
                          {busy[t.id] === 'close-all' ? '…' : '⚡'}
                        </IconBtn>
                        <IconBtn onClick={() => setHistTrader(t)} title="View trade history">📋</IconBtn>
                        <IconBtn
                          onClick={() => deleteTrader(t)}
                          disabled={busy[t.id] === 'delete'}
                          title="Delete account"
                          danger
                        >
                          {busy[t.id] === 'delete' ? '…' : '🗑'}
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-border bg-[hsl(220_28%_7%)] text-[11px] text-muted-foreground/50">
            {visible.length} trader{visible.length !== 1 ? 's' : ''}{search || filter !== 'all' ? ` (filtered from ${traders.length})` : ''}
          </div>
        </div>
      )}

      {editTrader && (
        <EditBalanceModal
          name={`${editTrader.fullName} — ${editTrader.email}`}
          currentBalance={editTrader.balance}
          onSave={b => setBalance(editTrader.id, b)}
          onClose={() => setEditTrader(null)}
        />
      )}
      {histTrader && <TradeHistoryModal trader={histTrader} onClose={() => setHistTrader(null)} />}
    </div>
  );
}

// ── Manual Credit Modal ────────────────────────────────────────────────────────
type DeductDestination = 'none' | 'company' | 'trader';

function ManualCreditModal({ traders, onDone, onClose }: {
  traders: LiveTrader[];
  onDone: () => void;
  onClose: () => void;
}) {
  const [traderId, setTraderId]         = useState('');
  const [amount, setAmount]             = useState('');
  const [note, setNote]                 = useState('');
  const [destination, setDestination]   = useState<DeductDestination>('none');
  const [destTraderId, setDestTraderId] = useState('');
  const [busy, setBusy]                 = useState(false);
  const [err, setErr]                   = useState('');
  const [done, setDone]                 = useState<{
    name: string; amount: number; newBalance: number;
    destTraderName?: string; destNewBalance?: number; destination: DeductDestination;
  } | null>(null);

  const amt       = parseFloat(amount);
  const isDeduct  = !isNaN(amt) && amt < 0;
  const isCredit  = !isNaN(amt) && amt > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!traderId) { setErr('Select a trader.'); return; }
    if (isNaN(amt) || amt === 0) { setErr('Enter a valid non-zero amount.'); return; }
    if (isDeduct && destination === 'trader' && !destTraderId) {
      setErr('Select a destination trader.'); return;
    }
    if (isDeduct && destination === 'trader' && destTraderId === traderId) {
      setErr('Source and destination traders must be different.'); return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { amount: amt, note };
      if (isDeduct) {
        body.destination = destination;
        if (destination === 'trader') body.destinationTraderId = parseInt(destTraderId);
      }
      const res  = await fetch(`/api/admin/live-traders/${traderId}/manual-deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Failed'); return; }
      const trader = traders.find(t => t.id === parseInt(traderId));
      setDone({
        name: trader?.fullName ?? 'Trader',
        amount: amt,
        newBalance: data.newBalance,
        destTraderName: data.destTraderName,
        destNewBalance: data.destNewBalance,
        destination,
      });
      onDone();
    } catch { setErr('Network error.'); }
    finally { setBusy(false); }
  }

  const DEST_OPTIONS: { value: DeductDestination; label: string; desc: string; color: string }[] = [
    { value: 'none',    label: 'No destination',    desc: 'Funds simply removed',                  color: 'border-border text-muted-foreground'         },
    { value: 'company', label: 'Company Wallet',    desc: 'Credited to house balance',             color: 'border-blue-500/50 text-blue-400 bg-blue-500/5'   },
    { value: 'trader',  label: 'Transfer to Trader', desc: 'Credited to another trader\'s account', color: 'border-amber-500/50 text-amber-400 bg-amber-500/5' },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[hsl(220_28%_8%)] border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        {done ? (
          <div className="flex flex-col items-center text-center gap-3 py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
            </div>
            <p className="font-bold">{done.name}</p>
            <p className="text-sm text-muted-foreground">
              {done.amount > 0
                ? <><span className="text-emerald-400 font-bold font-mono">{fmt$(done.amount)}</span> credited. New balance: <span className="text-foreground font-mono font-bold">{fmt$(done.newBalance)}</span></>
                : <><span className="text-red-400 font-bold font-mono">{fmt$(Math.abs(done.amount))}</span> deducted. New balance: <span className="text-foreground font-mono font-bold">{fmt$(done.newBalance)}</span></>
              }
            </p>
            {done.destination === 'company' && (
              <p className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                🏦 Credited to Company Wallet
              </p>
            )}
            {done.destination === 'trader' && done.destTraderName && (
              <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                ↗ Transferred to <strong>{done.destTraderName}</strong> · New balance: {fmt$(done.destNewBalance ?? 0)}
              </p>
            )}
            <button onClick={onClose} className="mt-2 px-6 h-10 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition-all">Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold">Manual Balance Adjustment</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Credit or deduct funds from any live trader</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">✕</button>
            </div>
            {err && <div className="mb-3 text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">{err}</div>}
            <form onSubmit={submit} className="space-y-4">
              {/* Source trader */}
              <div>
                <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Trader</label>
                <select value={traderId} onChange={e => setTraderId(e.target.value)} required
                  className="w-full bg-[hsl(var(--input))] border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50">
                  <option value="">Select a trader…</option>
                  {traders.map(t => (
                    <option key={t.id} value={t.id}>{t.fullName} — {fmt$(t.balance)}</option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                  Amount (USD) — use negative to deduct
                </label>
                <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setDestination('none'); setDestTraderId(''); }}
                  placeholder="e.g. 500 or -200" step="0.01" required
                  className="w-full bg-[hsl(var(--input))] border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
                {amount && !isNaN(amt) && (
                  <p className={`text-[11px] mt-1 ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isCredit ? '↑ Credit (adds to balance)' : '↓ Deduction (removes from balance)'}
                  </p>
                )}
              </div>

              {/* Destination — only shown for deductions */}
              {isDeduct && (
                <div>
                  <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                    Send deducted funds to
                  </label>
                  <div className="flex flex-col gap-2">
                    {DEST_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setDestination(opt.value); setDestTraderId(''); }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                          destination === opt.value ? opt.color : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${destination === opt.value ? 'border-current bg-current' : 'border-muted-foreground/40'}`} />
                        <div>
                          <p className="text-xs font-semibold leading-tight">{opt.label}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{opt.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Destination trader picker */}
                  {destination === 'trader' && (
                    <div className="mt-3">
                      <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Destination Trader</label>
                      <select value={destTraderId} onChange={e => setDestTraderId(e.target.value)} required
                        className="w-full bg-[hsl(var(--input))] border border-amber-500/30 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/50">
                        <option value="">Select destination trader…</option>
                        {traders.filter(t => t.id !== parseInt(traderId || '0')).map(t => (
                          <option key={t.id} value={t.id}>{t.fullName} — {fmt$(t.balance)}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Note */}
              <div>
                <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Note / Reason</label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Profit withdrawal, correction, etc."
                  className="w-full bg-[hsl(var(--input))] border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm border border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                <button type="submit" disabled={busy}
                  className="flex-1 py-2.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                  {busy ? 'Applying…' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ── Deposits Tab ───────────────────────────────────────────────────────────────
function DepositsTab({ onLogout, onStatsChange }: { onLogout: () => void; onStatsChange: () => void }) {
  const [deposits, setDeposits]   = useState<DepositRequest[]>([]);
  const [traders, setTraders]     = useState<LiveTrader[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [busy, setBusy]           = useState<Record<number, string>>({});
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState<DepositFilter>('all');
  const [showCredit, setShowCredit] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dRes, tRes] = await Promise.all([
        fetch('/api/admin/deposits'),
        fetch('/api/admin/live-traders'),
      ]);
      if (dRes.status === 401) { onLogout(); return; }
      const dData = await dRes.json();
      if (!dRes.ok) { setError(dData?.error ?? 'Failed to load deposits'); setLoading(false); return; }
      setDeposits(Array.isArray(dData) ? dData : []);
      if (tRes.ok) { const tData = await tRes.json(); setTraders(Array.isArray(tData) ? tData : []); }
    } catch { setError('Failed to load deposits'); }
    finally { setLoading(false); }
  }, [onLogout]);

  useEffect(() => { load(); }, [load]);

  async function review(id: number, action: 'approve' | 'reject') {
    setBusy(b => ({ ...b, [id]: action }));
    try {
      await fetch(`/api/admin/deposits/${id}/${action}`, { method: 'POST' });
      await load(); onStatsChange();
    } finally { setBusy(b => { const n = { ...b }; delete n[id]; return n; }); }
  }

  async function reverse(id: number) {
    if (!confirm('Reverse this deposit? The amount will be deducted from the trader\'s balance.')) return;
    setBusy(b => ({ ...b, [id]: 'reverse' }));
    try {
      const res  = await fetch(`/api/admin/deposits/${id}/reverse`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? 'Failed'); return; }
      await load(); onStatsChange();
    } finally { setBusy(b => { const n = { ...b }; delete n[id]; return n; }); }
  }

  const visible = deposits.filter(d => {
    const matchSearch = !search
      || d.traderName.toLowerCase().includes(search.toLowerCase())
      || d.paymentMethod.toLowerCase().includes(search.toLowerCase())
      || d.paymentReference.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || d.status === filter;
    return matchSearch && matchFilter;
  });

  const counts: Record<DepositFilter, number> = {
    all:      deposits.length,
    pending:  deposits.filter(d => d.status === 'pending').length,
    approved: deposits.filter(d => d.status === 'approved').length,
    reversed: deposits.filter(d => d.status === 'reversed').length,
  };

  const totalApproved = deposits.filter(d => d.status === 'approved').reduce((s, d) => s + d.amount, 0);
  const totalReversed = deposits.filter(d => d.status === 'reversed').reduce((s, d) => s + d.amount, 0);

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {error && <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3">{error}</div>}

      {/* Summary row */}
      {!loading && deposits.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Total Credited', value: fmt$(totalApproved), color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/20' },
            { label: 'Total Reversed', value: fmt$(totalReversed), color: 'text-red-400',     bg: 'bg-red-500/5 border-red-500/20' },
            { label: 'Net Deposited',  value: fmt$(totalApproved - totalReversed), color: 'text-blue-400', bg: 'bg-blue-500/5 border-blue-500/20' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-3.5 ${s.bg}`}>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{s.label}</div>
              <div className={`text-lg font-black font-mono ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, method, or reference…"
            className="w-full pl-9 pr-4 h-9 bg-[hsl(var(--input))] border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'approved', 'pending', 'reversed'] as DepositFilter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 h-9 rounded-xl text-xs font-semibold border transition-all capitalize flex items-center gap-1.5 ${filter === f ? 'bg-blue-600 border-blue-600 text-white' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {f}
              {counts[f] > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filter === f ? 'bg-white/20' : 'bg-white/5'}`}>{counts[f]}</span>}
            </button>
          ))}
          <button onClick={() => setShowCredit(true)}
            className="px-3.5 h-9 rounded-xl text-xs font-bold border border-blue-700/50 bg-blue-600/15 text-blue-400 hover:bg-blue-600/25 transition-all flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
            Manual Credit
          </button>
          <button onClick={load} title="Refresh" className="px-3 h-9 rounded-xl text-xs border border-border text-muted-foreground hover:text-foreground transition-all">↻</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          {deposits.length === 0 ? 'No deposit records yet' : 'No deposits match your filter'}
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-w-3xl">
          {visible.map(dep => (
            <DepositCard key={dep.id} dep={dep} busy={busy} onReview={review} onReverse={reverse} />
          ))}
          <div className="text-[11px] text-muted-foreground/40 text-center pt-1">
            {visible.length} record{visible.length !== 1 ? 's' : ''}{search || filter !== 'all' ? ` (filtered from ${deposits.length})` : ''}
          </div>
        </div>
      )}

      {showCredit && (
        <ManualCreditModal
          traders={traders}
          onDone={() => { load(); onStatsChange(); }}
          onClose={() => setShowCredit(false)}
        />
      )}
    </div>
  );
}

function DepositCard({ dep, busy, onReview, onReverse }: {
  dep: DepositRequest;
  busy: Record<number, string>;
  onReview: (id: number, a: 'approve' | 'reject') => void;
  onReverse: (id: number) => void;
}) {
  const isLive    = dep.sessionId.startsWith('live-');
  const isManual  = dep.paymentMethod === 'Admin Manual Credit' || dep.paymentMethod === 'Admin Deduction';
  const statusColor = dep.status === 'approved' ? 'green'
    : dep.status === 'rejected' ? 'red'
    : dep.status === 'reversed' ? 'gray'
    : 'amber';

  return (
    <div className={`bg-[hsl(220_28%_7%)] border rounded-2xl p-5 flex flex-col gap-3 transition-colors ${dep.status === 'reversed' ? 'border-border/40 opacity-70' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="font-semibold text-sm">{dep.traderName}</p>
            {isLive && <Badge color="green">Live</Badge>}
            {isManual && <Badge color="blue">Admin</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{dep.contact}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`font-bold font-mono text-lg ${dep.status === 'reversed' ? 'text-red-400 line-through opacity-60' : 'text-emerald-400'}`}>
            {fmt$(dep.amount)}
          </span>
          <Badge color={statusColor as any}>{dep.status}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
        <span className="text-muted-foreground"><span className="text-muted-foreground/50">Method: </span>{dep.paymentMethod}</span>
        <span className="text-muted-foreground"><span className="text-muted-foreground/50">Ref: </span>{dep.paymentReference}</span>
        <span className="text-muted-foreground"><span className="text-muted-foreground/50">Account: </span>
          <code className="text-blue-400">{isLive ? `Trader #${dep.sessionId.slice(5)}` : dep.sessionId.slice(0, 12) + '…'}</code>
        </span>
        <span className="text-muted-foreground"><span className="text-muted-foreground/50">
          {dep.status === 'pending' ? 'Submitted: ' : dep.status === 'approved' ? 'Credited: ' : 'Date: '}
        </span>{fmtDate(dep.status === 'pending' ? dep.createdAt : (dep.reviewedAt ?? dep.createdAt))}</span>
      </div>

      {dep.status === 'pending' && (
        <div className="flex gap-2 pt-1 border-t border-border">
          <button onClick={() => onReview(dep.id, 'reject')} disabled={!!busy[dep.id]}
            className="flex-1 py-2.5 text-xs border border-red-900/40 text-red-400/70 hover:text-red-400 hover:border-red-700/50 rounded-xl transition-colors disabled:opacity-40 font-semibold">
            {busy[dep.id] === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
          <button onClick={() => onReview(dep.id, 'approve')} disabled={!!busy[dep.id]}
            className="flex-1 py-2.5 text-xs bg-emerald-700/30 hover:bg-emerald-700/50 border border-emerald-700/40 text-emerald-400 rounded-xl transition-colors disabled:opacity-40 font-semibold">
            {busy[dep.id] === 'approve' ? 'Approving…' : '✓ Approve & Credit'}
          </button>
        </div>
      )}

      {dep.status === 'approved' && !isManual && (
        <div className="flex justify-end pt-1 border-t border-border">
          <button onClick={() => onReverse(dep.id)} disabled={!!busy[dep.id]}
            className="px-4 py-2 text-xs border border-red-900/40 text-red-400/60 hover:text-red-400 hover:border-red-700/50 hover:bg-red-500/5 rounded-xl transition-colors disabled:opacity-40 font-semibold flex items-center gap-1.5">
            {busy[dep.id] === 'reverse'
              ? 'Reversing…'
              : <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"/></svg> Reverse Deposit</>
            }
          </button>
        </div>
      )}
    </div>
  );
}

// ── Company Wallet Tab ─────────────────────────────────────────────────────────
function CompanyWalletTab({ onLogout }: { onLogout: () => void }) {
  const [balance, setBalance]   = useState<number | null>(null);
  const [txns, setTxns]         = useState<CompanyWalletTxn[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/company-wallet');
      if (res.status === 401) { onLogout(); return; }
      const data = await res.json();
      setBalance(data.balance);
      setTxns(data.transactions);
    } catch { setError('Failed to load company wallet'); }
    finally { setLoading(false); }
  }, [onLogout]);

  useEffect(() => { load(); }, [load]);

  const totalCredits = txns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const totalDebits  = txns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {error && <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3">{error}</div>}

      {/* Balance hero */}
      {!loading && balance !== null && (
        <div className="mb-6">
          <div className="bg-gradient-to-br from-blue-600/10 to-blue-600/5 border border-blue-500/20 rounded-2xl p-6 flex flex-col gap-1 max-w-sm">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Company Wallet Balance</p>
            <p className={`text-4xl font-black font-mono ${balance >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmt$(balance)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Net inflow from trader deductions &amp; transfers</p>
          </div>

          {txns.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mt-4 max-w-sm">
              {[
                { label: 'Total In',  value: fmt$(totalCredits), color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/20' },
                { label: 'Total Out', value: fmt$(totalDebits),  color: 'text-red-400',     bg: 'bg-red-500/5 border-red-500/20' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl border p-3.5 ${s.bg}`}>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{s.label}</div>
                  <div className={`text-lg font-black font-mono ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transaction history */}
      <div className="flex items-center justify-between mb-4 max-w-3xl">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Transaction History</h3>
        <button onClick={load} title="Refresh" className="text-xs text-muted-foreground hover:text-foreground transition-colors">↻ Refresh</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Loading…</div>
      ) : txns.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-2xl">🏦</div>
          <p className="text-sm text-muted-foreground">No wallet activity yet</p>
          <p className="text-xs text-muted-foreground/60 max-w-xs">When you deduct funds from a trader and send them to the Company Wallet, they'll appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-w-3xl">
          {txns.map(t => {
            const isTransfer = t.fromTraderId !== null && t.toTraderId !== null;
            return (
              <div key={t.id} className={`bg-[hsl(220_28%_7%)] border rounded-xl px-4 py-3.5 flex items-start justify-between gap-4 ${
                t.type === 'credit' && !isTransfer ? 'border-emerald-900/40' : isTransfer ? 'border-amber-900/30' : 'border-border'
              }`}>
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`mt-0.5 w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-sm ${
                    isTransfer ? 'bg-amber-500/15' : t.type === 'credit' ? 'bg-emerald-500/15' : 'bg-red-500/15'
                  }`}>
                    {isTransfer ? '↗' : t.type === 'credit' ? '↙' : '↗'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-snug">
                      {isTransfer
                        ? `Transfer: ${t.fromTraderName} → ${t.toTraderName}`
                        : t.type === 'credit'
                          ? `Received from ${t.fromTraderName ?? 'Unknown'}`
                          : `Sent to ${t.toTraderName ?? 'Unknown'}`
                      }
                    </p>
                    {t.note && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{t.note}</p>}
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">{fmtDate(t.createdAt)}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className={`font-bold font-mono text-sm ${
                    isTransfer ? 'text-amber-400' : t.type === 'credit' ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {t.type === 'credit' ? '+' : '−'}{fmt$(t.amount)}
                  </span>
                  <span className={`text-[9px] uppercase tracking-wider mt-0.5 ${
                    isTransfer ? 'text-amber-600' : t.type === 'credit' ? 'text-emerald-700' : 'text-red-700'
                  }`}>
                    {isTransfer ? 'transfer' : t.type}
                  </span>
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground/40 text-center pt-1">{txns.length} transaction{txns.length !== 1 ? 's' : ''}</p>
        </div>
      )}
    </div>
  );
}

// ── Withdrawals Tab ────────────────────────────────────────────────────────────
function WithdrawalsTab({ onLogout, onStatsChange }: { onLogout: () => void; onStatsChange: () => void }) {
  const [items, setItems]   = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [busy, setBusy]     = useState<Record<number, string>>({});
  const [note, setNote]     = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/withdrawals');
      if (res.status === 401) { onLogout(); return; }
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Failed to load withdrawals'); setLoading(false); return; }
      setItems(Array.isArray(data) ? data : []);
    } catch { setError('Failed to load withdrawals'); }
    finally { setLoading(false); }
  }, [onLogout]);

  useEffect(() => { load(); }, [load]);

  async function review(id: number, action: 'approve' | 'reject') {
    setBusy(b => ({ ...b, [id]: action }));
    try {
      const res  = await fetch(`/api/admin/withdrawals/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note[id]?.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? 'Failed'); return; }
      await load(); onStatsChange();
    } finally { setBusy(b => { const n = { ...b }; delete n[id]; return n; }); }
  }

  const pending  = items.filter(w => w.status === 'pending');
  const reviewed = items.filter(w => w.status !== 'pending');

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {error && <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No withdrawal requests yet</div>
      ) : (
        <div className="flex flex-col gap-8 max-w-3xl">
          {pending.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400">Pending</h3>
                <span className="text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded-full">{pending.length}</span>
              </div>
              <div className="flex flex-col gap-3">
                {pending.map(w => (
                  <div key={w.id} className="bg-[hsl(220_28%_7%)] border border-border rounded-2xl p-5 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-sm">{w.traderName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{w.paymentMethod} → {w.accountDetails}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="font-bold font-mono text-amber-400 text-lg">{fmt$(w.amount)}</span>
                        <Badge color="amber">pending</Badge>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground/60">{fmtDate(w.createdAt)}</div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Note (optional)</label>
                      <input type="text" value={note[w.id] ?? ''} onChange={e => setNote(n => ({ ...n, [w.id]: e.target.value }))}
                        placeholder="e.g. Sent via M-Pesa"
                        className="w-full bg-[hsl(var(--input))] border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
                    </div>
                    <div className="flex gap-2 pt-1 border-t border-border">
                      <button onClick={() => review(w.id, 'reject')} disabled={!!busy[w.id]}
                        className="flex-1 py-2.5 text-xs border border-red-900/40 text-red-400/70 hover:text-red-400 hover:border-red-700/50 rounded-xl transition-colors disabled:opacity-40 font-semibold">
                        {busy[w.id] === 'reject' ? 'Rejecting…' : 'Reject'}
                      </button>
                      <button onClick={() => review(w.id, 'approve')} disabled={!!busy[w.id]}
                        className="flex-1 py-2.5 text-xs bg-amber-700/30 hover:bg-amber-700/50 border border-amber-700/40 text-amber-400 rounded-xl transition-colors disabled:opacity-40 font-semibold">
                        {busy[w.id] === 'approve' ? 'Approving…' : '✓ Approve & Deduct'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {reviewed.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">History · {reviewed.length}</h3>
              <div className="flex flex-col gap-3">
                {reviewed.map(w => (
                  <div key={w.id} className="bg-[hsl(220_28%_7%)] border border-border rounded-2xl p-5 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-sm">{w.traderName}</p>
                        <p className="text-xs text-muted-foreground">{w.paymentMethod} → {w.accountDetails}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="font-bold font-mono text-amber-400">{fmt$(w.amount)}</span>
                        <Badge color={w.status === 'approved' ? 'green' : 'red'}>{w.status}</Badge>
                      </div>
                    </div>
                    {w.note && <p className="text-[11px] text-muted-foreground/70 italic">"{w.note}"</p>}
                    <div className="text-[10px] text-muted-foreground/40">{fmtDate(w.reviewedAt)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Demo Accounts Tab ──────────────────────────────────────────────────────────
function DemoAccountsTab({ onLogout }: { onLogout: () => void }) {
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState<Record<number, string>>({});
  const [editAcc, setEditAcc]   = useState<DemoAccount | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/accounts');
      if (res.status === 401) { onLogout(); return; }
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Failed to load accounts'); setLoading(false); return; }
      setAccounts(Array.isArray(data) ? data : []);
    } catch { setError('Failed to load accounts'); }
    finally { setLoading(false); }
  }, [onLogout]);

  useEffect(() => { load(); }, [load]);

  async function setBalance(id: number, balance: number) {
    await fetch(`/api/admin/accounts/${id}/balance`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ balance }),
    });
    await load();
  }

  async function resetAccount(id: number) {
    setBusy(b => ({ ...b, [id]: 'reset' }));
    try { await fetch(`/api/admin/accounts/${id}/reset`, { method: 'POST' }); await load(); }
    finally { setBusy(b => { const n = { ...b }; delete n[id]; return n; }); }
  }

  async function deleteAccount(id: number) {
    if (!confirm('Delete this demo account and all its trades?')) return;
    setBusy(b => ({ ...b, [id]: 'delete' }));
    try { await fetch(`/api/admin/accounts/${id}`, { method: 'DELETE' }); await load(); }
    finally { setBusy(b => { const n = { ...b }; delete n[id]; return n; }); }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {error && <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No demo accounts yet</div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[hsl(220_28%_7%)] border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  {['ID', 'Session', 'Balance', 'Open', 'Trades', 'Win%', 'Net P&L', 'Created', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map(acc => (
                  <tr key={acc.id} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">{acc.id}</td>
                    <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">{acc.sessionId.slice(0, 8)}…</td>
                    <td className="px-4 py-3.5 font-mono text-xs font-bold text-foreground">{fmt$(acc.balance)}</td>
                    <td className="px-4 py-3.5 text-center text-muted-foreground text-xs">{acc.openPositions || '—'}</td>
                    <td className="px-4 py-3.5 text-center text-muted-foreground text-xs">{acc.totalTrades || '—'}</td>
                    <td className="px-4 py-3.5 text-center font-mono text-xs text-muted-foreground">{acc.totalTrades > 0 ? `${acc.winRate}%` : '—'}</td>
                    <td className={`px-4 py-3.5 font-mono text-xs font-semibold ${pnlCls(acc.netPnl)}`}>
                      {acc.totalTrades > 0 ? pnlStr(acc.netPnl) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-[11px] text-muted-foreground/60 whitespace-nowrap">{fmtDateShort(acc.createdAt)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1">
                        <IconBtn onClick={() => setEditAcc(acc)} title="Edit balance">💰</IconBtn>
                        <IconBtn onClick={() => resetAccount(acc.id)} disabled={busy[acc.id] === 'reset'} title="Reset to $10,000">
                          {busy[acc.id] === 'reset' ? '…' : '↺'}
                        </IconBtn>
                        <IconBtn onClick={() => deleteAccount(acc.id)} disabled={busy[acc.id] === 'delete'} title="Delete account" danger>
                          {busy[acc.id] === 'delete' ? '…' : '🗑'}
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-border bg-[hsl(220_28%_7%)] text-[11px] text-muted-foreground/50">
            {accounts.length} demo account{accounts.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {editAcc && (
        <EditBalanceModal
          name={`Session: ${editAcc.sessionId}`}
          currentBalance={editAcc.balance}
          onSave={b => setBalance(editAcc.id, b)}
          onClose={() => setEditAcc(null)}
        />
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string }[] = [
  { id: 'live-traders',    label: '🟢 Live Traders' },
  { id: 'deposits',        label: '💰 Deposits' },
  { id: 'withdrawals',     label: '💸 Withdrawals' },
  { id: 'company-wallet',  label: '🏦 Company Wallet' },
  { id: 'demo-accounts',   label: 'Demo Accounts' },
];

export default function AdminDashboard({ onLogout, onBack }: { onLogout: () => void; onBack?: () => void }) {
  const [tab, setTab]       = useState<Tab>('live-traders');
  const [stats, setStats]   = useState<Stats | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats');
      if (res.status === 401) { onLogout(); return; }
      setStats(await res.json());
    } catch { /* silently ignore stats load error */ }
  }, [onLogout]);

  useEffect(() => { loadStats(); }, [loadStats]);

  function handleTabChange(next: Tab) {
    setTab(next);
    loadStats();
  }

  const pendingTotal = (stats?.pendingDeposits ?? 0) + (stats?.pendingWithdrawals ?? 0);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-[hsl(220_28%_5%)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]" />
          <span className="text-sm font-bold tracking-wide">TrivinFX Pro</span>
          <span className="text-muted-foreground/40 text-xs">·</span>
          <span className="text-xs text-muted-foreground">Admin Dashboard</span>
          {pendingTotal > 0 && (
            <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
              {pendingTotal} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              ← Back to app
            </button>
          )}
          <button onClick={onLogout} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Sign Out
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && <StatsBar stats={stats} onTabChange={handleTabChange} />}

      {/* Tabs */}
      <div className="flex border-b border-border px-4 bg-[hsl(220_28%_5%)] shrink-0 overflow-x-auto">
        {TABS.map(t => {
          const hasBadge = (t.id === 'deposits' && (stats?.pendingDeposits ?? 0) > 0)
                        || (t.id === 'withdrawals' && (stats?.pendingWithdrawals ?? 0) > 0);
          return (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={`relative py-3.5 px-4 text-xs font-semibold uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap -mb-px ${
                tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {hasBadge && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === 'live-traders'   && <LiveTradersTab   onLogout={onLogout} onStatsChange={loadStats} />}
      {tab === 'deposits'       && <DepositsTab      onLogout={onLogout} onStatsChange={loadStats} />}
      {tab === 'withdrawals'    && <WithdrawalsTab   onLogout={onLogout} onStatsChange={loadStats} />}
      {tab === 'company-wallet' && <CompanyWalletTab onLogout={onLogout} />}
      {tab === 'demo-accounts'  && <DemoAccountsTab  onLogout={onLogout} />}
    </div>
  );
}
