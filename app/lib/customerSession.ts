import { safeEqual, signDashboardPayload } from './security';
export function customerSession(request: Request, email: string): boolean {
  try {
    const [payload, signature] = (request.headers.get('x-customer-token') || '').split('.');
    if (!payload || !signature || !safeEqual(signature, signDashboardPayload(payload))) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.purpose === 'customer' && data.identifier === email.toLowerCase() && data.exp > Date.now();
  } catch { return false; }
}
