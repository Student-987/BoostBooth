import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { adminApi, setAdminToken } from '../../services/apiClient';

interface AdminGateProps {
  mode: 'env' | 'claimed' | 'unclaimed';
  onAuthenticated: () => void;
  onExitToKiosk: () => void;
}

export function AdminGate({ mode, onAuthenticated, onExitToKiosk }: AdminGateProps) {
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isClaim = mode === 'unclaimed';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (passcode.trim().length < 4) {
      setError('Passcode must be at least 4 characters.');
      return;
    }
    if (isClaim && passcode !== confirmPasscode) {
      setError('Passcodes do not match.');
      return;
    }

    setBusy(true);
    try {
      const res = isClaim
        ? await adminApi.claimPasscode(passcode)
        : await adminApi.login(passcode);
      setAdminToken(res.token);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF9FA] text-zinc-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#EFEAEC] shadow-sm p-8">
        <div className="flex items-center justify-between">
          <div className="w-11 h-11 rounded-xl bg-[#7A1C2C] text-white flex items-center justify-center">
            {isClaim ? <ShieldCheck className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
          </div>
          <button
            type="button"
            onClick={onExitToKiosk}
            className="text-xs font-medium text-zinc-500 hover:text-[#7A1C2C] inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Kiosk</span>
          </button>
        </div>

        <h1 className="mt-5 font-display text-2xl font-bold text-zinc-900">
          {isClaim ? 'Claim Admin Passcode' : 'Admin Dashboard Sign In'}
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500 leading-relaxed">
          {isClaim
            ? 'Set an initial administrator passcode to secure frame management, Google Sheets sync, and file controls.'
            : 'Enter your BoostBooth administrator passcode to manage frames, sessions, and system settings.'}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              {isClaim ? 'New Admin Passcode' : 'Admin Passcode'}
            </label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Minimum 4 characters"
              autoFocus
              className="w-full min-h-[46px] rounded-xl border border-[#E5DADF] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7A1C2C]"
            />
          </div>

          {isClaim && (
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                Confirm Passcode
              </label>
              <input
                type="password"
                value={confirmPasscode}
                onChange={(e) => setConfirmPasscode(e.target.value)}
                placeholder="Re-enter passcode"
                className="w-full min-h-[46px] rounded-xl border border-[#E5DADF] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7A1C2C]"
              />
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-[48px] rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {busy ? 'Verifying...' : isClaim ? 'Claim & Open Admin' : 'Unlock Admin Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
