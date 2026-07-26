import { useState } from 'react';
import { useGetForexAccount, useResetForexAccount, getGetForexAccountQueryKey, getGetForexHistoryQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function OwnerAccountMetrics() {
  const { data: account } = useGetForexAccount({ query: { refetchInterval: 3000, queryKey: getGetForexAccountQueryKey() } });
  const resetMutation = useResetForexAccount();
  const queryClient = useQueryClient();

  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState('');
  const [savingBalance, setSavingBalance] = useState(false);

  const handleReset = () => {
    if (confirm('Reset live account back to $100,000? All open positions and history will be cleared.')) {
      resetMutation.mutate(undefined, {
        onSuccess: () => {
          fetch('/api/real/balance', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ balance: 100000 }),
          }).finally(() => {
            queryClient.invalidateQueries({ queryKey: getGetForexAccountQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetForexHistoryQueryKey() });
            toast.success('Live account reset to $100,000');
          });
        },
        onError: () => toast.error('Reset failed'),
      });
    }
  };

  const startEdit = () => {
    setBalanceInput(account?.balance?.toFixed(2) ?? '100000');
    setEditingBalance(true);
  };

  const saveBalance = async () => {
    const n = parseFloat(balanceInput.replace(/,/g, ''));
    if (isNaN(n) || n < 0 || n > 100_000_000) { toast.error('Enter a valid amount (0–100,000,000)'); return; }
    setSavingBalance(true);
    try {
      const res = await fetch('/api/real/balance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: n }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: getGetForexAccountQueryKey() });
      toast.success(`Balance updated to $${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
      setEditingBalance(false);
    } catch { toast.error('Failed to update balance'); }
    finally { setSavingBalance(false); }
  };

  const fmt  = (v?: number) => v === undefined ? '—' : `$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPct = (v?: number) => v === undefined ? '—' : `${v.toFixed(1)}%`;

  const pnl = account?.floatingPnl;
  const pnlClass = pnl === undefined ? 'text-foreground' : pnl > 0 ? 'text-profit' : pnl < 0 ? 'text-loss' : 'text-muted-foreground';
  const pnlStr   = pnl !== undefined ? `${pnl > 0 ? '+' : ''}${fmt(pnl)}` : '—';

  const marginLevel = account?.marginLevel;
  const mlClass = marginLevel === undefined || marginLevel === 0 ? 'text-muted-foreground'
    : marginLevel > 200 ? 'text-profit' : marginLevel > 100 ? 'text-[#f0b429]' : 'text-loss';

  return (
    <div className="flex-shrink-0 flex items-center justify-between px-5 h-10 border-b border-emerald-900/30 bg-emerald-950/10 text-[11px] font-medium">
      <div className="flex items-center divide-x divide-border">
        {/* Editable balance cell */}
        <div className="flex items-baseline gap-2 pr-4">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Balance</span>
          {editingBalance ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus value={balanceInput} onChange={e => setBalanceInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveBalance(); if (e.key === 'Escape') setEditingBalance(false); }}
                className="w-28 bg-surface border border-emerald-600/40 rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
              />
              <button onClick={saveBalance} disabled={savingBalance} title="Save" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              </button>
              <button onClick={() => setEditingBalance(false)} title="Cancel" className="text-muted-foreground hover:text-foreground transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          ) : (
            <button
              onClick={startEdit}
              className="font-mono font-bold text-foreground hover:text-emerald-400 transition-colors group flex items-center gap-1"
              title="Click to edit balance"
            >
              {fmt(account?.balance)}
              <svg className="w-2.5 h-2.5 text-muted-foreground/20 group-hover:text-emerald-400/60 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
            </button>
          )}
        </div>

        <MetricCell label="Equity"       value={fmt(account?.equity)} />
        <MetricCell label="Floating P/L" value={pnlStr} valueClass={`font-mono font-bold ${pnlClass}`} />
        <MetricCell label="Free Margin"  value={fmt(account?.freeMargin)} />
        <MetricCell label="Margin Lvl"   value={marginLevel ? fmtPct(marginLevel) : '∞'} valueClass={mlClass + ' font-mono'} />
        <MetricCell label="Win Rate"     value={fmtPct(account?.winRate)} />
        <MetricCell label="Trades"       value={account?.totalTrades?.toString() ?? '—'} />
      </div>

      <button
        onClick={handleReset}
        disabled={resetMutation.isPending}
        className="flex items-center gap-1.5 text-muted-foreground/40 hover:text-destructive transition-colors ml-4 shrink-0"
        title="Reset live account"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
        <span className="uppercase tracking-widest text-[10px] font-bold">Reset</span>
      </button>
    </div>
  );
}

function MetricCell({ label, value, valueClass = 'font-mono font-bold text-foreground' }: {
  label: string; value?: string; valueClass?: string;
}) {
  return (
    <div className="flex items-baseline gap-2 px-4">
      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider whitespace-nowrap">{label}</span>
      <span className={valueClass}>{value ?? '—'}</span>
    </div>
  );
}
