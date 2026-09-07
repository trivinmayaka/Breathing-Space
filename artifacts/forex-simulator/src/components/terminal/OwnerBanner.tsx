import { LayoutDashboard, LogOut, ShieldCheck, Sparkles } from 'lucide-react';

interface OwnerBannerProps {
  onGoAdmin: () => void;
  onLogout:  () => void;
}

export function OwnerBanner({ onGoAdmin, onLogout }: OwnerBannerProps) {
  return (
    <header className="relative flex-shrink-0 border-b border-emerald-500/15 bg-[hsl(220_28%_6%)] text-[11px] overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_12%_0%,rgba(16,185,129,0.12),transparent_34%),radial-gradient(ellipse_at_90%_100%,rgba(37,99,235,0.08),transparent_38%)]" />
      <div className="relative flex items-center justify-between gap-4 px-4 sm:px-5 h-[68px]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl brand-gradient flex items-center justify-center font-black text-white text-sm shadow-lg shadow-blue-900/30">T</div>
            <div className="hidden sm:block leading-none">
              <div className="font-black text-foreground tracking-tight text-sm">TmFX<span className="text-blue-400">Pro</span></div>
              <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">Owner workspace</div>
            </div>
          </div>

          <div className="hidden md:block w-px h-8 bg-border/70" />

          <div className="flex items-center gap-2 min-w-0">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-2 border-emerald-400/60 bg-emerald-500/10 overflow-hidden shadow-lg shadow-emerald-950/30">
                <span className="w-full h-full flex items-center justify-center text-sm font-black text-emerald-300">O</span>
                <img
                  src="/owner-profile.jpeg"
                  alt="Owner profile"
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={event => { event.currentTarget.style.display = 'none'; }}
                />
              </div>
              <span className="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[hsl(220_28%_6%)] shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-foreground truncate">Owner account</span>
                <Sparkles className="w-3 h-3 text-amber-300 shrink-0" />
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-[9px] uppercase tracking-widest text-emerald-400/80">
                <span className="live-dot" style={{ width: 5, height: 5 }} />
                Live terminal
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300/80">
            <ShieldCheck className="w-3.5 h-3.5" />
            Secure session
          </div>
          <button
            onClick={onGoAdmin}
            className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-white/[0.03] px-2.5 py-2 text-muted-foreground/70 hover:text-foreground hover:border-emerald-500/30 hover:bg-emerald-500/[0.06] transition-all"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span className="uppercase tracking-wider text-[9px] font-bold hidden sm:block">Admin hub</span>
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.05] transition-all"
            aria-label="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="uppercase tracking-wider text-[9px] font-bold hidden sm:block">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
