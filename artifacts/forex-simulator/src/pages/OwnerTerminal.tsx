import { useState } from 'react';
import { OwnerBanner } from '../components/terminal/OwnerBanner';
import { OwnerAccountMetrics } from '../components/terminal/OwnerAccountMetrics';
import { Watchlist } from '../components/terminal/Watchlist';
import { ChartArea } from '../components/terminal/ChartArea';
import { Portfolio } from '../components/terminal/Portfolio';

interface OwnerTerminalProps {
  onLogout:  () => void;
  onGoAdmin: () => void;
}

export function OwnerTerminal({ onLogout, onGoAdmin }: OwnerTerminalProps) {
  const [selectedPair, setSelectedPair] = useState('EUR/USD');

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background overflow-hidden selection:bg-emerald-500/20">
      <OwnerBanner onGoAdmin={onGoAdmin} onLogout={onLogout} />
      <OwnerAccountMetrics />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Watchlist selectedPair={selectedPair} onSelectPair={setSelectedPair} />
        {/* Owner gets 1 000 max lots */}
        <ChartArea selectedPair={selectedPair} maxLots={1000} />
        <Portfolio />
      </div>
    </div>
  );
}
