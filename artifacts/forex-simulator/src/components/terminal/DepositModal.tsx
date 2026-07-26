import { useState } from 'react';
import { X, Banknote, CheckCircle2 } from 'lucide-react';

interface DepositModalProps {
  onClose: () => void;
}

const PAYMENT_METHODS = [
  'M-Pesa',
  'Bank Transfer',
  'Cash',
  'Airtel Money',
  'Western Union',
  'MoneyGram',
  'Other',
];

export function DepositModal({ onClose }: DepositModalProps) {
  const [form, setForm] = useState({
    traderName: '',
    contact: '',
    amount: '',
    paymentMethod: '',
    paymentReference: '',
  });
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);

  function set(field: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setError('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.paymentMethod) { setError('Please select a payment method.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Something went wrong.'); return; }
      setSuccess(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Banknote className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-sm">Deposit Funds</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground/50 hover:text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          /* Success state */
          <div className="px-6 py-10 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            <p className="font-bold text-base">Request Submitted!</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your deposit request has been received. Once the admin confirms your payment,
              your account balance will be credited automatically.
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          /* Form */
          <form onSubmit={submit} className="px-6 py-5 flex flex-col gap-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Fill in your details and payment info. The admin will verify and credit your account.
            </p>

            {error && (
              <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <Field label="Your Name">
              <input
                required
                type="text"
                placeholder="Full name"
                value={form.traderName}
                onChange={e => set('traderName', e.target.value)}
                className="input-base"
              />
            </Field>

            <Field label="Contact (Phone or Email)">
              <input
                required
                type="text"
                placeholder="e.g. +254700000000 or you@email.com"
                value={form.contact}
                onChange={e => set('contact', e.target.value)}
                className="input-base"
              />
            </Field>

            <Field label="Deposit Amount (USD)">
              <input
                required
                type="number"
                placeholder="e.g. 500"
                min="1"
                max="1000000"
                step="0.01"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                className="input-base"
              />
            </Field>

            <Field label="Payment Method">
              <select
                required
                value={form.paymentMethod}
                onChange={e => set('paymentMethod', e.target.value)}
                className="input-base"
              >
                <option value="">Select method…</option>
                {PAYMENT_METHODS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>

            <Field label="Payment Reference / Transaction ID">
              <input
                required
                type="text"
                placeholder="e.g. QGH3K2X or confirmation code"
                value={form.paymentReference}
                onChange={e => set('paymentReference', e.target.value)}
                className="input-base"
              />
            </Field>

            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 py-2.5 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
              >
                {busy ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
