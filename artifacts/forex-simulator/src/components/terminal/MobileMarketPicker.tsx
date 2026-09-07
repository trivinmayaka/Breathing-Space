const MOBILE_MARKET_PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF',
  'NZD/USD', 'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'USD/MXN', 'USD/ZAR', 'EUR/CHF',
  'XAU/USD', 'XAG/USD', 'USOIL', 'BTC/USD', 'ETH/USD',
];

export function MobileMarketPicker({
  selectedPair,
  onSelectPair,
}: {
  selectedPair: string;
  onSelectPair: (pair: string) => void;
}) {
  return (
    <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-border bg-panel shrink-0">
      <label htmlFor="mobile-market-pair" className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
        Market
      </label>
      <select
        id="mobile-market-pair"
        value={selectedPair}
        onChange={event => onSelectPair(event.target.value)}
        className="min-w-0 flex-1 h-8 bg-surface border border-border rounded-lg px-2 text-xs font-mono font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
      >
        {MOBILE_MARKET_PAIRS.map(pair => <option key={pair} value={pair}>{pair}</option>)}
      </select>
      <span className="text-[9px] text-muted-foreground/50 whitespace-nowrap">Select pair</span>
    </div>
  );
}