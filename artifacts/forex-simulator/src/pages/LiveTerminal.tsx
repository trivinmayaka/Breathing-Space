import { useState, useEffect, useRef, useCallback } from 'react';
import { ChartArea } from '../components/terminal/ChartArea';

const API = '/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface LivePosition {
  id: number; pair: string; action: string; lots: number;
  openPrice: number; currentPrice: number; pnl: number;
  sl: number | null; tp: number | null; openedAt: string; dec: number;
}
interface LiveAccount {
  balance: number; equity: number; floatingPnl: number;
  marginUsed: number; freeMargin: number; marginLevel: number;
  totalTrades: number; winRate: number; realizedPnl: number;
  positions: LivePosition[];
}
interface PriceData {
  bid: number; ask: number; mid: number; spreadPips: number;
  changePct: number; direction: string; dec: number; pip: number; group: string;
}
interface PriceSnapshot { [pair: string]: PriceData }
interface DepositForm {
  amount: string; paymentMethod: string; paymentReference: string; contact: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt  = (n: number, d = 2) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const pnlCls = (n: number) => n >= 0 ? 'text-emerald-400' : 'text-red-400';
const pnlStr = (n: number) => `${n >= 0 ? '+' : '-'}${fmt(n)}`;
const fmtPrice = (p: number, dec: number) => p.toFixed(dec);

const PAIRS = [
  'EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF',
  'NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','XAU/USD','BTC/USD',
  'USD/MXN','USD/ZAR','EUR/CHF',
];

// ─── Payment methods config ───────────────────────────────────────────────────
const DEPOSIT_METHODS = [
  {
    id: 'mpesa',
    label: 'M-Pesa',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 15.75h3" />
      </svg>
    ),
    color: 'emerald',
    instructions: [
      { label: 'Paybill Number', value: '247247' },
      { label: 'Account Number', value: 'TrivinFX' },
    ],
    hint: 'Go to M-Pesa → Lipa na M-Pesa → Paybill, enter the details above, then paste your confirmation code below.',
    refPlaceholder: 'e.g. QGH3K2X1W4',
  },
  {
    id: 'airtel',
    label: 'Airtel Money',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 15.75h3" />
      </svg>
    ),
    color: 'red',
    instructions: [
      { label: 'Send to Number', value: '+254 733 000 000' },
      { label: 'Account Name', value: 'TrivinFX Ltd' },
    ],
    hint: 'Open Airtel Money → Send Money, enter the number above, then share the transaction ID.',
    refPlaceholder: 'e.g. AT2024XXXXXXXX',
  },
  {
    id: 'bank',
    label: 'Bank Transfer',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
      </svg>
    ),
    color: 'blue',
    instructions: [
      { label: 'Bank', value: 'Equity Bank' },
      { label: 'Account No.', value: '0123456789' },
      { label: 'Account Name', value: 'TrivinFX Financial Ltd' },
    ],
    hint: 'Transfer via internet banking or at a branch. Use your name as the reference so we can match your payment.',
    refPlaceholder: 'Bank reference or slip number',
  },
  {
    id: 'crypto',
    label: 'Crypto (USDT)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
    color: 'amber',
    instructions: [
      { label: 'Network', value: 'TRC20 (Tron)' },
      { label: 'Wallet Address', value: 'TRxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    ],
    hint: 'Send USDT via TRC20 only. Paste the transaction hash below after sending.',
    refPlaceholder: 'Transaction hash (TxID)',
  },
  {
    id: 'western',
    label: 'Western Union',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'yellow',
    instructions: [
      { label: 'Receiver Name', value: 'John Kamau' },
      { label: 'Country', value: 'Kenya' },
      { label: 'City', value: 'Nairobi' },
    ],
    hint: 'Visit a Western Union agent and send to the details above. Share the MTCN tracking number below.',
    refPlaceholder: 'MTCN tracking number',
  },
  {
    id: 'cash',
    label: 'Cash',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
    color: 'violet',
    instructions: [
      { label: 'Office', value: 'TrivinFX HQ, Nairobi CBD' },
      { label: 'Hours', value: 'Mon–Fri, 9 AM – 5 PM' },
      { label: 'Contact', value: '+254 700 000 000' },
    ],
    hint: 'Visit our office with cash. Our agent will issue a receipt and your account is credited same day.',
    refPlaceholder: 'Receipt number from agent',
  },
] as const;

type MethodId = typeof DEPOSIT_METHODS[number]['id'];

const colorMap: Record<string, string> = {
  emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  red:     'border-red-500/40     bg-red-500/10     text-red-400',
  blue:    'border-blue-500/40    bg-blue-500/10    text-blue-400',
  amber:   'border-amber-500/40   bg-amber-500/10   text-amber-400',
  yellow:  'border-yellow-500/40  bg-yellow-500/10  text-yellow-400',
  violet:  'border-violet-500/40  bg-violet-500/10  text-violet-400',
};

const btnMap: Record<string, string> = {
  emerald: 'bg-emerald-700 hover:bg-emerald-600',
  red:     'bg-red-700     hover:bg-red-600',
  blue:    'bg-blue-700    hover:bg-blue-600',
  amber:   'bg-amber-700   hover:bg-amber-600',
  yellow:  'bg-yellow-700  hover:bg-yellow-600',
  violet:  'bg-violet-700  hover:bg-violet-600',
};

// ─── Deposit Modal ────────────────────────────────────────────────────────────
function DepositModal({ onClose }: { onClose: () => void }) {
  const [step, setStep]         = useState<'pick' | 'form' | 'done'>('pick');
  const [methodId, setMethodId] = useState<MethodId | null>(null);
  const [amount, setAmount]     = useState('');
  const [ref, setRef]           = useState('');
  const [contact, setContact]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');
  const [credited, setCredited] = useState('');

  const method = DEPOSIT_METHODS.find(m => m.id === methodId);

  function pick(id: MethodId) {
    setMethodId(id);
    setErr('');
    setStep('form');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!method) return;
    setErr(''); setLoading(true);
    try {
      const res = await fetch(`${API}/live/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          paymentMethod: method.label,
          paymentReference: ref,
          contact,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Failed'); return; }
      setCredited(data.message ?? `$${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} credited to your account.`);
      setStep('done');
    } catch { setErr('Network error. Please try again.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-[hsl(220_28%_7%)] border border-border rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            {step === 'form' && (
              <button onClick={() => { setStep('pick'); setErr(''); }}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all -ml-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
              </button>
            )}
            <div>
              <p className="text-sm font-bold text-foreground">
                {step === 'pick' ? 'Deposit Funds' : step === 'form' ? `Pay via ${method?.label}` : 'Request Submitted'}
              </p>
              {step === 'pick' && <p className="text-[11px] text-muted-foreground">Choose how you'd like to send funds</p>}
              {step === 'form' && <p className="text-[11px] text-muted-foreground">Follow the instructions and fill in your details</p>}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Step: Pick method */}
        {step === 'pick' && (
          <div className="p-5 grid grid-cols-3 gap-3">
            {DEPOSIT_METHODS.map(m => {
              const cls = colorMap[m.color] ?? colorMap.emerald;
              return (
                <button key={m.id} onClick={() => pick(m.id)}
                  className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border transition-all hover:scale-[1.03] active:scale-100 ${cls}`}>
                  <span>{m.icon}</span>
                  <span className="text-xs font-bold text-foreground">{m.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Step: Form */}
        {step === 'form' && method && (
          <form onSubmit={submit} className="p-5 space-y-4">
            {/* Payment instructions box */}
            <div className={`rounded-xl border p-4 space-y-2 ${colorMap[method.color]}`}>
              <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">Send payment to</p>
              <div className="space-y-1.5">
                {method.instructions.map(({ label, value }) => (
                  <div key={label} className="flex items-start justify-between gap-3">
                    <span className="text-xs text-foreground/60 shrink-0">{label}</span>
                    <span className="text-xs font-mono font-bold text-foreground text-right break-all">{value}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-foreground/60 leading-relaxed pt-1 border-t border-current/20">{method.hint}</p>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Amount (USD)</label>
              <input required type="number" min="1" max="1000000" step="0.01"
                value={amount} onChange={e => { setAmount(e.target.value); setErr(''); }}
                placeholder="e.g. 500"
                className="w-full h-10 bg-[hsl(220_25%_10%)] border border-border rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/60 transition-all" />
            </div>

            {/* Reference */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Transaction Reference / ID</label>
              <input required type="text"
                value={ref} onChange={e => { setRef(e.target.value); setErr(''); }}
                placeholder={method.refPlaceholder}
                className="w-full h-10 bg-[hsl(220_25%_10%)] border border-border rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/60 transition-all" />
            </div>

            {/* Contact */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Your Phone or Email</label>
              <input required type="text"
                value={contact} onChange={e => { setContact(e.target.value); setErr(''); }}
                placeholder="For deposit confirmation"
                className="w-full h-10 bg-[hsl(220_25%_10%)] border border-border rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/60 transition-all" />
            </div>

            {err && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</div>}

            <button type="submit" disabled={loading}
              className={`w-full h-11 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 ${btnMap[method.color] ?? btnMap.emerald}`}>
              {loading
                ? <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Submitting…</>
                : <>Submit Deposit Request</>
              }
            </button>
          </form>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="p-8 flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
            </div>
            <p className="text-base font-bold text-foreground">Deposit Successful!</p>
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-5 py-3 w-full">
              <p className="text-sm text-emerald-300 font-semibold">{credited}</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
              Your balance has been updated. You can start trading immediately.
            </p>
            <button onClick={onClose}
              className="mt-2 px-8 h-11 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm transition-all w-full">
              Start Trading
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Withdrawal Modal ─────────────────────────────────────────────────────────
function WithdrawModal({ balance, onClose }: { balance: number; onClose: () => void }) {
  const [form, setForm] = useState({ amount: '', paymentMethod: '', accountDetails: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [err, setErr] = useState('');

  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const res = await fetch(`${API}/live/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Failed'); return; }
      setSuccess(data.message);
    } catch { setErr('Network error.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-[hsl(220_28%_7%)] border border-border rounded-2xl shadow-2xl p-7 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Request Withdrawal</h2>
            <p className="text-xs text-muted-foreground">Available balance: <span className="font-mono text-foreground">${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></p>
          </div>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-sm text-emerald-300">{success}</div>
            <button onClick={onClose} className="w-full h-11 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded-xl text-sm transition-all">Close</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Amount (USD)</label>
              <input type="number" value={form.amount} onChange={e => set('amount')(e.target.value)}
                placeholder={`Max $${balance.toFixed(2)}`} min="1" max={balance} step="0.01"
                className="w-full h-10 bg-[hsl(220_25%_10%)] border border-border rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/60 transition-all" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Payment Method</label>
              <input type="text" value={form.paymentMethod} onChange={e => set('paymentMethod')(e.target.value)}
                placeholder="e.g. M-Pesa, Bank Transfer, Crypto"
                className="w-full h-10 bg-[hsl(220_25%_10%)] border border-border rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/60 transition-all" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Account Details</label>
              <input type="text" value={form.accountDetails} onChange={e => set('accountDetails')(e.target.value)}
                placeholder="Phone number, bank account, or wallet address"
                className="w-full h-10 bg-[hsl(220_25%_10%)] border border-border rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/60 transition-all" />
            </div>
            {err && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</div>}
            <button type="submit" disabled={loading || balance <= 0}
              className="w-full h-11 bg-amber-700 hover:bg-amber-600 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2">
              {loading ? 'Submitting…' : 'Submit Withdrawal Request'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Order Modal ──────────────────────────────────────────────────────────────
function OrderModal({
  pair, prices, balance, onClose, onPlaced,
}: {
  pair: string; prices: PriceSnapshot; balance: number;
  onClose: () => void; onPlaced: () => void;
}) {
  const [action, setAction] = useState<'BUY' | 'SELL'>('BUY');
  const [lots, setLots] = useState('0.10');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const pd = prices[pair];

  async function place() {
    setErr(''); setLoading(true);
    try {
      const res = await fetch(`${API}/live/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair, action, lots: parseFloat(lots) }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Failed'); return; }
      onPlaced();
    } catch { setErr('Network error.'); }
    finally { setLoading(false); }
  }

  const price = pd ? (action === 'BUY' ? pd.ask : pd.bid) : 0;
  const dec = pd?.dec ?? 5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-[hsl(220_28%_7%)] border border-border rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-base text-foreground">Place Order — {pair}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {balance <= 0 && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 text-xs text-amber-300">
            ⚠ Your balance is $0. Please request a deposit before trading.
          </div>
        )}

        <div className="flex gap-2 mb-5">
          {(['BUY', 'SELL'] as const).map(a => (
            <button key={a} onClick={() => setAction(a)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                action === a
                  ? a === 'BUY' ? 'bg-emerald-700 text-white' : 'bg-red-700 text-white'
                  : 'bg-[hsl(220_25%_10%)] text-muted-foreground hover:text-foreground'
              }`}
            >{a}</button>
          ))}
        </div>

        <div className="mb-4">
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Lots</label>
          <input type="number" value={lots} onChange={e => setLots(e.target.value)} min="0.01" max="100" step="0.01"
            className="w-full h-10 bg-[hsl(220_25%_10%)] border border-border rounded-lg px-3 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all" />
        </div>

        <div className="bg-[hsl(220_25%_10%)] rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{action === 'BUY' ? 'Ask' : 'Bid'}</span>
          <span className="font-mono font-bold text-foreground">{pd ? fmtPrice(price, dec) : '—'}</span>
        </div>

        {err && <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</div>}

        <button onClick={place} disabled={loading || balance <= 0}
          className={`w-full h-11 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-50 ${
            action === 'BUY' ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-red-700 hover:bg-red-600'
          }`}
        >
          {loading ? 'Placing…' : `${action} ${lots} lots @ ${pd ? fmtPrice(price, dec) : '…'}`}
        </button>
      </div>
    </div>
  );
}

// ─── Main LiveTerminal ────────────────────────────────────────────────────────
interface LiveTerminalProps {
  onLogout: () => void;
}

export function LiveTerminal({ onLogout }: LiveTerminalProps) {
  const [account,  setAccount]  = useState<LiveAccount | null>(null);
  const [prices,   setPrices]   = useState<PriceSnapshot>({});
  const [selPair,  setSelPair]  = useState('EUR/USD');
  const [showDep,  setShowDep]  = useState(false);
  const [showWith, setShowWith] = useState(false);
  const [orderPair, setOrderPair] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'positions' | 'history'>('positions');
  const [history,  setHistory]  = useState<any[]>([]);
  const [closing,  setClosing]  = useState<Record<number, boolean>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAccount = useCallback(async () => {
    try {
      const res = await fetch(`${API}/live/account`);
      if (res.status === 401) { onLogout(); return; }
      setAccount(await res.json());
    } catch {}
  }, [onLogout]);

  const loadPrices = useCallback(async () => {
    try {
      const res = await fetch(`${API}/forex/prices`);
      setPrices(await res.json());
    } catch {}
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API}/live/history`);
      if (res.ok) setHistory(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    loadAccount(); loadPrices();
    const id1 = setInterval(loadAccount, 3000);
    const id2 = setInterval(loadPrices, 1500);
    return () => { clearInterval(id1); clearInterval(id2); };
  }, [loadAccount, loadPrices]);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab, loadHistory]);

  async function closePosition(id: number) {
    setClosing(c => ({ ...c, [id]: true }));
    try {
      await fetch(`${API}/live/positions/${id}`, { method: 'DELETE' });
      await loadAccount();
    } finally {
      setClosing(c => { const n = { ...c }; delete n[id]; return n; });
    }
  }

  const bal = account?.balance ?? 0;
  const eq  = account?.equity ?? 0;
  const fp  = account?.floatingPnl ?? 0;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background overflow-hidden selection:bg-primary/30">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 h-11 border-b border-border bg-[hsl(220_28%_6%)] shrink-0 gap-3">
        {/* Left */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-6 h-6 rounded-md brand-gradient flex items-center justify-center text-[10px] font-black text-white shrink-0">T</div>
          <span className="hidden sm:block text-sm font-bold text-foreground tracking-tight">
            TrivinFX<span className="brand-gradient-text">Pro</span>
          </span>
          <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
            <span className="live-dot" style={{ width: 5, height: 5 }} />
            <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">Live</span>
          </div>
        </div>

        {/* Centre: metrics */}
        <div className="hidden md:flex items-center gap-5 text-xs">
          <div className="text-center">
            <div className="text-[9px] text-muted-foreground uppercase tracking-widest">Balance</div>
            <div className="font-mono font-bold text-foreground">{fmt(bal)}</div>
          </div>
          <div className="w-px h-6 bg-border" />
          <div className="text-center">
            <div className="text-[9px] text-muted-foreground uppercase tracking-widest">Equity</div>
            <div className={`font-mono font-bold ${pnlCls(eq - bal)}`}>{fmt(eq)}</div>
          </div>
          <div className="w-px h-6 bg-border" />
          <div className="text-center">
            <div className="text-[9px] text-muted-foreground uppercase tracking-widest">Float P&amp;L</div>
            <div className={`font-mono font-bold ${pnlCls(fp)}`}>{fp >= 0 ? '+' : ''}{fmt(fp)}</div>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowDep(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700/30 hover:bg-emerald-700/50 border border-emerald-700/50 text-emerald-400 text-xs font-bold transition-all">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            <span className="hidden sm:block">Deposit</span>
          </button>
          <button onClick={() => setShowWith(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-700/30 hover:bg-amber-700/50 border border-amber-700/50 text-amber-400 text-xs font-bold transition-all">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20v-16m-8 8h16"/>
            </svg>
            <span className="hidden sm:block">Withdraw</span>
          </button>
          <button onClick={onLogout} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-white/5">
            Sign Out
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Watchlist ── */}
        <div className="w-[160px] shrink-0 flex flex-col border-r border-border bg-[hsl(220_28%_6%)] overflow-y-auto">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Watchlist</p>
          </div>
          {PAIRS.map(pair => {
            const pd = prices[pair];
            const isSel = pair === selPair;
            return (
              <button key={pair} onClick={() => setSelPair(pair)}
                className={`w-full text-left px-3 py-2 border-b border-border/40 transition-colors ${isSel ? 'bg-blue-500/10' : 'hover:bg-white/[0.03]'}`}
              >
                <div className={`text-[11px] font-bold ${isSel ? 'text-blue-400' : 'text-foreground/80'}`}>{pair}</div>
                {pd ? (
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="font-mono text-[10px] text-foreground/70">{fmtPrice(pd.mid, pd.dec)}</span>
                    <span className={`text-[9px] font-semibold ${pd.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {pd.changePct >= 0 ? '+' : ''}{pd.changePct.toFixed(2)}%
                    </span>
                  </div>
                ) : (
                  <div className="text-[9px] text-muted-foreground/40 mt-0.5">Loading…</div>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Chart + Trade ── */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {/* Pair bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[hsl(220_28%_6%)] shrink-0">
            <div className="flex items-center gap-3">
              <span className="font-bold text-foreground">{selPair}</span>
              {prices[selPair] && (
                <>
                  <span className="font-mono text-lg text-foreground">{fmtPrice(prices[selPair].mid, prices[selPair].dec)}</span>
                  <span className={`text-xs font-semibold ${prices[selPair].changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {prices[selPair].changePct >= 0 ? '+' : ''}{prices[selPair].changePct.toFixed(2)}%
                  </span>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setOrderPair(selPair)}
                className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold transition-all">
                Buy / Sell
              </button>
            </div>
          </div>

          {/* Chart */}
          <div className="flex-1 min-h-0">
            <ChartArea selectedPair={selPair} />
          </div>
        </div>

        {/* ── Right panel: Positions / History ── */}
        <div className="w-[300px] shrink-0 flex flex-col border-l border-border bg-[hsl(220_28%_6%)] overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-border shrink-0">
            {(['positions', 'history'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors border-b-2 -mb-px ${
                  activeTab === t ? 'border-blue-500 text-blue-400' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'positions' ? `Positions${account ? ` (${account.positions.length})` : ''}` : 'History'}
              </button>
            ))}
          </div>

          {/* Mobile balance (visible < md) */}
          <div className="md:hidden grid grid-cols-3 gap-0 border-b border-border shrink-0">
            {[['Balance', fmt(bal), ''], ['Equity', fmt(eq), pnlCls(eq-bal)], ['P&L', `${fp>=0?'+':''}${fmt(fp)}`, pnlCls(fp)]].map(([l, v, c]) => (
              <div key={l} className="text-center py-2 border-r border-border last:border-r-0">
                <div className="text-[8px] text-muted-foreground uppercase tracking-wider">{l}</div>
                <div className={`font-mono text-[11px] font-bold ${c}`}>{v}</div>
              </div>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'positions' && (
              <div className="p-2 space-y-2">
                {!account || account.positions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/50">
                    <svg className="w-8 h-8 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    <p className="text-xs">No open positions</p>
                    {bal <= 0 && <p className="text-[10px] mt-1 text-amber-400/70">Deposit to start trading</p>}
                  </div>
                ) : (
                  account.positions.map(pos => (
                    <div key={pos.id} className="bg-[hsl(220_25%_8%)] border border-border/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${pos.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{pos.action}</span>
                          <span className="text-xs font-bold text-foreground">{pos.pair}</span>
                        </div>
                        <span className={`text-xs font-mono font-bold ${pnlCls(pos.pnl)}`}>{pnlStr(pos.pnl)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 text-[10px] text-muted-foreground mb-2">
                        <span>Open: <span className="text-foreground font-mono">{fmtPrice(pos.openPrice, pos.dec)}</span></span>
                        <span>Now: <span className="text-foreground font-mono">{fmtPrice(pos.currentPrice, pos.dec)}</span></span>
                        <span>Lots: <span className="text-foreground">{pos.lots}</span></span>
                      </div>
                      <button onClick={() => closePosition(pos.id)} disabled={!!closing[pos.id]}
                        className="w-full py-1 text-[10px] border border-red-900/40 text-red-400/70 hover:text-red-400 hover:border-red-700/50 rounded-md transition-colors disabled:opacity-40 font-semibold">
                        {closing[pos.id] ? 'Closing…' : 'Close Position'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="p-2 space-y-2">
                {history.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground/50 text-xs">No trade history yet</div>
                ) : (
                  history.map((t: any) => (
                    <div key={t.id} className="bg-[hsl(220_25%_8%)] border border-border/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${t.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{t.action}</span>
                          <span className="text-xs font-bold text-foreground">{t.pair}</span>
                          <span className="text-[10px] text-muted-foreground">{t.lots}L</span>
                        </div>
                        <span className={`text-xs font-mono font-bold ${pnlCls(t.pnl)}`}>{pnlStr(t.pnl)}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/50">
                        {t.closedAt ? new Date(t.closedAt).toLocaleString() : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Stats footer */}
          {account && (
            <div className="shrink-0 border-t border-border px-3 py-2 grid grid-cols-2 gap-2 text-[10px]">
              <div><span className="text-muted-foreground">Trades: </span><span className="font-semibold">{account.totalTrades}</span></div>
              <div><span className="text-muted-foreground">Win rate: </span><span className="font-semibold">{account.totalTrades > 0 ? `${account.winRate}%` : '—'}</span></div>
              <div><span className="text-muted-foreground">Realized: </span><span className={`font-semibold ${pnlCls(account.realizedPnl)}`}>{pnlStr(account.realizedPnl)}</span></div>
              <div><span className="text-muted-foreground">Free margin: </span><span className="font-semibold">{fmt(account.freeMargin)}</span></div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showDep  && <DepositModal  onClose={() => { setShowDep(false);  loadAccount(); }} />}
      {showWith && <WithdrawModal balance={bal} onClose={() => { setShowWith(false); loadAccount(); }} />}
      {orderPair && (
        <OrderModal
          pair={orderPair} prices={prices} balance={bal}
          onClose={() => setOrderPair(null)}
          onPlaced={() => { setOrderPair(null); loadAccount(); }}
        />
      )}
    </div>
  );
}
