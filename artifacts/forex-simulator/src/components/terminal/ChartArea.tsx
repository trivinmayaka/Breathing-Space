import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import {
  useGetForexCandles, useGetForexPrices, useCreateForexOrder,
  getGetForexAccountQueryKey, getGetForexHistoryQueryKey,
  getGetForexCandlesQueryKey, getGetForexPricesQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ChartAreaProps {
  selectedPair: string;
  maxLots?: number;
}

export function ChartArea({ selectedPair, maxLots = 10 }: ChartAreaProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const pairSlug = selectedPair.replace('/', '-');

  const { data: candles } = useGetForexCandles(pairSlug, {
    query: { enabled: !!selectedPair, queryKey: getGetForexCandlesQueryKey(pairSlug) },
  });
  const { data: prices } = useGetForexPrices({
    query: { refetchInterval: 1500, queryKey: getGetForexPricesQueryKey() },
  });

  const createOrderMutation = useCreateForexOrder();
  const queryClient = useQueryClient();
  const [lots, setLots] = useState<string>('0.10');

  const priceData = prices?.[selectedPair];

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#556577',
        fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: 'rgba(96,165,250,0.6)', width: 1, style: 2 },
        horzLine: { color: 'rgba(96,165,250,0.6)', width: 1, style: 2 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)' },
    });

    chartRef.current = chart;

    // lightweight-charts v5: addSeries(Definition, options)
    const series = chart.addSeries(CandlestickSeries, {
      upColor:        '#22c55e',
      downColor:      '#ef4444',
      borderVisible:  false,
      wickUpColor:    '#22c55e',
      wickDownColor:  '#ef4444',
    });
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width:  chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    });
    ro.observe(chartContainerRef.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, []);

  useEffect(() => {
    if (seriesRef.current && candles) {
      const sorted = [...candles].sort((a, b) => a.time - b.time);
      seriesRef.current.setData(sorted as any);
      chartRef.current?.timeScale().scrollToRealTime();
    }
  }, [candles, selectedPair]);

  const handleTrade = (action: 'BUY' | 'SELL') => {
    const lotValue = parseFloat(lots);
    if (isNaN(lotValue) || lotValue < 0.01 || lotValue > maxLots) {
      toast.error(`Lot size must be between 0.01 and ${maxLots}`);
      return;
    }
    createOrderMutation.mutate({ data: { pair: selectedPair, action, lots: lotValue } }, {
      onSuccess: () => {
        toast.success(`${action} ${lotValue} lots — ${selectedPair}`, { description: 'Order executed' });
        queryClient.invalidateQueries({ queryKey: getGetForexAccountQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetForexHistoryQueryKey() });
      },
      onError: () => toast.error('Order rejected', { description: 'Check margin and try again' }),
    });
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      {/* Pair header */}
      <div className="h-9 flex-shrink-0 border-b border-border bg-panel flex items-center px-4 gap-4">
        <span className="font-mono font-bold text-sm text-foreground">{selectedPair}</span>
        {priceData ? (
          <>
            <div className="flex items-center gap-0.5 font-mono text-sm">
              <span className="text-loss">{priceData.bid.toFixed(priceData.dec)}</span>
              <span className="text-muted-foreground/30 px-1 text-xs">/</span>
              <span className="text-profit">{priceData.ask.toFixed(priceData.dec)}</span>
            </div>
            <div className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${priceData.changePct >= 0 ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>
              {priceData.changePct > 0 ? '+' : ''}{priceData.changePct.toFixed(2)}%
            </div>
            <div className="text-[10px] text-muted-foreground/40 font-mono ml-auto">
              Spread: {priceData.spreadPips.toFixed(1)} pips
            </div>
          </>
        ) : (
          <span className="text-muted-foreground/50 text-xs">Loading market data…</span>
        )}
      </div>

      {/* Chart */}
      <div className="flex-1 relative min-h-0" ref={chartContainerRef} />

      {/* Order panel */}
      <div className="flex-shrink-0 border-t border-border bg-panel flex items-center gap-4 px-4 py-3">
        {/* Lot size */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Volume (Lots)</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setLots(l => Math.max(0.01, parseFloat(l) - 0.01).toFixed(2))}
              className="w-7 h-9 bg-surface border border-border rounded-l text-muted-foreground hover:text-foreground hover:bg-raised transition-colors text-lg leading-none"
            >−</button>
            <input
              type="number" value={lots}
              onChange={e => setLots(e.target.value)}
              min="0.01" max={maxLots} step="0.01"
              className="w-20 h-9 bg-surface border-y border-border px-2 text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <button
              onClick={() => setLots(l => Math.min(maxLots, parseFloat(l) + 0.01).toFixed(2))}
              className="w-7 h-9 bg-surface border border-border rounded-r text-muted-foreground hover:text-foreground hover:bg-raised transition-colors text-lg leading-none"
            >+</button>
          </div>
        </div>

        {/* Quick sizes */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Quick</label>
          <div className="flex gap-1">
            {['0.01','0.10','0.50','1.00'].map(v => (
              <button
                key={v}
                onClick={() => setLots(v)}
                className={`h-9 px-2 text-[10px] font-mono border rounded transition-colors ${lots === v ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-surface border-border text-muted-foreground hover:text-foreground hover:border-muted'}`}
              >{v}</button>
            ))}
          </div>
        </div>

        {/* Trade buttons */}
        <div className="flex gap-3 ml-auto">
          <button
            onClick={() => handleTrade('SELL')}
            disabled={createOrderMutation.isPending || !priceData}
            className="w-36 h-16 bg-loss/10 hover:bg-loss/20 border border-loss/60 hover:border-loss text-loss rounded flex flex-col items-center justify-center transition-all disabled:opacity-40 gap-0.5"
          >
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Sell / Short</span>
            <span className="font-mono font-bold text-base leading-tight">{priceData?.bid.toFixed(priceData.dec) || '—'}</span>
          </button>
          <button
            onClick={() => handleTrade('BUY')}
            disabled={createOrderMutation.isPending || !priceData}
            className="w-36 h-16 bg-profit/10 hover:bg-profit/20 border border-profit/60 hover:border-profit text-profit rounded flex flex-col items-center justify-center transition-all disabled:opacity-40 gap-0.5"
          >
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Buy / Long</span>
            <span className="font-mono font-bold text-base leading-tight">{priceData?.ask.toFixed(priceData.dec) || '—'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
