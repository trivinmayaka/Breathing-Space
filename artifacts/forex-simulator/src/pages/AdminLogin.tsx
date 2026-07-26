import { useState } from 'react';

interface Props {
  onLogin: () => void;
  onBack:  () => void;
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className="w-7 h-7 rounded-md brand-gradient flex items-center justify-center font-black text-white text-xs shadow-lg">T</div>
      <span className="font-bold text-base tracking-tight text-foreground">
        TrivinFX<span className="brand-gradient-text">Pro</span>
      </span>
    </div>
  );
}

export default function AdminLogin({ onLogin, onBack }: Props) {
  const [pass,    setPass]    = useState('');
  const [err,     setErr]     = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass }),
      });
      const data = await res.json();
      if (res.ok) { onLogin(); }
      else { setErr(data.error ?? 'Authentication failed.'); }
    } catch {
      setErr('Unable to reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 h-14 border-b border-border bg-panel">
        <Logo />
        <span className="text-[11px] text-muted-foreground/50 uppercase tracking-widest font-semibold">Secure Portal</span>
      </header>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Shield icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
          </div>

          <div className="text-center mb-7">
            <h1 className="text-xl font-bold text-foreground">Owner Authentication</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your secure access credentials</p>
          </div>

          <div className="card-panel p-6">
            {err && (
              <div className="mb-4 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-3">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {err}
              </div>
            )}
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Access Code</label>
                <input
                  type="password" value={pass} onChange={e => setPass(e.target.value)}
                  placeholder="••••••••••••" autoFocus autoComplete="current-password"
                  className="w-full h-11 bg-[hsl(var(--input))] border border-border rounded-lg px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all placeholder:text-muted-foreground/30 font-mono tracking-widest"
                />
              </div>
              <button
                type="submit" disabled={loading || !pass}
                className="w-full h-11 brand-gradient text-white font-semibold rounded-lg text-sm transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Verifying…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/></svg>
                    Authenticate
                  </>
                )}
              </button>
            </form>
          </div>

          <button onClick={onBack} className="mt-5 w-full text-center text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors flex items-center justify-center gap-1.5">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>
            Return to practice platform
          </button>
        </div>
      </div>
    </div>
  );
}
