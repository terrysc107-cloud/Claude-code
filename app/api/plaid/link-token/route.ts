import { NextResponse } from 'next/server';

const PLAID_BASE: Record<string, string> = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
};

export async function POST() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = (process.env.PLAID_ENV ?? 'production').toLowerCase();
  const baseUrl = PLAID_BASE[env] ?? PLAID_BASE.production;

  if (!clientId || !secret) {
    return NextResponse.json({ error: 'PLAID_CLIENT_ID and PLAID_SECRET must be set' }, { status: 500 });
  }

  try {
    const res = await fetch(`${baseUrl}/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        secret,
        user: { client_user_id: 'finance-dashboard-user' },
        client_name: 'Cottonstone Command Center',
        products: ['transactions'],
        country_codes: ['US'],
        language: 'en',
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error_message ?? 'Failed to create link token' },
        { status: res.status }
      );
    }

    return NextResponse.json({ link_token: data.link_token });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
