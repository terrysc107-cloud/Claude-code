import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PLAID_BASE: Record<string, string> = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
};

export async function POST(req: NextRequest) {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = (process.env.PLAID_ENV ?? 'production').toLowerCase();
  const baseUrl = PLAID_BASE[env] ?? PLAID_BASE.production;

  if (!clientId || !secret) {
    return NextResponse.json({ error: 'PLAID_CLIENT_ID and PLAID_SECRET must be set' }, { status: 500 });
  }

  const { public_token } = await req.json().catch(() => ({})) as { public_token?: string };

  if (!public_token) {
    return NextResponse.json({ error: 'Missing public_token' }, { status: 400 });
  }

  try {
    // Exchange public token → access token
    const plaidRes = await fetch(`${baseUrl}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret, public_token }),
    });

    const plaidData = await plaidRes.json();

    if (!plaidRes.ok) {
      return NextResponse.json(
        { error: plaidData.error_message ?? 'Token exchange failed' },
        { status: plaidRes.status }
      );
    }

    const { access_token, item_id } = plaidData as { access_token: string; item_id: string };

    // Store in Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: dbError } = await supabase
      .from('plaid_tokens')
      .upsert({ item_id, access_token, cursor: '' }, { onConflict: 'item_id' });

    if (dbError) throw new Error(dbError.message);

    return NextResponse.json({ success: true, item_id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
