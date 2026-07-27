import { useState, useEffect, useCallback } from 'react';

interface Stats {
  totalAccounts: number;
  openPositions: number;
  totalTrades:   number;
  totalPnl:      number;
  winRate:        number;
}

interface DemoAccount {
  id:            number;
  sessionId:     string;
  balance:       number;
  createdAt:     string | null;
  openPositions: number;
  totalTrades:   number;
  netPnl:        number;
  winRate:        number;
}

interface LiveTrader {
  id:              number;
  email:           string;
  fullName:        string;
  balance:         number;
  createdAt:       string | null;
  openPositions:   number;
  totalTrades:     number;
  netPnl:          number;
  winRate:         number;
  pendingDeposits: number;
}

interface DepositRequest {
  id:               number;
  sessionId:        string;
  traderName:       string;
  contact:          string;
  amount:           number;
  paymentMethod:    string;
  paymentReference: string;
  status:           string;
  createdAt:        string | null;
  reviewedAt:       string | null;
}

const fmtMoney = (n: number) =>
  `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pnlStr  = (n: number) => `${n >= 0 ? '+' : '-'}${fmtMoney(n)}`;
const pnlCls  = (n: number) => n >= 0 ? 'text-emerald-400' : 'text-red-400';
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString() : '—';

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{label}</div>
      <div className="text-2xl font-bold font-mono text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function EditBalanceModal({ name, currentBalance, onSave, onClose }: {
  name: string;
  currentBalance: number;
  onSave: (balance: number) => Promise<void>;
  onClose: () => void;
}) {
  const [val, setVal]   = useState(String(currentBalance));
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');

  async function save() {
    const n = parseFloat(val);
    if (isNaN(n) || n < 0 || n > 10_000_000) { setErr('Enter a valid amount (0 – 10,000,000)'); return; }
    setBusy(true);
    try { await onSave(n); onClose(); }
    catch (e: any) { setErr(e.message ?? 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold mb-1">Edit Balance</h2>
        <p className="text-xs text-muted-foreground mb-4">{name}</p>
        {err && <div className="mb-3 text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded px-3 py-2">{err}</div>}
        <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">New Balance (USD)</label>
        <input
          type="number" value={val} onChange={e => setVal(e.target.value)}
          min="0" max="10000000" step="0.01" autoFocus
          className="w-full bg-[hsl(var(--input))] border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50 mb-4"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button onClick={save} disabled={busy} className="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'approved' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40' :
    status === 'rejected' ? 'bg-red-950/60 text-red-400 border-red-800/40' :
    'bg-amber-950/60 text-amber-400 border-amber-800/40';
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  );
}

// ── Deposits tab ──────────────────────────────────────────────────────────────
function DepositsTab({ onLogout }: { onLogout: () => void }) {
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState<Record<number, 'approve' | 'reject'>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/deposits');
      if (res.status === 401) { onLogout(); return; }
      setDeposits(await res.json());
    } catch {
      setError('Failed to load deposit requests');
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { load(); }, [load]);

  async function review(id: number, action: 'approve' | 'reject') {
    setBusy(b => ({ ...b, [id]: action }));
    try {
      await fetch(`/api/admin/deposits/${id}/${action}`, { method: 'POST' });
      await load();
    } finally {
      setBusy(b => { const n = { ...b }; delete n[id]; return n; });
    }
  }

  const pending  = deposits.filter(d => d.status === 'pending');
  const reviewed = deposits.filter(d => d.status !== 'pending');

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {error && <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-4 py-3">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">Loading…</div>
      ) : deposits.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-xs">No deposit requests yet</div>
      ) : (
        <div className="flex flex-col gap-8">
          {pending.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-3">Pending · {pending.length}</h3>
              <div className="flex flex-col gap-3">
                {pending.map(dep => (
                  <DepositCard key={dep.id} dep={dep} busy={busy} onReview={review} />
                ))}
              </div>
            </section>
          )}
          {reviewed.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">History · {reviewed.length}</h3>
              <div className="flex flex-col gap-3">
                {reviewed.map(dep => (
                  <DepositCard key={dep.id} dep={dep} busy={busy} onReview={review} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function DepositCard({
  dep, busy, onReview,
}: {
  dep: DepositRequest;
  busy: Record<number, 'approve' | 'reject'>;
  onReview: (id: number, action: 'approve' | 'reject') => void;
}) {
  const isLive = dep.sessionId.startsWith('live-');
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-semibold text-sm">{dep.traderName}</p>
            {isLive && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 uppercase tracking-wider">Live</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{dep.contact}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="font-bold font-mono text-emerald-400 text-base">
            ${dep.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
          <StatusBadge status={dep.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
        <span><span className="text-muted-foreground/50">Method:</span> {dep.paymentMethod}</span>
        <span><span className="text-muted-foreground/50">Ref:</span> {dep.paymentReference}</span>
        <span><span className="text-muted-foreground/50">Account:</span> <code className="text-blue-400">{dep.sessionId.slice(0, 12)}…</code></span>
        <span><span className="text-muted-foreground/50">Date:</span> {fmtDate(dep.createdAt)}</span>
      </div>

      {dep.status === 'pending' && (
        <div className="flex gap-2 pt-1 border-t border-border">
          <button
            onClick={() => onReview(dep.id, 'reject')}
            disabled={!!busy[dep.id]}
            className="flex-1 py-2 text-xs border border-red-900/40 text-red-400/70 hover:text-red-400 hover:border-red-700/50 rounded-lg transition-colors disabled:opacity-40 font-semibold"
          >
            {busy[dep.id] === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
          <button
            onClick={() => onReview(dep.id, 'approve')}
            disabled={!!busy[dep.id]}
            className="flex-1 py-2 text-xs bg-emerald-700/30 hover:bg-emerald-700/50 border border-emerald-700/40 text-emerald-400 rounded-lg transition-colors disabled:opacity-40 font-semibold"
          >
            {busy[dep.id] === 'approve' ? 'Approving…' : '✓ Approve & Credit'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Live Traders tab ──────────────────────────────────────────────────────────
function LiveTradersTab({ onLogout }: { onLogout: () => void }) {
  const [traders, setTraders] = useState<LiveTrader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [busy,    setBusy]    = useState<Record<number, string>>({});
  const [editT,   setEditT]   = useState<LiveTrader | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/live-traders');
      if (res.status === 401) { onLogout(); return; }
      setTraders(await res.json());
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
    await load();
  }

  async function deleteTrader(id: number, email: string) {
    if (!confirm(`Delete live account for ${email}? This will remove all their trades.`)) return;
    setBusy(b => ({ ...b, [id]: 'delete' }));
    try { await fetch(`/api/admin/live-traders/${id}`, { method: 'DELETE' }); await load(); }
    finally { setBusy(b => { const n = { ...b }; delete n[id]; return n; }); }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {error && <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-4 py-3">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">Loading…</div>
      ) : traders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-xs gap-2">
          <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
          No live traders registered yet
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              Live Traders <span className="text-muted-foreground font-normal">({traders.length})</span>
            </h2>
            <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground transition-colors">↻ Refresh</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="text-left px-4 py-3">Trader</th>
                  <th className="text-right px-4 py-3">Balance</th>
                  <th className="text-center px-4 py-3">Open</th>
                  <th className="text-center px-4 py-3">Trades</th>
                  <th className="text-center px-4 py-3">Win%</th>
                  <th className="px-4 py-3">Net P&L</th>
                  <th className="text-center px-4 py-3">Dep.?</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {traders.map(t => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-sm text-foreground">{t.fullName}</div>
                      <div className="text-[11px] text-muted-foreground">{t.email}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-right font-bold text-emerald-400">{fmtMoney(t.balance)}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{t.openPositions}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{t.totalTrades}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground font-mono">{t.totalTrades > 0 ? `${t.winRate}%` : '—'}</td>
                    <td className={`px-4 py-3 font-mono font-semibold ${pnlCls(t.netPnl)}`}>
                      {t.totalTrades > 0 ? pnlStr(t.netPnl) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {t.pendingDeposits > 0 ? (
                        <span className="text-[10px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
                          {t.pendingDeposits} pending
                        </span>
                      ) : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground/60 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setEditT(t)}
                          className="text-[10px] px-2 py-1 border border-border rounded text-muted-foreground hover:text-blue-400 hover:border-blue-700/50 transition-colors whitespace-nowrap"
                        >Edit $</button>
                        <button
                          onClick={() => deleteTrader(t.id, t.email)}
                          disabled={!!busy[t.id]}
                          className="text-[10px] px-2 py-1 border border-red-900/40 rounded text-red-500/60 hover:text-red-400 hover:border-red-700/50 transition-colors disabled:opacity-40 whitespace-nowrap"
                        >{busy[t.id] === 'delete' ? '…' : 'Delete'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editT && (
        <EditBalanceModal
          name={`${editT.fullName} (${editT.email})`}
          currentBalance={editT.balance}
          onSave={b => setBalance(editT.id, b)}
          onClose={() => setEditT(null)}
        />
      )}
    </div>
  );
}

// ── Withdrawals tab ───────────────────────────────────────────────────────────
interface WithdrawalRequest {
  id: number; sessionId: string; traderName: string; amount: number;
  paymentMethod: string; accountDetails: string; status: string;
  note: string | null; createdAt: string | null; reviewedAt: string | null;
}

function WithdrawalsTab({ onLogout }: { onLogout: () => void }) {
  const [items,   setItems]   = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [busy,    setBusy]    = useState<Record<number, 'approve' | 'reject'>>({});
  const [note,    setNote]    = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/withdrawals');
      if (res.status === 401) { onLogout(); return; }
      setItems(await res.json());
    } catch { setError('Failed to load withdrawal requests'); }
    finally { setLoading(false); }
  }, [onLogout]);

  useEffect(() => { load(); }, [load]);

  async function review(id: number, action: 'approve' | 'reject') {
    setBusy(b => ({ ...b, [id]: action }));
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note[id] ?? '' }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? 'Failed'); return; }
      await load();
    } finally { setBusy(b => { const n = { ...b }; delete n[id]; return n; }); }
  }

  const pending  = items.filter(w => w.status === 'pending');
  const reviewed = items.filter(w => w.status !== 'pending');

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {error && <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-4 py-3">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">Loading…</div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-xs">No withdrawal requests yet</div>
      ) : (
        <div className="flex flex-col gap-8">
          {pending.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-3">Pending · {pending.length}</h3>
              <div className="flex flex-col gap-3">
                {pending.map(w => (
                  <div key={w.id} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-sm text-foreground">{w.traderName}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{w.paymentMethod} → {w.accountDetails}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="font-bold font-mono text-amber-400 text-base">
                          ${w.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                        <StatusBadge status={w.status} />
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground/60">{fmtDate(w.createdAt)}</div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Note (optional)</label>
                      <input type="text" value={note[w.id] ?? ''} onChange={e => setNote(n => ({ ...n, [w.id]: e.target.value }))}
                        placeholder="e.g. Sent via M-Pesa"
                        className="w-full bg-[hsl(var(--input))] border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50" />
                    </div>
                    <div className="flex gap-2 pt-1 border-t border-border">
                      <button onClick={() => review(w.id, 'reject')} disabled={!!busy[w.id]}
                        className="flex-1 py-2 text-xs border border-red-900/40 text-red-400/70 hover:text-red-400 hover:border-red-700/50 rounded-lg transition-colors disabled:opacity-40 font-semibold">
                        {busy[w.id] === 'reject' ? 'Rejecting…' : 'Reject'}
                      </button>
                      <button onClick={() => review(w.id, 'approve')} disabled={!!busy[w.id]}
                        className="flex-1 py-2 text-xs bg-amber-700/30 hover:bg-amber-700/50 border border-amber-700/40 text-amber-400 rounded-lg transition-colors disabled:opacity-40 font-semibold">
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
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">History · {reviewed.length}</h3>
              <div className="flex flex-col gap-3">
                {reviewed.map(w => (
                  <div key={w.id} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-sm text-foreground">{w.traderName}</p>
                        <p className="text-[11px] text-muted-foreground">{w.paymentMethod} → {w.accountDetails}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="font-bold font-mono text-amber-400">${w.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        <StatusBadge status={w.status} />
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

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function AdminDashboard({ onLogout, onBack }: { onLogout: () => void; onBack?: () => void }) {
  const [tab,      setTab]      = useState<'accounts' | 'live-traders' | 'deposits' | 'withdrawals'>('live-traders');
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState<Record<number, 'reset' | 'delete'>>({});
  const [editAcc,  setEditAcc]  = useState<DemoAccount | null>(null);

  const load = useCallback(async () => {
    try {
      const [sRes, aRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/accounts'),
      ]);
      if (sRes.status === 401 || aRes.status === 401) { onLogout(); return; }
      setStats(await sRes.json());
      setAccounts(await aRes.json());
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { load(); }, [load]);

  async function resetAccount(id: number) {
    setBusy(b => ({ ...b, [id]: 'reset' }));
    try { await fetch(`/api/admin/accounts/${id}/reset`, { method: 'POST' }); await load(); }
    finally { setBusy(b => { const n = { ...b }; delete n[id]; return n; }); }
  }

  async function deleteAccount(id: number) {
    if (!confirm('Delete this account and all its data?')) return;
    setBusy(b => ({ ...b, [id]: 'delete' }));
    try { await fetch(`/api/admin/accounts/${id}`, { method: 'DELETE' }); await load(); }
    finally { setBusy(b => { const n = { ...b }; delete n[id]; return n; }); }
  }

  async function setBalance(id: number, balance: number) {
    await fetch(`/api/admin/accounts/${id}/balance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance }),
    });
    await load();
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-panel">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          <span className="text-sm font-bold tracking-wide">TrivinFX Pro — Admin</span>
        </div>
        <div className="flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              ← Back
            </button>
          )}
          <button onClick={onLogout} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Sign Out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-6">
        {([
          { id: 'live-traders', label: '🟢 Live Traders' },
          { id: 'deposits',     label: 'Deposits' },
          { id: 'withdrawals',  label: 'Withdrawals' },
          { id: 'accounts',     label: 'Demo Accounts' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`py-3 px-4 text-xs font-semibold uppercase tracking-widest border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'live-traders' && <LiveTradersTab onLogout={onLogout} />}
      {tab === 'deposits'     && <DepositsTab onLogout={onLogout} />}
      {tab === 'withdrawals'  && <WithdrawalsTab onLogout={onLogout} />}

      {/* Accounts tab */}
      {tab === 'accounts' && (
        <div className="flex-1 p-6 overflow-y-auto">
          {error && <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-4 py-3">{error}</div>}

          {stats && (
            <div className="grid grid-cols-5 gap-4 mb-8">
              <StatCard label="Total Accounts"    value={String(stats.totalAccounts)} />
              <StatCard label="Open Positions"    value={String(stats.openPositions)} />
              <StatCard label="Total Trades"      value={String(stats.totalTrades)} />
              <StatCard label="Platform P&L"      value={stats.totalTrades > 0 ? pnlStr(stats.totalPnl) : '—'} />
              <StatCard label="Platform Win Rate" value={stats.totalTrades > 0 ? `${stats.winRate}%` : '—'} />
            </div>
          )}

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-sm">Demo Accounts</h2>
              <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground transition-colors">↻ Refresh</button>
            </div>
            {loading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">Loading...</div>
            ) : accounts.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">No accounts yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                      <th className="text-left px-4 py-3">ID</th>
                      <th className="text-left px-4 py-3">Session</th>
                      <th className="text-right px-4 py-3">Balance</th>
                      <th className="text-center px-4 py-3">Open</th>
                      <th className="text-center px-4 py-3">Trades</th>
                      <th className="text-center px-4 py-3">Win%</th>
                      <th className="px-4 py-3">Net P&L</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map(acc => (
                      <tr key={acc.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{acc.id}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{acc.sessionId.slice(0, 8)}…</td>
                        <td className="px-4 py-3 font-mono text-xs text-right">{fmtMoney(acc.balance)}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{acc.openPositions}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{acc.totalTrades}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground font-mono">{acc.totalTrades > 0 ? `${acc.winRate}%` : '—'}</td>
                        <td className={`px-4 py-3 font-mono font-semibold ${pnlCls(acc.netPnl)}`}>
                          {acc.totalTrades > 0 ? pnlStr(acc.netPnl) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground/60 whitespace-nowrap">{fmtDate(acc.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setEditAcc(acc)}
                              className="text-[10px] px-2 py-1 border border-border rounded text-muted-foreground hover:text-blue-400 hover:border-blue-700/50 transition-colors whitespace-nowrap"
                            >Edit $</button>
                            <button
                              onClick={() => resetAccount(acc.id)}
                              disabled={!!busy[acc.id]}
                              className="text-[10px] px-2 py-1 border border-border rounded text-muted-foreground hover:text-amber-400 hover:border-amber-700/50 transition-colors disabled:opacity-40 whitespace-nowrap"
                            >{busy[acc.id] === 'reset' ? '…' : 'Reset'}</button>
                            <button
                              onClick={() => deleteAccount(acc.id)}
                              disabled={!!busy[acc.id]}
                              className="text-[10px] px-2 py-1 border border-red-900/40 rounded text-red-500/60 hover:text-red-400 hover:border-red-700/50 transition-colors disabled:opacity-40 whitespace-nowrap"
                            >{busy[acc.id] === 'delete' ? '…' : 'Delete'}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground/30 text-center mt-6">
            TrivinFX Pro — Platform Administration · {accounts.length} total account{accounts.length !== 1 ? 's' : ''}
          </p>
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
