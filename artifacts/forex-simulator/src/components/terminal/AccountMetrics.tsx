import { useGetForexAccount, useResetForexAccount, getGetForexAccountQueryKey, getGetForexHistoryQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function AccountMetrics() {
  const { data: account } = useGetForexAccount({ query: { refetchInterval: 3000, queryKey: getGetForexAccountQueryKey() } });
  const resetMutation = useResetForexAccount();
  const queryClient = useQueryClient();

  const handleReset = () => {
    if (confirm('Reset practice account to $10,000? All positions and history will be cleared.')) {
      resetMutation.mutate(undefined, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetForexAccountQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetForexHistoryQueryKey() });
          toast.success('Practice account reset to $10,000');
        },
        onError: () => toast.error('Reset failed'),
      });
    }
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
    <div className="flex-shrink-0 flex items-center justify-between px-5 h-10 border-b border-border bg-panel text-[11px] font-medium">
      <div className="flex items-center divide-x divide-border">
        <MetricCell label="Balance"     value={fmt(account?.balance)} />
        <MetricCell label="Equity"      value={fmt(account?.equity)} />
        <MetricCell label="Floating P/L" value={pnlStr} valueClass={`font-mono font-bold ${pnlClass}`} />
        <MetricCell label="Free Margin" value={fmt(account?.freeMargin)} />
        <MetricCell label="Margin Lvl"  value={marginLevel ? fmtPct(marginLevel) : '∞'} valueClass={mlClass + ' font-mono'} />
        <MetricCell label="Win Rate"    value={fmtPct(account?.winRate)} />
        <MetricCell label="Trades"      value={account?.totalTrades?.toString() ?? '—'} />
      </div>
      <button
        onClick={handleReset}
        disabled={resetMutation.isPending}
        className="flex items-center gap-1.5 text-muted-foreground/40 hover:text-destructive transition-colors ml-4 shrink-0"
        title="Reset practice account"
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
    <div className="flex items-baseline gap-2 px-4 first:pl-0">
      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider whitespace-nowrap">{label}</span>
      <span className={valueClass}>{value ?? '—'}</span>
    </div>
  );
}
