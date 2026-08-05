import { useState } from 'react';

interface LiveAuthProps {
  onLogin: () => void;
  onBack: () => void;
  onAdmin?: () => void;
}

const API = '/api';

function Logo() {
  return (
    <div className="flex items-center gap-2 select-none">
      <div className="w-8 h-8 rounded-lg brand-gradient flex items-center justify-center font-black text-white shadow-lg text-sm shrink-0">T</div>
      <span className="font-bold text-xl tracking-tight text-foreground">
        TmFX<span className="brand-gradient-text">Pro</span>
      </span>
    </div>
  );
}

function InputField({
  label, type = 'text', value, onChange, placeholder, autoComplete,
}: {
  label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; autoComplete?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full h-11 bg-[hsl(220_25%_10%)] border border-border rounded-lg px-3.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 transition-all"
      />
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {msg}
    </div>
  );
}

function RegisterTab({ onSuccess }: { onSuccess: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [err,      setErr]      = useState('');
  const [loading,  setLoading]  = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/live/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Registration failed.'); return; }
      onSuccess();
    } catch {
      setErr('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <InputField label="Full Name" value={fullName} onChange={setFullName} placeholder="John Smith" autoComplete="name" />
      <InputField label="Email Address" type="email" value={email} onChange={setEmail} placeholder="john@example.com" autoComplete="email" />
      <InputField label="Password" type="password" value={password} onChange={setPassword} placeholder="Min. 6 characters" autoComplete="new-password" />
      <InputField label="Confirm Password" type="password" value={confirm} onChange={setConfirm} placeholder="Repeat password" autoComplete="new-password" />
      {err && <ErrBox msg={err} />}
      <button type="submit" disabled={loading}
        className="w-full h-12 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/30 mt-2">
        {loading ? (
          <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Creating Account…</>
        ) : (
          <><span className="live-dot" style={{ width: 6, height: 6 }} />Open Live Account</>
        )}
      </button>
    </form>
  );
}

function LoginTab({ onSuccess }: { onSuccess: () => void }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [err,      setErr]      = useState('');
  const [loading,  setLoading]  = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/live/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Login failed.'); return; }
      onSuccess();
    } catch {
      setErr('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <InputField label="Email Address" type="email" value={email} onChange={setEmail} placeholder="john@example.com" autoComplete="email" />
      <InputField label="Password" type="password" value={password} onChange={setPassword} placeholder="Your password" autoComplete="current-password" />
      {err && <ErrBox msg={err} />}
      <button type="submit" disabled={loading}
        className="w-full h-12 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/30 mt-2">
        {loading ? (
          <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Signing in…</>
        ) : (
          <><span className="live-dot" style={{ width: 6, height: 6 }} />Sign In to Live Account</>
        )}
      </button>
    </form>
  );
}

export default function LiveAuth({ onLogin, onBack, onAdmin }: LiveAuthProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <nav className="flex items-center justify-between px-6 h-16 border-b border-border bg-[hsl(220_28%_5%/0.95)] backdrop-blur-md">
        <Logo />
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          Back
        </button>
      </nav>

      {/* Main */}
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-[hsl(220_28%_7%)] border border-border rounded-2xl shadow-2xl overflow-hidden">
            {/* Top accent */}
            <div className="h-1 bg-gradient-to-r from-emerald-600 to-teal-500" />

            <div className="p-8">
              {/* Icon + title */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="live-dot" style={{ width: 6, height: 6 }} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Live Account</span>
                  </div>
                  <h2 className="text-base font-bold text-foreground leading-tight">
                    {tab === 'login' ? 'Sign in to trade' : 'Create your account'}
                  </h2>
                </div>
              </div>

              {/* Info banner */}
              <div className="mb-5 bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-4 py-3 text-[11px] text-emerald-300/80 leading-relaxed">
                {tab === 'login'
                  ? 'Access your live trading account. Deposit funds to start trading real markets.'
                  : 'Register for free. Your balance starts at $0 — deposit funds to begin trading.'
                }
              </div>

              {/* Tabs */}
              <div className="flex rounded-lg bg-[hsl(220_25%_10%)] p-1 mb-5">
                {(['login', 'register'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
                      tab === t
                        ? 'bg-emerald-700 text-white shadow'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t === 'login' ? 'Sign In' : 'Register'}
                  </button>
                ))}
              </div>

              {/* Form */}
              {tab === 'login'
                ? <LoginTab onSuccess={onLogin} />
                : <RegisterTab onSuccess={onLogin} />
              }
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground/40 mt-4">
            Live accounts require a deposit to start trading. Admin controls all balance approvals.
          </p>
          {onAdmin && (
            <div className="text-center mt-3">
              <button onClick={onAdmin} className="text-[11px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors">
                Platform administrator? <span className="underline underline-offset-2">Admin login →</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
