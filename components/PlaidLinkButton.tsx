'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Link, RefreshCw } from 'lucide-react';

interface PlaidLinkButtonProps {
  onSuccess?: () => void;
}

export function PlaidLinkButton({ onSuccess }: PlaidLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchLinkToken = useCallback(async () => {
    setFetching(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/plaid/link-token', { method: 'POST' });
      const data = await res.json() as { link_token?: string; error?: string };
      if (!res.ok || !data.link_token) throw new Error(data.error ?? 'Failed to get link token');
      setLinkToken(data.link_token);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start bank connection');
      setStatus('error');
      setTimeout(() => { setStatus('idle'); setErrorMsg(null); }, 6000);
    } finally {
      setFetching(false);
    }
  }, []);

  const handlePlaidSuccess = useCallback(async (public_token: string) => {
    setExchanging(true);
    try {
      const res = await fetch('/api/plaid/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Token exchange failed');
      setStatus('ok');
      setLinkToken(null);
      setTimeout(() => setStatus('idle'), 5000);
      onSuccess?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to connect bank');
      setStatus('error');
      setTimeout(() => { setStatus('idle'); setErrorMsg(null); }, 6000);
    } finally {
      setExchanging(false);
    }
  }, [onSuccess]);

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: (public_token) => handlePlaidSuccess(public_token),
    onExit: () => setLinkToken(null),
  });

  // Auto-open Plaid Link once the token is fetched and SDK is ready
  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  const handleClick = useCallback(() => {
    fetchLinkToken();
  }, [fetchLinkToken]);

  const busy = fetching || exchanging;

  return (
    <div className="flex items-center gap-2">
      {status === 'ok' && (
        <span className="font-mono text-[10px]" style={{ color: 'var(--accent-green)' }}>
          BANK CONNECTED ✓
        </span>
      )}
      {status === 'error' && errorMsg && (
        <span className="font-mono text-[10px]" style={{ color: 'var(--accent-red)' }}>
          {errorMsg}
        </span>
      )}
      <button
        onClick={handleClick}
        disabled={busy}
        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border border-border rounded-sm hover:border-accent-green hover:text-accent-green transition-colors disabled:opacity-40"
        title="Connect a bank account via Plaid"
      >
        {busy
          ? <RefreshCw size={10} className="animate-spin" />
          : <Link size={10} />
        }
        {fetching ? 'LOADING...' : exchanging ? 'CONNECTING...' : 'CONNECT BANK'}
      </button>
    </div>
  );
}
