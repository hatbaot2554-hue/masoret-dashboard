import crypto from 'crypto';
import { NextResponse } from 'next/server';

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left || '');
  const rightBuffer = Buffer.from(right || '');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function getDashboardAuthSecret(): string {
  const secret = process.env.DASHBOARD_AUTH_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production') {
    return process.env.DATABASE_URL || 'development-dashboard-secret';
  }
  throw new Error('DASHBOARD_AUTH_SECRET is not configured');
}

export function signDashboardPayload(value: string): string {
  return crypto.createHmac('sha256', getDashboardAuthSecret()).update(value).digest('base64url');
}

export function isDashboardRequest(request: Request): boolean {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expected = signDashboardPayload(payload);
  if (!safeEqual(signature, expected)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number };
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function genericServerError(error: unknown) {
  console.error(error);
  return NextResponse.json({ error: 'שגיאת שרת. נסה שוב מאוחר יותר.' }, { status: 500 });
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 12, windowMs = 60_000): boolean {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function sharedSecretAllowed(request: Request, envName: string, headerName: string): boolean {
  const secret = process.env[envName]?.trim();
  if (!secret) return true;
  return safeEqual(request.headers.get(headerName) || '', secret);
}
