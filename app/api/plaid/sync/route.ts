import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CLIENT_ID } from '@/lib/supabase';

// ─── Plaid env routing ────────────────────────────────────────────────────────

const PLAID_BASE: Record<string, string> = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
};

function plaidBaseUrl(): string {
  const env = (process.env.PLAID_ENV ?? 'production').toLowerCase();
  return PLAID_BASE[env] ?? PLAID_BASE.production;
}

async function plaidPost<T = unknown>(path: string, body: object): Promise<T> {
  const res = await fetch(`${plaidBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      ...body,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Plaid ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as T;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  date: string;
  name: string;
  merchant_name?: string;
  amount: number;
  personal_finance_category?: { primary: string };
  payment_channel?: string;
  pending: boolean;
}

function flattenTransaction(t: PlaidTransaction) {
  return {
    transaction_id: t.transaction_id,
    account_id: t.account_id,
    date: t.date,
    name: t.name,
    merchant_name: t.merchant_name ?? null,
    amount: t.amount,
    category_primary: t.personal_finance_category?.primary ?? null,
    payment_channel: t.payment_channel ?? null,
    pending: t.pending,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

// GET = Vercel cron (requires CRON_SECRET). POST = manual trigger from dashboard (no auth needed).
export async function GET(req: NextRequest) {
  return handler(req, true);
}
export async function POST(req: NextRequest) {
  return handler(req, false);
}

async function handler(req: NextRequest, requireAuth: boolean) {
  // Protect cron endpoint with CRON_SECRET when set
  if (requireAuth) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.get('authorization');
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
  }

  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    return NextResponse.json(
      { error: 'PLAID_CLIENT_ID and PLAID_SECRET must be set in environment' },
      { status: 500 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Read all Plaid tokens
  const { data: tokens, error: tokensErr } = await supabase
    .from('plaid_tokens')
    .select('id, item_id, access_token, cursor')
    .order('created_at');

  if (tokensErr) {
    return NextResponse.json({ error: tokensErr.message }, { status: 500 });
  }
  if (!tokens?.length) {
    return NextResponse.json({ error: 'No Plaid tokens found in plaid_tokens table' }, { status: 404 });
  }

  const syncedAt = new Date().toISOString();
  const results: Array<{
    item_id: string;
    txAdded: number;
    txModified: number;
    txRemoved: number;
    accountsSynced: number;
    error?: string;
  }> = [];

  for (const token of tokens) {
    const result = {
      item_id: token.item_id as string,
      txAdded: 0,
      txModified: 0,
      txRemoved: 0,
      accountsSynced: 0,
      error: undefined as string | undefined,
    };

    try {
      // ── Transaction sync (paginated) ───────────────────────────────────────
      let nextCursor = (token.cursor as string) ?? '';
      let hasMore = true;

      while (hasMore) {
        const payload: Record<string, string> = {
          access_token: token.access_token as string,
        };
        if (nextCursor) payload.cursor = nextCursor;

        const data = await plaidPost<{
          added: PlaidTransaction[];
          modified: PlaidTransaction[];
          removed: { transaction_id: string }[];
          next_cursor: string;
          has_more: boolean;
        }>('/transactions/sync', payload);

        if (data.added.length) {
          await supabase
            .from('transactions')
            .upsert(data.added.map(flattenTransaction), { onConflict: 'transaction_id' });
          result.txAdded += data.added.length;
        }
        if (data.modified.length) {
          await supabase
            .from('transactions')
            .upsert(data.modified.map(flattenTransaction), { onConflict: 'transaction_id' });
          result.txModified += data.modified.length;
        }
        if (data.removed.length) {
          const ids = data.removed.map((r) => r.transaction_id).filter(Boolean);
          if (ids.length) {
            await supabase.from('transactions').delete().in('transaction_id', ids);
            result.txRemoved += ids.length;
          }
        }

        nextCursor = data.next_cursor ?? nextCursor;
        hasMore = data.has_more ?? false;
      }

      // Update cursor + last_sync
      await supabase
        .from('plaid_tokens')
        .update({ cursor: nextCursor, last_sync: syncedAt })
        .eq('item_id', token.item_id);

      // ── Account balance sync ───────────────────────────────────────────────
      const accountsData = await plaidPost<{
        accounts: Array<{
          account_id: string;
          name: string;
          official_name?: string;
          type: string;
          subtype?: string;
          mask?: string;
          balances: {
            current?: number;
            available?: number;
            limit?: number;
            iso_currency_code?: string;
          };
        }>;
      }>('/accounts/get', { access_token: token.access_token });

      for (const acct of accountsData.accounts ?? []) {
        await supabase
          .schema('north_star')
          .from('plaid_accounts')
          .upsert(
            {
              client_id: CLIENT_ID,
              account_id: acct.account_id,
              account_name: acct.name,
              official_name: acct.official_name ?? null,
              account_type: acct.type,
              account_subtype: acct.subtype ?? null,
              current_balance: acct.balances.current ?? null,
              available_balance: acct.balances.available ?? null,
              limit_balance: acct.balances.limit ?? null,
              currency: acct.balances.iso_currency_code ?? 'USD',
              mask: acct.mask ?? null,
              last_updated: syncedAt,
            },
            { onConflict: 'account_id' }
          );
        result.accountsSynced++;
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }

    results.push(result);
  }

  const totalTx = results.reduce((s, r) => s + r.txAdded, 0);
  const totalAccounts = results.reduce((s, r) => s + r.accountsSynced, 0);
  const errors = results.filter((r) => r.error);

  return NextResponse.json({
    ok: errors.length === 0,
    syncedAt,
    totalTransactionsAdded: totalTx,
    totalAccountsSynced: totalAccounts,
    results,
  });
}
