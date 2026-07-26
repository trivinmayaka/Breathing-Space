import { useState, useEffect, useRef } from 'react';
import { useGetForexPrices, getGetForexPricesQueryKey } from '@workspace/api-client-react';
import type { PriceData } from '@workspace/api-client-react';

interface WatchlistProps {
  selectedPair: string;
  onSelectPair: (pair: string) => void;
}

export function Watchlist({ selectedPair, onSelectPair }: WatchlistProps) {
  const { data: prices } = useGetForexPrices({ query: { refetchInterval: 1500, queryKey: getGetForexPricesQueryKey() } });

  if (!prices) {
    return (
      <div className="w-[200px] border-r border-border bg-panel flex items-center justify-center">
        <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest">Connecting…</div>
      </div>
    );
  }

  const groups: Record<string, [string, PriceData][]> = {};
  Object.entries(prices).forEach(([pair, data]) => {
    if (!groups[data.group]) groups[data.group] = [];
    groups[data.group].push([pair, data]);
  });

  return (
    <div className="w-[200px] flex-shrink-0 border-r border-border bg-panel flex flex-col h-full">
      {/* Header */}
      <div className="h-9 border-b border-border flex items-center px-3 gap-2 shrink-0">
        <svg className="w-3.5 h-3.5 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"/>
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Market Watch</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {['Major', 'Minor', 'Cross'].map(group => {
          if (!groups[group]) return null;
          return (
            <div key={group}>
              <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 bg-background/40 border-b border-border/50">
                {group} Pairs
              </div>
              {groups[group].map(([pair, data]) => (
                <WatchlistRow
                  key={pair}
                  pair={pair}
                  data={data}
                  isSelected={selectedPair === pair}
                  onClick={() => onSelectPair(pair)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WatchlistRow({ pair, data, isSelected, onClick }: {
  pair: string; data: PriceData; isSelected: boolean; onClick: () => void;
}) {
  const prevMidRef = useRef(data.mid);
  const [flashClass, setFlashClass] = useState('');

  useEffect(() => {
    const dir = data.mid > prevMidRef.current ? 'up' : data.mid < prevMidRef.current ? 'down' : null;
    if (dir) {
      setFlashClass(`flash-${dir}`);
      const t = setTimeout(() => setFlashClass(''), 450);
      prevMidRef.current = data.mid;
      return () => clearTimeout(t);
    }
    return undefined;
  }, [data.mid]);

  const up = data.changePct >= 0;

  return (
    <div
      onClick={onClick}
      className={`relative px-3 py-2.5 border-b border-border/40 cursor-pointer transition-colors ${isSelected ? 'bg-surface' : 'hover:bg-surface/50'} ${flashClass}`}
    >
      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-[2px] brand-gradient" />}
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[11px] font-bold text-foreground">{pair}</span>
        <span className={`text-[10px] font-mono font-semibold ${up ? 'text-profit' : 'text-loss'}`}>
          {up ? '▲' : '▼'} {Math.abs(data.changePct).toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          <span className="text-loss">{data.bid.toFixed(data.dec)}</span>
          <span className="text-muted-foreground/30 text-[9px]">|</span>
          <span className="text-profit">{data.ask.toFixed(data.dec)}</span>
        </div>
        <span className="text-[9px] text-muted-foreground/40 font-mono">{data.spreadPips.toFixed(1)}p</span>
      </div>
    </div>
  );
}
