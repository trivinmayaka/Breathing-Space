import { useState } from 'react';
import { OwnerBanner } from '../components/terminal/OwnerBanner';
import { OwnerAccountMetrics } from '../components/terminal/OwnerAccountMetrics';
import { Watchlist } from '../components/terminal/Watchlist';
import { ChartArea } from '../components/terminal/ChartArea';
import { Portfolio } from '../components/terminal/Portfolio';
import { MobileMarketPicker } from '../components/terminal/MobileMarketPicker';

interface OwnerTerminalProps {
  onLogout:  () => void;
  onGoAdmin: () => void;
}

export function OwnerTerminal({ onLogout, onGoAdmin }: OwnerTerminalProps) {
  const [selectedPair, setSelectedPair] = useState('EUR/USD');

  return (
    <div className="owner-portal-bg flex flex-col h-[100dvh] w-full overflow-hidden selection:bg-emerald-500/20">
      <OwnerBanner onGoAdmin={onGoAdmin} onLogout={onLogout} />
      <OwnerAccountMetrics />
      <MobileMarketPicker selectedPair={selectedPair} onSelectPair={setSelectedPair} />
      <div className="flex flex-1 min-h-0 overflow-hidden flex-col lg:flex-row">
        <Watchlist className="hidden lg:flex" selectedPair={selectedPair} onSelectPair={setSelectedPair} />
        {/* Owner gets 1 000 max lots */}
        <div className="flex-1 min-w-0 min-h-0">
          <ChartArea selectedPair={selectedPair} maxLots={1000} />
        </div>
        <Portfolio />
      </div>
    </div>
  );
}
