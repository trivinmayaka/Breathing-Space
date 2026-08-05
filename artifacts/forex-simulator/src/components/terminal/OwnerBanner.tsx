import { LayoutDashboard, LogOut } from 'lucide-react';

interface OwnerBannerProps {
  onGoAdmin: () => void;
  onLogout:  () => void;
}

export function OwnerBanner({ onGoAdmin, onLogout }: OwnerBannerProps) {
  return (
    <div className="flex-shrink-0 flex items-center justify-between px-5 h-9 border-b border-border bg-panel text-[11px]">
      <div className="flex items-center gap-5">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded brand-gradient flex items-center justify-center font-black text-white text-[9px]">T</div>
          <span className="font-bold text-foreground/90 tracking-tight">TmFX<span className="text-blue-400">Pro</span></span>
        </div>
        <div className="w-px h-4 bg-border" />
        {/* Live badge */}
        <div className="flex items-center gap-1.5">
          <div className="live-dot" />
          <span className="font-bold uppercase tracking-widest text-[10px] text-emerald-400">Live Account</span>
        </div>
        <div className="hidden md:flex items-center gap-1 text-[10px] text-muted-foreground/40">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>
          Authenticated · Full Access
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={onGoAdmin}
          className="flex items-center gap-1.5 text-muted-foreground/50 hover:text-foreground transition-colors"
        >
          <LayoutDashboard className="w-3 h-3" />
          <span className="uppercase tracking-wider text-[10px] font-semibold hidden sm:block">Admin</span>
        </button>
        <div className="w-px h-3.5 bg-border" />
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 text-muted-foreground/50 hover:text-foreground transition-colors"
        >
          <LogOut className="w-3 h-3" />
          <span className="uppercase tracking-wider text-[10px] font-semibold hidden sm:block">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
