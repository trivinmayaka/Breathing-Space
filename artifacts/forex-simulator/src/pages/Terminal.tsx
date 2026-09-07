import { useState } from 'react';
import { DemoBanner } from '../components/terminal/DemoBanner';
import { AccountMetrics } from '../components/terminal/AccountMetrics';
import { Watchlist } from '../components/terminal/Watchlist';
import { ChartArea } from '../components/terminal/ChartArea';
import { Portfolio } from '../components/terminal/Portfolio';
import { MobileMarketPicker } from '../components/terminal/MobileMarketPicker';

interface TerminalProps {
  onLogout: () => void;
}

export function Terminal({ onLogout }: TerminalProps) {
  const [selectedPair, setSelectedPair] = useState<string>('EUR/USD');

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background overflow-hidden selection:bg-primary/30">
      <DemoBanner onLogout={onLogout} />
      <AccountMetrics />
      <MobileMarketPicker selectedPair={selectedPair} onSelectPair={setSelectedPair} />
      <div className="flex flex-1 min-h-0 overflow-hidden flex-col lg:flex-row">
        <Watchlist className="hidden lg:flex" selectedPair={selectedPair} onSelectPair={setSelectedPair} />
        <div className="flex-1 min-w-0 min-h-0">
          <ChartArea selectedPair={selectedPair} />
        </div>
        <Portfolio />
      </div>
    </div>
  );
}
