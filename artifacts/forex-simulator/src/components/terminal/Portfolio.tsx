import { useState } from 'react';
import {
  useGetForexAccount, useGetForexHistory, useCloseForexPosition,
  getGetForexAccountQueryKey, getGetForexHistoryQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';

export function Portfolio() {
  const [tab, setTab] = useState<'positions' | 'history'>('positions');

  return (
    <div className="w-[280px] flex-shrink-0 flex flex-col h-full bg-panel border-l border-border">
      {/* Tab bar */}
      <div className="flex border-b border-border h-9 shrink-0">
        <TabBtn label="Positions" active={tab === 'positions'} onClick={() => setTab('positions')} />
        <TabBtn label="History"   active={tab === 'history'}   onClick={() => setTab('history')} />
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
        {tab === 'positions' ? <PositionsTab /> : <HistoryTab />}
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${
        active
          ? 'text-foreground border-b-2 border-primary'
          : 'text-muted-foreground/50 hover:text-muted-foreground'
      }`}
    >{label}</button>
  );
}

function PositionsTab() {
  const { data: account } = useGetForexAccount({ query: { refetchInterval: 3000, queryKey: getGetForexAccountQueryKey() } });
  const closeMutation = useCloseForexPosition();
  const queryClient = useQueryClient();

  const handleClose = (id: number) => {
    closeMutation.mutate({ id }, {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: getGetForexAccountQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetForexHistoryQueryKey() });
        const pnl = data?.pnl ?? 0;
        if (pnl > 0) toast.success(`Position closed  +$${pnl.toFixed(2)}`);
        else if (pnl < 0) toast.error(`Position closed  -$${Math.abs(pnl).toFixed(2)}`);
        else toast.info('Position closed  $0.00');
      },
      onError: () => toast.error('Failed to close position'),
    });
  };

  const positions = account?.positions || [];
  const floatingPnl = account?.floatingPnl;

  if (positions.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-3">
          <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center">
            <svg className="w-4 h-4 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
            </svg>
          </div>
          <p className="text-xs text-muted-foreground/50">No open positions</p>
        </div>
        <PnlFooter label="Floating P/L" value={undefined} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3 py-1.5 text-[9px] uppercase tracking-widest text-muted-foreground/40 bg-background/30 border-b border-border/50 shrink-0">
        <div>Instrument</div>
        <div className="text-right">Size</div>
        <div className="text-right">P/L</div>
        <div className="w-5" />
      </div>

      <div className="flex-1">
        {(positions as any[]).map((pos: any) => {
          const pnlClass = pos.pnl > 0 ? 'text-profit' : pos.pnl < 0 ? 'text-loss' : 'text-muted-foreground';
          return (
            <div key={pos.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center px-3 py-2.5 border-b border-border/40 hover:bg-surface/30 group transition-colors">
              <div>
                <div className="font-mono text-[11px] font-bold text-foreground">{pos.pair}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[9px] font-bold px-1.5 rounded-sm ${pos.action === 'BUY' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>
                    {pos.action}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground/50">{pos.openPrice.toFixed(pos.dec)}</span>
                </div>
              </div>
              <div className="font-mono text-[11px] text-muted-foreground text-right">{pos.lots.toFixed(2)}</div>
              <div className={`font-mono text-[11px] font-bold text-right ${pnlClass}`}>
                {pos.pnl > 0 ? '+' : ''}{pos.pnl.toFixed(2)}
              </div>
              <div className="flex justify-center w-5">
                <button
                  onClick={() => handleClose(pos.id)}
                  disabled={closeMutation.isPending}
                  className="w-4 h-4 rounded flex items-center justify-center text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <PnlFooter
        label="Floating P/L"
        value={floatingPnl}
        extra={`${positions.length} position${positions.length !== 1 ? 's' : ''}`}
      />
    </div>
  );
}

function HistoryTab() {
  const { data: history } = useGetForexHistory({ query: { refetchInterval: 5000, queryKey: getGetForexHistoryQueryKey() } });

  if (!history || history.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-3">
          <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center">
            <svg className="w-4 h-4 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-xs text-muted-foreground/50">No closed trades yet</p>
        </div>
        <PnlFooter label="Realised P/L" value={undefined} />
      </div>
    );
  }

  const totalPnl  = (history as any[]).reduce((s: number, t: any) => s + t.pnl, 0);
  const wins      = (history as any[]).filter((t: any) => t.pnl > 0).length;
  const winRate   = history.length ? (wins / history.length) * 100 : 0;

  return (
    <div className="flex-1 flex flex-col">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 px-3 py-1.5 text-[9px] uppercase tracking-widest text-muted-foreground/40 bg-background/30 border-b border-border/50 shrink-0">
        <div>Instrument</div>
        <div className="text-right">Lots</div>
        <div className="text-right">P/L</div>
      </div>

      <div className="flex-1">
        {(history as any[]).map((trade: any) => {
          const pnlClass = trade.pnl > 0 ? 'text-profit' : trade.pnl < 0 ? 'text-loss' : 'text-muted-foreground';
          return (
            <div key={trade.id} className="grid grid-cols-[1fr_auto_auto] gap-x-2 items-center px-3 py-2.5 border-b border-border/40 hover:bg-surface/30 transition-colors">
              <div>
                <div className="font-mono text-[11px] font-bold text-foreground">{trade.pair}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[9px] font-bold px-1.5 rounded-sm ${trade.action === 'BUY' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>
                    {trade.action}
                  </span>
                  <span className="text-[9px] text-muted-foreground/40 font-mono">
                    {format(new Date(trade.closedAt), 'HH:mm')}
                  </span>
                </div>
              </div>
              <div className="font-mono text-[11px] text-muted-foreground text-right">{trade.lots.toFixed(2)}</div>
              <div className={`font-mono text-[11px] font-bold text-right ${pnlClass}`}>
                {trade.pnl > 0 ? '+' : ''}{trade.pnl.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      <PnlFooter
        label="Realised P/L"
        value={totalPnl}
        extra={`Win rate ${winRate.toFixed(0)}%`}
      />
    </div>
  );
}

function PnlFooter({ label, value, extra }: { label: string; value?: number; extra?: string }) {
  const cls = value === undefined ? 'text-muted-foreground' : value > 0 ? 'text-profit' : value < 0 ? 'text-loss' : 'text-muted-foreground';
  const str = value === undefined ? '—' : `${value > 0 ? '+' : ''}$${Math.abs(value).toFixed(2)}`;
  return (
    <div className="shrink-0 px-3 py-2.5 border-t border-border bg-background/30 flex items-center justify-between">
      <div>
        <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest">{label}</div>
        {extra && <div className="text-[9px] text-muted-foreground/30 mt-0.5">{extra}</div>}
      </div>
      <span className={`font-mono font-bold text-sm ${cls}`}>{str}</span>
    </div>
  );
}
