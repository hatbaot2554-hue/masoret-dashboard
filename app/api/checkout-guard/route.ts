import { NextResponse } from 'next/server';
import { sharedSecretAllowed } from '../../lib/security';
import { sharedRateLimit } from '../../lib/sharedRateLimit';

export async function POST(request: Request) {
  if (!sharedSecretAllowed(request, 'DASHBOARD_ORDERS_API_SECRET', 'x-dashboard-orders-secret')) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 });
  }
  try {
    const { client, scope } = await request.json();
    if (typeof client !== 'string' || !/^[a-f0-9]{64}$/.test(client) || !['order', 'shipping', 'ai'].includes(scope)) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
    }
    const allowed = await sharedRateLimit(`checkout:${scope}:${client}`, scope === 'order' ? 8 : scope === 'ai' ? 20 : 40, 600000);
    return NextResponse.json({ allowed }, { status: allowed ? 200 : 429 });
  } catch {
    return NextResponse.json({ error: 'ההגנה על ההזמנה אינה זמינה כרגע' }, { status: 503 });
  }
}
