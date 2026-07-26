import { useState } from 'react';
import { DemoBanner } from '../components/terminal/DemoBanner';
import { AccountMetrics } from '../components/terminal/AccountMetrics';
import { Watchlist } from '../components/terminal/Watchlist';
import { ChartArea } from '../components/terminal/ChartArea';
import { Portfolio } from '../components/terminal/Portfolio';

interface TerminalProps {
  onLogout: () => void;
}

export function Terminal({ onLogout }: TerminalProps) {
  const [selectedPair, setSelectedPair] = useState<string>('EUR/USD');

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background overflow-hidden selection:bg-primary/30">
      <DemoBanner onLogout={onLogout} />
      <AccountMetrics />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Watchlist selectedPair={selectedPair} onSelectPair={setSelectedPair} />
        <ChartArea selectedPair={selectedPair} />
        <Portfolio />
      </div>
    </div>
  );
}
