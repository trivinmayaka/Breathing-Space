import { useState } from 'react';
import { LogOut, PlusCircle } from 'lucide-react';
import { DepositModal } from './DepositModal';

interface DemoBannerProps {
  onLogout?: () => void;
}

export function DemoBanner({ onLogout }: DemoBannerProps) {
  const [showDeposit, setShowDeposit] = useState(false);

  return (
    <>
      <div className="flex-shrink-0 flex items-center justify-between px-5 h-9 border-b border-amber-900/30 bg-amber-950/25 text-[11px]">
        <div className="flex items-center gap-5">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded brand-gradient flex items-center justify-center font-black text-white text-[9px]">T</div>
            <span className="font-bold text-foreground/80 tracking-tight">TmFX<span className="text-blue-400">Pro</span></span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1.5 text-amber-500/70 font-medium uppercase tracking-widest text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 inline-block" />
            Practice Account
          </div>
          <span className="text-muted-foreground/30 text-[10px]">Virtual funds only · No real money</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Deposit button */}
          <button
            onClick={() => setShowDeposit(true)}
            className="flex items-center gap-1.5 text-emerald-400/80 hover:text-emerald-300 transition-colors font-semibold"
          >
            <PlusCircle className="w-3 h-3" />
            <span className="uppercase tracking-wider text-[10px]">Deposit Funds</span>
          </button>

          {onLogout && (
            <>
              <div className="w-px h-4 bg-border" />
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              >
                <LogOut className="w-3 h-3" />
                <span className="uppercase tracking-wider text-[10px] font-semibold">Logout</span>
              </button>
            </>
          )}
        </div>
      </div>

      {showDeposit && <DepositModal onClose={() => setShowDeposit(false)} />}
    </>
  );
}
