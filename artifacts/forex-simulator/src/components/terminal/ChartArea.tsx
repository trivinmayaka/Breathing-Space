import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, BarSeries, LineSeries } from 'lightweight-charts';
import type { IChartApi } from 'lightweight-charts';
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

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D';
type ChartType = 'candles' | 'bars' | 'line';
type Indicator = 'none' | 'sma' | 'ema' | 'rsi';

const TIMEFRAMES: Array<{ value: Timeframe; label: string; seconds: number }> = [
  { value: '1m', label: '1m', seconds: 60 },
  { value: '5m', label: '5m', seconds: 300 },
  { value: '15m', label: '15m', seconds: 900 },
  { value: '1h', label: '1H', seconds: 3600 },
  { value: '4h', label: '4H', seconds: 14400 },
  { value: '1D', label: '1D', seconds: 86400 },
];

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type SeriesLike = { setData: (data: unknown[]) => void };

function aggregateCandles(candles: Candle[] | undefined, timeframe: Timeframe): Candle[] {
  if (!candles?.length) return [];
  const seconds = TIMEFRAMES.find(t => t.value === timeframe)?.seconds ?? 60;
  if (seconds === 60) return candles;

  const grouped = new Map<number, Candle>();
  for (const candle of candles) {
    const bucket = Math.floor(candle.time / seconds) * seconds;
    const existing = grouped.get(bucket);
    if (!existing) {
      grouped.set(bucket, { ...candle, time: bucket });
    } else {
      existing.high = Math.max(existing.high, candle.high);
      existing.low = Math.min(existing.low, candle.low);
      existing.close = candle.close;
      existing.volume += candle.volume;
    }
  }
  return [...grouped.values()].sort((a, b) => a.time - b.time);
}

function movingAverage(candles: Candle[], period: number, exponential = false) {
  const output: Array<{ time: number; value: number }> = [];
  let previous: number | undefined;
  const multiplier = 2 / (period + 1);
  candles.forEach((candle, index) => {
    if (index < period - 1) return;
    const window = candles.slice(index - period + 1, index + 1);
    const average = exponential
      ? previous === undefined
        ? window.reduce((sum, item) => sum + item.close, 0) / period
        : candle.close * multiplier + previous * (1 - multiplier)
      : window.reduce((sum, item) => sum + item.close, 0) / period;
    previous = average;
    output.push({ time: candle.time, value: average });
  });
  return output;
}

function relativeStrengthIndex(candles: Candle[], period = 14) {
  const output: Array<{ time: number; value: number }> = [];
  if (candles.length <= period) return output;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const difference = candles[i].close - candles[i - 1].close;
    if (difference >= 0) gains += difference;
    else losses -= difference;
  }
  for (let i = period; i < candles.length; i++) {
    if (i > period) {
      const difference = candles[i].close - candles[i - 1].close;
      gains = (gains * (period - 1) + Math.max(0, difference)) / period;
      losses = (losses * (period - 1) + Math.max(0, -difference)) / period;
    }
    const relativeStrength = losses === 0 ? 100 : gains / losses;
    output.push({ time: candles[i].time, value: 100 - 100 / (1 + relativeStrength) });
  }
  return output;
}

export function ChartArea({ selectedPair, maxLots = 10 }: ChartAreaProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<SeriesLike | null>(null);
  const crosshairSeriesRef = useRef<any>(null);
  const indicatorRef = useRef<SeriesLike | null>(null);

  const pairSlug = selectedPair.replace('/', '-');
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [chartType, setChartType] = useState<ChartType>('candles');
  const [indicator, setIndicator] = useState<Indicator>('none');
  const [crosshairCandle, setCrosshairCandle] = useState<Candle | null>(null);

  const { data: rawCandles } = useGetForexCandles(pairSlug, {
    query: {
      enabled: !!selectedPair,
      queryKey: [...getGetForexCandlesQueryKey(pairSlug), timeframe],
      refetchInterval: timeframe === '1m' ? 15000 : 30000,
    },
  });
  const { data: prices } = useGetForexPrices({
    query: { refetchInterval: 1500, queryKey: getGetForexPricesQueryKey() },
  });

  const createOrderMutation = useCreateForexOrder();
  const queryClient = useQueryClient();
  const [lots, setLots] = useState<string>('0.10');

  const candles = useMemo(() => aggregateCandles(rawCandles, timeframe), [rawCandles, timeframe]);
  const priceData = prices?.[selectedPair];

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#718096',
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
    const seriesOptions = {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    };
    if (chartType === 'candles') {
      crosshairSeriesRef.current = chart.addSeries(CandlestickSeries, seriesOptions);
      seriesRef.current = crosshairSeriesRef.current as SeriesLike;
    } else if (chartType === 'bars') {
      crosshairSeriesRef.current = chart.addSeries(BarSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
      });
      seriesRef.current = crosshairSeriesRef.current as SeriesLike;
    } else {
      crosshairSeriesRef.current = chart.addSeries(LineSeries, {
        color: '#38bdf8',
        lineWidth: 2,
      });
      seriesRef.current = crosshairSeriesRef.current as SeriesLike;
    }
    const onCrosshairMove = (param: any) => {
      const data = crosshairSeriesRef.current ? param.seriesData.get(crosshairSeriesRef.current) : undefined;
      if (data && 'open' in data) setCrosshairCandle(data as Candle);
      else if (data && 'value' in data) setCrosshairCandle({ time: data.time, open: data.value, high: data.value, low: data.value, close: data.value, volume: 0 });
      else setCrosshairCandle(null);
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      crosshairSeriesRef.current = null;
      indicatorRef.current = null;
      setCrosshairCandle(null);
    };
  }, [chartType]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !seriesRef.current) return;

    if (chartType === 'line') {
      seriesRef.current.setData(candles.map(candle => ({ time: candle.time, value: candle.close })));
    } else {
      seriesRef.current.setData(candles);
    }
    chart.timeScale().fitContent();

    if (indicatorRef.current) {
      chart.removeSeries(indicatorRef.current as never);
      indicatorRef.current = null;
    }
    if (indicator === 'sma' || indicator === 'ema') {
      indicatorRef.current = chart.addSeries(LineSeries, {
        color: indicator === 'sma' ? '#f59e0b' : '#a78bfa',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      }) as unknown as SeriesLike;
      indicatorRef.current.setData(movingAverage(candles, indicator === 'sma' ? 20 : 50, indicator === 'ema'));
    } else if (indicator === 'rsi') {
      chart.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.76, bottom: 0.05 } });
      indicatorRef.current = chart.addSeries(LineSeries, {
        color: '#f472b6',
        lineWidth: 2,
        priceScaleId: 'rsi',
        priceLineVisible: false,
        lastValueVisible: true,
      }) as unknown as SeriesLike;
      indicatorRef.current.setData(relativeStrengthIndex(candles));
    }
  }, [candles, chartType, indicator]);

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
      {/* Pair header and chart controls */}
      <div className="min-h-9 flex-shrink-0 border-b border-border bg-panel flex items-center px-3 gap-3 flex-wrap py-1.5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono font-bold text-sm text-foreground">{selectedPair}</span>
          {priceData ? (
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-loss">{priceData.bid.toFixed(priceData.dec)}</span>
              <span className="text-muted-foreground/30">/</span>
              <span className="text-profit">{priceData.ask.toFixed(priceData.dec)}</span>
              <span className={`px-1.5 py-0.5 rounded ${priceData.changePct >= 0 ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>
                {priceData.changePct > 0 ? '+' : ''}{priceData.changePct.toFixed(2)}%
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground/50 text-xs">Loading market data…</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 ml-auto overflow-x-auto">
          {TIMEFRAMES.map(item => (
            <button
              key={item.value}
              onClick={() => setTimeframe(item.value)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-semibold transition-colors ${
                timeframe === item.value ? 'bg-primary/20 text-primary border border-primary/40' : 'text-muted-foreground hover:text-foreground'
              }`}
            >{item.label}</button>
          ))}
          <select
            value={chartType}
            onChange={e => setChartType(e.target.value as ChartType)}
            className="h-6 bg-surface border border-border rounded px-1.5 text-[10px] text-muted-foreground focus:outline-none"
            aria-label="Chart type"
          >
            <option value="candles">Candles</option>
            <option value="bars">Bars</option>
            <option value="line">Line</option>
          </select>
          <select
            value={indicator}
            onChange={e => setIndicator(e.target.value as Indicator)}
            className="h-6 bg-surface border border-border rounded px-1.5 text-[10px] text-muted-foreground focus:outline-none"
            aria-label="Technical indicator"
          >
            <option value="none">Indicators</option>
            <option value="sma">SMA 20</option>
            <option value="ema">EMA 50</option>
            <option value="rsi">RSI 14</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-1 border-b border-border/50 bg-background/40 text-[9px] text-muted-foreground/50 gap-2">
        <span>Simulated practice feed · {timeframe} candles · crosshair enabled</span>
        {crosshairCandle && (
          <span className="font-mono text-foreground/60 overflow-hidden whitespace-nowrap">
            O {crosshairCandle.open.toFixed(priceData?.dec ?? 5)} · H {crosshairCandle.high.toFixed(priceData?.dec ?? 5)} · L {crosshairCandle.low.toFixed(priceData?.dec ?? 5)} · C {crosshairCandle.close.toFixed(priceData?.dec ?? 5)}
          </span>
        )}
        {priceData && <span>Spread: <span className="font-mono text-foreground/70">{priceData.spreadPips.toFixed(1)} pips</span></span>}
      </div>

      {/* Chart */}
      <div className="flex-1 relative min-h-0" ref={chartContainerRef} />

      {/* Order panel */}
      <div className="flex-shrink-0 border-t border-border bg-panel flex items-center gap-4 px-4 py-3 flex-wrap">
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

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Quick</label>
          <div className="flex gap-1">
            {['0.01', '0.10', '0.50', '1.00'].map(v => (
              <button
                key={v}
                onClick={() => setLots(v)}
                className={`h-9 px-2 text-[10px] font-mono border rounded transition-colors ${lots === v ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-surface border-border text-muted-foreground hover:text-foreground hover:border-muted'}`}
              >{v}</button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 ml-auto w-full sm:w-auto">
          <button
            onClick={() => handleTrade('SELL')}
            disabled={createOrderMutation.isPending || !priceData}
            className="flex-1 sm:w-36 h-14 bg-loss/10 hover:bg-loss/20 border border-loss/60 hover:border-loss text-loss rounded flex flex-col items-center justify-center transition-all disabled:opacity-40 gap-0.5"
          >
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Sell / Short</span>
            <span className="font-mono font-bold text-sm leading-tight">{priceData?.bid.toFixed(priceData.dec) || '—'}</span>
          </button>
          <button
            onClick={() => handleTrade('BUY')}
            disabled={createOrderMutation.isPending || !priceData}
            className="flex-1 sm:w-36 h-14 bg-profit/10 hover:bg-profit/20 border border-profit/60 hover:border-profit text-profit rounded flex flex-col items-center justify-center transition-all disabled:opacity-40 gap-0.5"
          >
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Buy / Long</span>
            <span className="font-mono font-bold text-sm leading-tight">{priceData?.ask.toFixed(priceData.dec) || '—'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}