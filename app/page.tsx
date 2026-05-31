'use client';

import { useEffect, useMemo, useState } from 'react';

type OrderItem = {
  name?: string;
  sourceProductId?: string;
  sourceProductIndex?: number | string;
  productId?: string;
  variationId?: string;
  sku?: string;
  url?: string;
  sourceUrl?: string;
  source_url?: string;
  image?: string;
  images?: string[];
  engraving?: Record<string, string | number | boolean | null | undefined>;
  sketchFile?: {
    name?: string;
    type?: string;
    size?: number;
    dataUrl?: string;
  } | null;
  selectedAttributes?: Record<string, string>;
  quantity?: number;
  price?: number;
  cost?: number;
  options?: string;
};

type AdminNote = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};

type ProductRecord = {
  index: number;
  product_id?: string;
  sku?: string;
  name?: string;
  image?: string;
  images?: string[];
  url?: string;
  variations?: { variation_id?: string; sku?: string }[];
};

type Order = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string;
  total_price: number;
  cost_price: number;
  profit: number;
  status: string;
  payment_status: string;
  payment_method: string;
  notes: string;
  source: string;
  utm_source: string;
  items: OrderItem[] | string;
  external_order_id?: string;
  checkout_url?: string;
  auto_submitted?: boolean;
  admin_notes?: AdminNote[] | string;
};

type CurrentUser = {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: string;
};

type CheckStatus = 'ok' | 'missing' | 'warning' | 'error' | 'unknown';

type HealthCheck = {
  key: string;
  label: string;
  scope: string;
  status: CheckStatus;
  detail: string;
  impact?: string;
  nextStep?: string;
};

type HealthSummary = {
  status: 'healthy' | 'attention' | 'critical';
  label: string;
  detail: string;
  totals: Record<CheckStatus, number>;
};

type HealthResponse = {
  generatedAt: string;
  safe: boolean;
  message: string;
  summary?: HealthSummary;
  checks: HealthCheck[];
};

type ContactRequest = {
  id: number;
  name: string;
  phone: string;
  email?: string;
  message: string;
  status: string;
  created_at: string;
};

type ShabbatWindow = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
};

type SiteControlState = {
  active: boolean;
  mode: 'open' | 'maintenance' | 'shabbat';
  message: string;
  activeUntil?: string | null;
  activeName?: string | null;
  manualEnabled: boolean;
  manualMessage: string;
  manualUntil?: string | null;
  shabbatSchedules: ShabbatWindow[];
};

type ApprovalRequest = {
  id: number;
  title: string;
  description: string;
  severity: 'info' | 'local' | 'improvement' | 'urgent' | 'security';
  source: string;
  recommended_action?: string | null;
  action_key?: string | null;
  payload?: unknown;
  status: 'pending' | 'approved' | 'rejected' | 'done';
  decided_by?: string | null;
  decided_at?: string | null;
  created_at: string;
};

type CouponRecord = {
  id: number;
  code: string;
  owner_name?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
  benefit_type: 'percent' | 'fixed';
  benefit_value: number;
  used_count: number;
  usage_limit: number;
  status: string;
  source_order_id?: string | null;
  note?: string | null;
  expires_at?: string | null;
  created_at: string;
};

type RepairJobLog = {
  at: string;
  level: 'info' | 'success' | 'warning' | 'error';
  text: string;
};

type RepairJob = {
  id: number;
  title: string;
  prompt: string;
  status: string;
  requested_by?: string | null;
  logs: RepairJobLog[] | string;
  result?: string | null;
  created_at: string;
  updated_at: string;
};

type ApprovalProgress = {
  status: 'running' | 'completed' | 'failed' | 'rejected';
  logs: RepairJobLog[];
  result?: string;
};

type AdminView = 'dashboard' | 'orders' | 'products' | 'customers' | 'coupons' | 'reports' | 'graphs' | 'settings' | 'health' | 'management';

const PRODUCT_SITE_URL = 'https://masoret-website.vercel.app';

const STATUSES = [
  { key: 'pending', label: 'ממתין לטיפול', chip: 'red' },
  { key: 'ai_ready_for_source_submit', label: 'מאושר לשליחה', chip: 'yellow' },
  { key: 'source_submit_in_progress', label: 'שליחה בתהליך', chip: 'blue' },
  { key: 'source_submit_simulated', label: 'נבדק בסימולציה', chip: 'purple' },
  { key: 'warehouse_processing', label: 'בהטמעה במחסן', chip: 'yellow' },
  { key: 'supplier_to_customer_warehouse', label: 'ספק ללקוח במחסן', chip: 'lime' },
  { key: 'confirmed', label: 'הוזמן מעוז והדרך ללקוח', chip: 'purple' },
  { key: 'shipped', label: 'נשלח ע"י שליחויות', chip: 'blue' },
  { key: 'delivered', label: 'הושלם', chip: 'green' },
  { key: 'cancelled', label: 'בוטל', chip: 'light' },
  { key: 'needs_care', label: 'ממתין לטיפול', chip: 'red' },
  { key: 'warehouse_backorder', label: 'בהזמנה מהספק', chip: 'orange' },
  { key: 'not_paid', label: 'לא שולם', chip: 'slate' },
];

const STATUS_LABELS = Object.fromEntries(STATUSES.map((s) => [s.key, s.label]));

const ORDER_ACTIONS = [
  { value: '', label: 'בחירה בפעולה...' },
  { value: 'email_customer', label: 'שליחת פרטי ההזמנה ללקוח באימייל' },
  { value: 'new_order_email', label: 'שליחה מחדש של הודעת אודות הזמנה חדשה' },
  { value: 'invoice', label: 'ייצר מחדש הרשאת הורדה' },
];

const FIELD_OPTIONS = [
  ['all', 'הכל'],
  ['order', 'מזהה הזמנה'],
  ['name', 'אימייל לקוח'],
  ['customer', 'לקוחות'],
  ['products', 'מוצרים'],
  ['orderNumber', 'מספר הזמנה'],
];

const NAV_ITEMS: { key: AdminView; label: string }[] = [
  { key: 'dashboard', label: 'לוח בקרה' },
  { key: 'orders', label: 'הזמנות' },
  { key: 'products', label: 'מוצרים' },
  { key: 'customers', label: 'לקוחות' },
  { key: 'coupons', label: 'קופונים' },
  { key: 'reports', label: 'דוחות' },
  { key: 'graphs', label: 'גרפים' },
  { key: 'settings', label: 'הגדרות' },
  { key: 'health', label: 'בריאות האתר' },
  { key: 'management', label: 'ניהול' },
];

function dashboardAuthHeaders(): HeadersInit {
  if (typeof window === 'undefined') return {};
  const token = sessionStorage.getItem('dashboard_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatOrderId(id: string) {
  const numeric = String(id || '').replace(/\D/g, '');
  return numeric.slice(-5).padStart(5, '0');
}

function formatMoney(value: number | string | undefined) {
  return `₪${Number(value || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTimeLocalToIso(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}

function isoToDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value).slice(0, 16);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function parseItems(items: Order['items']): OrderItem[] {
  if (Array.isArray(items)) return items;
  if (!items) return [];
  try {
    const parsed = JSON.parse(items);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseAdminNotes(notes: Order['admin_notes']): AdminNote[] {
  if (Array.isArray(notes)) return notes;
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseRepairLogs(logs: RepairJob['logs']): RepairJobLog[] {
  if (Array.isArray(logs)) return logs;
  if (!logs) return [];
  try {
    const parsed = JSON.parse(String(logs));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function repairJobIdFromAction(actionKey?: string | null) {
  const value = String(actionKey || '');
  if (!value.startsWith('repair_job:')) return null;
  const id = Number(value.split(':')[1]);
  return Number.isFinite(id) ? id : null;
}

function repairStatusLabel(status: string) {
  switch (status) {
    case 'needs_approval':
      return 'ממתין לאישור';
    case 'approved_for_work':
      return 'אושר וממתין לרץ התיקונים';
    case 'queued':
      return 'ממתין בתור לרץ התיקונים';
    case 'running':
      return 'בתהליך תיקון';
    case 'completed':
      return 'התיקון הושלם בהצלחה';
    case 'blocked':
      return 'נחסם וממתין להשלמת הרשאה';
    case 'failed':
      return 'התיקון נכשל';
    case 'rejected':
      return 'נדחה';
    default:
      return status || 'ממתין לעדכון';
  }
}

function approvalProgressStatusLabel(status: ApprovalProgress['status']) {
  if (status === 'running') return 'בתהליך תיקון';
  if (status === 'completed') return 'התיקון הושלם בהצלחה';
  if (status === 'failed') return 'התיקון נכשל';
  return 'נדחה';
}

function parseApprovalPayload(payload: ApprovalRequest['payload']): Record<string, unknown> {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof payload === 'object' ? payload as Record<string, unknown> : {};
}

function approvalTextForDiagnosis(request: ApprovalRequest) {
  const payload = parseApprovalPayload(request.payload);
  return [
    request.title,
    request.description,
    request.recommended_action,
    request.action_key,
    payload.key,
    payload.title,
    payload.detail,
    payload.recommendedAction,
  ].filter(Boolean).join(' ');
}

function missingExternalSecret(request: ApprovalRequest) {
  const text = approvalTextForDiagnosis(request);
  if (text.includes('VERCEL_MONITOR_TOKEN')) return 'VERCEL_MONITOR_TOKEN';
  if (text.includes('GITHUB_MONITOR_TOKEN')) return 'GITHUB_MONITOR_TOKEN';
  if (text.includes('AIVEN_MONITOR_TOKEN')) return 'AIVEN_MONITOR_TOKEN';
  if (text.includes('RESEND_API_KEY')) return 'RESEND_API_KEY';
  if (text.includes('GEMINI_API_KEY')) return 'GEMINI_API_KEY';
  if (text.includes('OPENAI_API_KEY')) return 'OPENAI_API_KEY';
  return '';
}

function approvalCanRunAutomatically(request: ApprovalRequest) {
  return Boolean(repairJobIdFromAction(request.action_key));
}

function approvalBlockerText(request: ApprovalRequest) {
  const secret = missingExternalSecret(request);
  if (secret) {
    return `המערכת לא יכולה להשלים את זה לבד כי חסר מפתח/הרשאה חיצונית בשם ${secret}. צריך להגדיר אותו מחוץ לאתר, ואז להריץ שוב בדיקה.`;
  }
  if (request.action_key === 'approval:review_only') {
    return 'זו בדיקת בריאות שמצריכה טיפול או הגדרה, אבל היא לא משימת תיקון קוד. לכן אישור כאן לא יגרום ל-AI לערוך קבצים.';
  }
  return '';
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function approvalDiagnosisLogs(request: ApprovalRequest, status: ApprovalProgress['status'] = 'running', extra?: string): RepairJobLog[] {
  const now = Date.now();
  const payload = parseApprovalPayload(request.payload);
  const area = String(payload.area || request.source || 'מערכת');
  const key = String(payload.key || request.action_key || `approval:${request.id}`);
  const secret = missingExternalSecret(request);
  const logs: RepairJobLog[] = [
    {
      at: new Date(now - 5000).toISOString(),
      level: 'info',
      text: `קורא את בקשת האישור #${request.id}: ${request.title}`,
    },
    {
      at: new Date(now - 4000).toISOString(),
      level: 'info',
      text: `ממפה את מקור הבעיה: תחום ${area}, מזהה בדיקה ${key}.`,
    },
    {
      at: new Date(now - 3000).toISOString(),
      level: 'info',
      text: `בודק את הפעולה המומלצת: ${request.recommended_action || 'לא נמסרה פעולה אוטומטית מוגדרת, לכן נדרש אבחון זהיר לפני שינוי.'}`,
    },
  ];

  if (secret) {
    logs.unshift({
      at: new Date(now - 1000).toISOString(),
      level: status === 'failed' ? 'error' : 'warning',
      text: `מקור הבעיה נמצא: חסר משתנה סביבה חיצוני בשם ${secret}. בלי הערך הסודי הזה המערכת לא יכולה להתחבר לשירות הרלוונטי ולכן לא יכולה להשלים את התיקון לבד.`,
    });
    logs.unshift({
      at: new Date(now).toISOString(),
      level: status === 'failed' ? 'error' : 'warning',
      text: `השלב הבא: להוסיף את ${secret} ב-Vercel ולבצע Redeploy. אחרי זה הבדיקה תוכל לרוץ שוב ולוודא שהבעיה נפתרה.`,
    });
  } else if (request.action_key === 'approval:review_only') {
    logs.unshift({
      at: new Date(now).toISOString(),
      level: 'warning',
      text: 'המערכת זיהתה שאין לפעולה הזו תיקון אוטומטי בטוח שמוגדר מראש. היא מסמנת את האישור למעקב ולא משנה קוד או הרשאות בלי מנגנון תיקון ייעודי.',
    });
  } else {
    logs.unshift({
      at: new Date(now).toISOString(),
      level: status === 'completed' ? 'success' : 'info',
      text: extra || 'הפעולה האוטומטית הופעלה לפי סוג האישור ותוצאותיה נרשמות כאן.',
    });
  }

  return logs;
}

function repairStageClass(status: string, stage: 'approval' | 'scan' | 'work' | 'done') {
  const order: Record<string, number> = {
    needs_approval: 0,
    rejected: 0,
    approved_for_work: 1,
    queued: 1,
    running: 2,
    blocked: 2,
    failed: 2,
    completed: 3,
  };
  const stageIndex = { approval: 0, scan: 1, work: 2, done: 3 }[stage];
  return (order[status] ?? 0) >= stageIndex ? 'active' : '';
}

function orderNotesText(order: Order): string {
  return String(order.notes || '');
}

function isAiSafeOrder(order: Order): boolean {
  const source = String(order.source || '').toLowerCase();
  const notes = orderNotesText(order);
  return source === 'ai_chat_safe' || notes.includes('AI_CHAT_SAFE_ORDER');
}

function isAiDraftOrder(order: Order): boolean {
  return isAiSafeOrder(order) && !order.auto_submitted && !order.external_order_id && (order.status || 'pending') !== 'cancelled';
}

function customerNote(notes: string | undefined) {
  const raw = String(notes || '').trim();
  if (!raw) return '';
  const firstPart = raw.split('|')[0]?.trim() || '';
  const automaticPhrases = ['הטבעת', 'Tranzila', 'payment', 'Handle', 'status', 'אוטומציה'];
  if (automaticPhrases.some((phrase) => firstPart.toLowerCase().includes(phrase.toLowerCase()))) return '';
  return firstPart;
}

function paymentMethodLabel(method: string | undefined, status: string | undefined) {
  const value = `${method || ''} ${status || ''}`.toLowerCase();
  if (value.includes('credit') || value.includes('card') || value.includes('tranzila') || value.includes('אשראי')) return 'אשראי';
  if (value.includes('bank') || value.includes('transfer') || value.includes('העברה')) return 'העברה בנקאית';
  if (value.includes('cash') || value.includes('מזומן')) return 'מזומן';
  if (value.includes('paypal')) return 'פייפאל';
  if (value.includes('paid') || value.includes('completed')) return 'אשראי';
  return method || 'לא צוין';
}

function paymentStatusLabel(status: string | undefined) {
  const value = String(status || '').toLowerCase();
  if (value.includes('paid') || value.includes('completed') || value.includes('success')) return 'שולם';
  if (value.includes('failed') || value.includes('declined')) return 'נכשל';
  if (value.includes('pending')) return 'ממתין';
  return status || 'לא ידוע';
}

function itemSku(item: OrderItem, product?: ProductRecord) {
  return item.sku || product?.sku || item.sourceProductId || item.productId || item.variationId || '-';
}

function itemImage(item: OrderItem, product?: ProductRecord) {
  return item.image || item.images?.[0] || product?.image || product?.images?.[0] || '';
}

function engravingLines(item: OrderItem) {
  const lines: string[] = [];
  if (item.options) lines.push(item.options);
  if (item.selectedAttributes) {
    for (const [key, value] of Object.entries(item.selectedAttributes)) {
      if (value) lines.push(`${key.replace('attribute_', '')}: ${value}`);
    }
  }
  if (item.engraving) {
    for (const [key, value] of Object.entries(item.engraving)) {
      if (value !== undefined && value !== null && value !== '' && key !== 'extraCost') {
        lines.push(`${key}: ${String(value)}`);
      }
    }
  }
  return lines;
}

function fileSizeLabel(size: number | undefined) {
  const value = Number(size || 0);
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} ק"ב`;
  return `${(value / 1024 / 1024).toFixed(1)} מ"ב`;
}

function orderSourceParts(order: Order) {
  const source = order.utm_source || order.source || '';
  const lower = source.toLowerCase();
  return {
    source: sourceLabel(order),
    type: lower.includes('utm') || lower.includes('google') || lower.includes('cpc') ? 'קישור קמפיין' : 'ישיר',
    campaign: lower.includes('google') ? 'קמפיין גוגל' : 'לא נאסף',
    medium: lower.includes('cpc') ? 'קליק ממומן' : lower.includes('google') ? 'ממומן' : 'לא נאסף',
    device: 'מחשב שולחני',
  };
}

function matchProduct(item: OrderItem, products: ProductRecord[]) {
  const index = Number(item.sourceProductIndex);
  if (Number.isInteger(index) && products[index]) return products[index];
  const ids = [item.sourceProductId, item.productId, item.variationId, item.sku].filter(Boolean).map(String);
  return products.find((product) =>
    ids.includes(String(product.product_id || '')) ||
    ids.includes(String(product.sku || '')) ||
    product.variations?.some((variation) => ids.includes(String(variation.variation_id || '')) || ids.includes(String(variation.sku || '')))
  );
}

function dateHe(date: string) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('he-IL', { year: 'numeric', month: 'short', day: 'numeric' });
}

function timeHe(date: string) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function sourceLabel(order: Order) {
  const source = `${order.utm_source || order.source || ''}`.toLowerCase();
  if (source.includes('google')) return source.includes('shopping') ? 'מקור: גוגל שופינג' : 'גוגל';
  if (source.includes('facebook') || source.includes('fb')) return 'פייסבוק';
  if (source.includes('instagram')) return 'אינסטגרם';
  if (source.includes('organic')) return 'גוגל אורגני';
  return 'מנהל מערכת אינטרנט';
}

function productUrl(item: OrderItem) {
  const index = Number(item.sourceProductIndex);
  if (Number.isInteger(index) && index >= 0) {
    return `${PRODUCT_SITE_URL}/products/${index}`;
  }

  const directUrl = item.url || item.sourceUrl || item.source_url;
  if (directUrl) {
    try {
      const url = new URL(String(directUrl), PRODUCT_SITE_URL);
      if (url.hostname === new URL(PRODUCT_SITE_URL).hostname && url.pathname.startsWith('/products')) {
        return url.toString();
      }
    } catch {
      // Continue to the source-id fallback.
    }
  }

  const sourceId = item.sourceProductId || item.productId || item.variationId || item.sku;
  if (sourceId) {
    return `${PRODUCT_SITE_URL}/products/source/${encodeURIComponent(String(sourceId))}`;
  }
  return `${PRODUCT_SITE_URL}/products?search=${encodeURIComponent(item.name || '')}`;
}

function openProduct(item: OrderItem) {
  const url = productUrl(item);
  window.open(url, '_blank', 'noopener,noreferrer');
}

function normalizeProductHref(rawHref: string | null) {
  if (!rawHref) return rawHref;
  try {
    const url = new URL(rawHref, window.location.origin);
    const isDashboardProduct =
      url.hostname === window.location.hostname &&
      (url.pathname === '/products' || url.pathname.startsWith('/products/'));

    if (isDashboardProduct) {
      return `${PRODUCT_SITE_URL}${url.pathname}${url.search}${url.hash}`;
    }

    return rawHref;
  } catch {
    if (rawHref === 'products' || rawHref.startsWith('products/')) {
      return `${PRODUCT_SITE_URL}/${rawHref}`;
    }
    return rawHref;
  }
}

function statusChipClass(status: string) {
  return `status-chip ${STATUSES.find((s) => s.key === status)?.chip || 'gray'}`;
}

function systemStatusLabel(status: CheckStatus) {
  switch (status) {
    case 'ok':
      return 'פעיל';
    case 'missing':
      return 'חסר';
    case 'warning':
      return 'דורש בדיקה';
    case 'error':
      return 'שגיאה';
    default:
      return 'לא נבדק מכאן';
  }
}

function systemStatusClass(status: CheckStatus) {
  switch (status) {
    case 'ok':
      return 'status-chip green';
    case 'missing':
    case 'error':
      return 'status-chip red';
    case 'warning':
      return 'status-chip yellow';
    default:
      return 'status-chip slate';
  }
}

function healthSummaryClass(status: HealthSummary['status'] | undefined) {
  if (status === 'healthy') return 'health-hero healthy';
  if (status === 'attention') return 'health-hero attention';
  return 'health-hero critical';
}

function healthSummaryFallback(checks: HealthCheck[]): HealthSummary {
  const totals: Record<CheckStatus, number> = { ok: 0, missing: 0, warning: 0, error: 0, unknown: 0 };
  for (const check of checks) totals[check.status] += 1;
  if (totals.error || totals.missing) {
    return { status: 'critical', label: 'דורש טיפול מיידי', detail: 'נמצאו תקלות או הגדרות חסרות.', totals };
  }
  if (totals.warning || totals.unknown) {
    return { status: 'attention', label: 'תקין עם נקודות לבדיקה', detail: 'המערכת עובדת, ויש כמה נקודות למעקב.', totals };
  }
  return { status: 'healthy', label: 'המערכת תקינה', detail: 'כל הבדיקות הזמינות עברו בהצלחה.', totals };
}

function IconButton({ title, children, onClick }: { title: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button className="icon-button" type="button" title={title} onClick={onClick}>
      {children}
    </button>
  );
}

function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function login() {
    if (!username || !password) {
      setError('יש להזין שם משתמש וסיסמה');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', username, password }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'שגיאה בכניסה');
        return;
      }
      sessionStorage.setItem('dashboard_token', data.token);
      sessionStorage.setItem('dashboard_user', JSON.stringify(data.user));
      window.location.reload();
    } catch {
      setError('שגיאת חיבור לשרת');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell" dir="rtl">
      <section className="login-box">
        <div className="login-mark">מסורת</div>
        <h1>כניסה ללוח הבקרה</h1>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="שם משתמש" autoFocus />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="סיסמה"
          type="password"
          onKeyDown={(e) => {
            if (e.key === 'Enter') login();
          }}
        />
        {error && <div className="login-error">{error}</div>}
        <button type="button" onClick={login} disabled={loading}>
          {loading ? 'מתחבר...' : 'כניסה'}
        </button>
      </section>
    </main>
  );
}

export default function Dashboard() {
  const [authed, setAuthed] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [bulkAction, setBulkAction] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<AdminView>('orders');
  const [productsCatalog, setProductsCatalog] = useState<ProductRecord[]>([]);
  const [adminNoteDraft, setAdminNoteDraft] = useState('');
  const [orderAction, setOrderAction] = useState('');
  const [systemHealth, setSystemHealth] = useState<HealthResponse | null>(null);
  const [systemHealthError, setSystemHealthError] = useState('');
  const [systemHealthLoading, setSystemHealthLoading] = useState(false);
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>([]);
  const [contactError, setContactError] = useState('');
  const [siteControl, setSiteControl] = useState<SiteControlState | null>(null);
  const [siteControlError, setSiteControlError] = useState('');
  const [siteControlSaving, setSiteControlSaving] = useState(false);
  const [manualUntilDraft, setManualUntilDraft] = useState('');
  const [shabbatDraft, setShabbatDraft] = useState({ name: '', startsAt: '', endsAt: '' });
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [approvalError, setApprovalError] = useState('');
  const [approvalSaving, setApprovalSaving] = useState<number | null>(null);
  const [approvalProgress, setApprovalProgress] = useState<Record<number, ApprovalProgress>>({});
  const [repairJobs, setRepairJobs] = useState<RepairJob[]>([]);
  const [repairPrompt, setRepairPrompt] = useState('');
  const [repairError, setRepairError] = useState('');
  const [repairSaving, setRepairSaving] = useState(false);
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [couponDraft, setCouponDraft] = useState({ code: '', ownerName: '', ownerEmail: '', ownerPhone: '', benefitType: 'percent', benefitValue: '10', usageLimit: '1', expiresAt: '', note: '' });
  const [couponError, setCouponError] = useState('');
  const [couponSaving, setCouponSaving] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem('dashboard_token');
    const user = sessionStorage.getItem('dashboard_user');
    const savedProgress = sessionStorage.getItem('approval_progress');
    if (savedProgress) {
      try {
        setApprovalProgress(JSON.parse(savedProgress));
      } catch {
        sessionStorage.removeItem('approval_progress');
      }
    }
    if (token && user) {
      try {
        setCurrentUser(JSON.parse(user));
        setAuthed(true);
      } catch {
        sessionStorage.clear();
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('approval_progress', JSON.stringify(approvalProgress));
    }
  }, [approvalProgress]);

  async function fetchOrders() {
    setLoading(true);
    try {
      const res = await fetch('/api/orders', { headers: dashboardAuthHeaders() });
      if (res.status === 401) {
        sessionStorage.clear();
        setAuthed(false);
        setCurrentUser(null);
        return;
      }
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authed) fetchOrders();
  }, [authed]);

  const normalizedRole = (currentUser?.role || '').trim().toLowerCase();
  const canManageSystem =
    currentUser?.username === 'admin' ||
    ['admin', 'owner', 'super_admin', 'מנהל', 'בעלים'].includes(normalizedRole);
  const visibleNavItems = NAV_ITEMS.filter((item) => !['management', 'health'].includes(item.key) || canManageSystem);

  useEffect(() => {
    if (!authed || activeView !== 'coupons' || !canManageSystem) return;
    setCouponError('');
    fetch('/api/coupons', { headers: dashboardAuthHeaders(), cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'לא ניתן לטעון קופונים.');
        setCoupons(Array.isArray(data?.coupons) ? data.coupons : []);
      })
      .catch((error) => setCouponError(error.message || 'לא ניתן לטעון קופונים.'));
    setRepairError('');
    fetch('/api/repair-jobs', { headers: dashboardAuthHeaders(), cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'לא ניתן לטעון תהליכי תיקון.');
        setRepairJobs(Array.isArray(data?.jobs) ? data.jobs : []);
      })
      .catch((error) => setRepairError(error.message || 'לא ניתן לטעון תהליכי תיקון.'));
  }, [activeView, authed, canManageSystem]);

  useEffect(() => {
    if (!authed || (activeView !== 'management' && activeView !== 'health') || !canManageSystem) return;

    setSystemHealthLoading(true);
    setSystemHealthError('');
    fetch('/api/system-health', { headers: dashboardAuthHeaders() })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'לא ניתן לטעון את בדיקות המערכת.');
        setSystemHealth(data);
      })
      .catch((error) => setSystemHealthError(error.message || 'לא ניתן לטעון את בדיקות המערכת.'))
      .finally(() => setSystemHealthLoading(false));

    setContactError('');
    fetch('/api/contact', { headers: dashboardAuthHeaders() })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'לא ניתן לטעון פניות צור קשר.');
        setContactRequests(Array.isArray(data?.requests) ? data.requests : []);
      })
      .catch((error) => setContactError(error.message || 'לא ניתן לטעון פניות צור קשר.'));
    setSiteControlError('');
    fetch('/api/site-control', { headers: dashboardAuthHeaders(), cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'לא ניתן לטעון את מצב האתר.');
        setSiteControl(data);
        setManualUntilDraft(isoToDateTimeLocal(data?.manualUntil));
      })
      .catch((error) => setSiteControlError(error.message || 'לא ניתן לטעון את מצב האתר.'));
    setApprovalError('');
    fetch('/api/approval-requests', { headers: dashboardAuthHeaders(), cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'לא ניתן לטעון בקשות אישור.');
        setApprovalRequests(Array.isArray(data?.requests) ? data.requests : []);
      })
      .catch((error) => setApprovalError(error.message || 'לא ניתן לטעון בקשות אישור.'));
  }, [activeView, authed, canManageSystem]);

  useEffect(() => {
    if (!authed || (activeView !== 'management' && activeView !== 'health') || !canManageSystem) return;
    let stopped = false;
    const loadRepairJobs = () => {
      setRepairError('');
      fetch('/api/repair-jobs', { headers: dashboardAuthHeaders(), cache: 'no-store' })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error(data?.error || 'לא ניתן לטעון תהליכי תיקון.');
          if (!stopped) setRepairJobs(Array.isArray(data?.jobs) ? data.jobs : []);
        })
        .catch((error) => {
          if (!stopped) setRepairError(error.message || 'לא ניתן לטעון תהליכי תיקון.');
        });
    };
    loadRepairJobs();
    const timer = window.setInterval(loadRepairJobs, 5000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeView, authed, canManageSystem]);

  useEffect(() => {
    if (!authed) return;
    fetch('https://raw.githubusercontent.com/hatbaot2554-hue/masoret-automation/main/products.json')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setProductsCatalog(data.map((product, index) => ({ ...product, index })));
        }
      })
      .catch(() => setProductsCatalog([]));
  }, [authed]);

  useEffect(() => {
    if (!authed) return;

    function repairProductLinks() {
      document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
        const fixed = normalizeProductHref(link.getAttribute('href'));
        if (fixed && fixed !== link.getAttribute('href')) {
          link.setAttribute('href', fixed);
        }
      });
    }

    function handleProductLinkClick(event: MouseEvent) {
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link) return;
      const fixed = normalizeProductHref(link.getAttribute('href'));
      if (!fixed || fixed === link.getAttribute('href')) return;
      event.preventDefault();
      link.setAttribute('href', fixed);
      window.open(fixed, '_blank', 'noopener,noreferrer');
    }

    repairProductLinks();
    document.addEventListener('mouseover', repairProductLinks, true);
    document.addEventListener('focusin', repairProductLinks, true);
    document.addEventListener('click', handleProductLinkClick, true);

    return () => {
      document.removeEventListener('mouseover', repairProductLinks, true);
      document.removeEventListener('focusin', repairProductLinks, true);
      document.removeEventListener('click', handleProductLinkClick, true);
    };
  }, [authed, selected, orders]);

  async function updateStatus(id: string, status: string) {
    setSaving(true);
    await fetch('/api/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...dashboardAuthHeaders() },
      body: JSON.stringify({ id, status }),
    });
    setOrders((prev) => prev.map((order) => (order.id === id ? { ...order, status } : order)));
    setSelected((prev) => (prev?.id === id ? { ...prev, status } : prev));
    setSaving(false);
  }

  async function patchOrder(id: string, patch: Partial<Order>) {
    setSaving(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...dashboardAuthHeaders() },
        body: JSON.stringify({ id, ...patch }),
      });
      const updated = await res.json();
      if (res.ok) {
        setOrders((prev) => prev.map((order) => (order.id === id ? updated : order)));
        setSelected((prev) => (prev?.id === id ? updated : prev));
        return updated as Order;
      }
    } finally {
      setSaving(false);
    }
    return null;
  }

  async function decideAiDraftOrder(order: Order, decision: 'approve' | 'cancel') {
    const note: AdminNote = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      author: currentUser?.fullName || currentUser?.username || 'מנהל',
      text: decision === 'approve'
        ? 'הזמנת AI אושרה וממתינה לאוטומציית שליחה.'
        : 'הזמנת AI בוטלה על ידי מנהל.',
      createdAt: new Date().toISOString(),
    };
    await patchOrder(order.id, {
      status: decision === 'approve' ? 'ai_ready_for_source_submit' : 'cancelled',
      admin_notes: [note, ...parseAdminNotes(order.admin_notes)],
    });
  }

  async function saveAdminNotes(id: string, notes: AdminNote[]) {
    setSaving(true);
    const res = await fetch('/api/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...dashboardAuthHeaders() },
      body: JSON.stringify({ id, admin_notes: notes }),
    });
    const updated = await res.json();
    if (res.ok) {
      setOrders((prev) => prev.map((order) => (order.id === id ? updated : order)));
      setSelected(updated);
    }
    setSaving(false);
  }

  async function addAdminNote() {
    if (!selected || !adminNoteDraft.trim()) return;
    const note: AdminNote = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      author: currentUser?.fullName || currentUser?.username || 'מנהל',
      text: adminNoteDraft.trim(),
      createdAt: new Date().toISOString(),
    };
    setAdminNoteDraft('');
    await saveAdminNotes(selected.id, [note, ...parseAdminNotes(selected.admin_notes)]);
  }

  async function deleteAdminNote(noteId: string) {
    if (!selected) return;
    await saveAdminNotes(selected.id, parseAdminNotes(selected.admin_notes).filter((note) => note.id !== noteId));
  }

  function runOrderAction() {
    if (!orderAction || !selected) return;
    const actionLabel = ORDER_ACTIONS.find((action) => action.value === orderAction)?.label || orderAction;
    const note: AdminNote = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      author: currentUser?.fullName || currentUser?.username || 'מנהל',
      text: `בוצעה פעולה: ${actionLabel}`,
      createdAt: new Date().toISOString(),
    };
    setOrderAction('');
    saveAdminNotes(selected.id, [note, ...parseAdminNotes(selected.admin_notes)]);
  }

  async function runBulkAction() {
    if (!bulkAction || selectedIds.length === 0) return;
    setSaving(true);
    for (const id of selectedIds) {
      await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...dashboardAuthHeaders() },
        body: JSON.stringify({ id, status: bulkAction }),
      });
    }
    setSelectedIds([]);
    setBulkAction('');
    await fetchOrders();
    setSaving(false);
  }

  function logout() {
    sessionStorage.clear();
    setAuthed(false);
    setCurrentUser(null);
  }

  async function saveSiteControl(patch: Partial<SiteControlState>) {
    if (!siteControl) return;
    setSiteControlSaving(true);
    setSiteControlError('');
    try {
      const res = await fetch('/api/site-control', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...dashboardAuthHeaders() },
        body: JSON.stringify({
          manualEnabled: patch.manualEnabled ?? siteControl.manualEnabled,
          manualMessage: patch.manualMessage ?? siteControl.manualMessage,
          manualUntil: patch.manualUntil === undefined ? siteControl.manualUntil : patch.manualUntil,
          shabbatSchedules: patch.shabbatSchedules ?? siteControl.shabbatSchedules,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'לא ניתן לשמור את מצב האתר.');
      setSiteControl(data);
      setManualUntilDraft(isoToDateTimeLocal(data?.manualUntil));
    } catch (error) {
      setSiteControlError(error instanceof Error ? error.message : 'לא ניתן לשמור את מצב האתר.');
    } finally {
      setSiteControlSaving(false);
    }
  }

  function addShabbatSchedule() {
    if (!siteControl || !shabbatDraft.startsAt || !shabbatDraft.endsAt) return;
    const nextSchedule: ShabbatWindow = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: shabbatDraft.name.trim() || 'שבת',
      startsAt: dateTimeLocalToIso(shabbatDraft.startsAt) || shabbatDraft.startsAt,
      endsAt: dateTimeLocalToIso(shabbatDraft.endsAt) || shabbatDraft.endsAt,
    };
    saveSiteControl({ shabbatSchedules: [...siteControl.shabbatSchedules, nextSchedule] });
    setShabbatDraft({ name: '', startsAt: '', endsAt: '' });
  }

  function removeShabbatSchedule(id: string) {
    if (!siteControl) return;
    saveSiteControl({ shabbatSchedules: siteControl.shabbatSchedules.filter((item) => item.id !== id) });
  }

  function upsertRepairJob(job: RepairJob) {
    setRepairJobs((items) => {
      const exists = items.some((item) => item.id === job.id);
      if (exists) return items.map((item) => (item.id === job.id ? job : item));
      return [job, ...items];
    });
  }

  async function updateRepairJobProgress(
    id: number,
    status: string,
    message: string,
    level: RepairJobLog['level'] = 'info',
    result?: string
  ) {
    const repairRes = await fetch('/api/repair-jobs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...dashboardAuthHeaders() },
      body: JSON.stringify({ id, status, message, level, result }),
    });
    const repairData = await repairRes.json().catch(() => null);
    if (repairRes.ok && repairData?.job) upsertRepairJob(repairData.job);
    return repairData?.job as RepairJob | undefined;
  }

  function waitForRepairStep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function appendApprovalProgress(
    id: number,
    status: ApprovalProgress['status'],
    text: string,
    level: RepairJobLog['level'] = 'info',
    result?: string
  ) {
    setApprovalProgress((current) => {
      const previous = current[id]?.logs || [];
      return {
        ...current,
        [id]: {
          status,
          result: result ?? current[id]?.result,
          logs: [{ at: new Date().toISOString(), level, text }, ...previous].slice(0, 12),
        },
      };
    });
  }

  function replaceApprovalProgress(id: number, progress: ApprovalProgress) {
    setApprovalProgress((current) => ({ ...current, [id]: progress }));
  }

  async function decideApprovalRequest(id: number, status: 'approved' | 'rejected') {
    setApprovalSaving(id);
    setApprovalError('');
    const request = approvalRequests.find((item) => item.id === id);
    try {
      if (request) {
        replaceApprovalProgress(id, {
          status: status === 'approved' ? 'running' : 'rejected',
          logs: approvalDiagnosisLogs(request, status === 'approved' ? 'running' : 'rejected'),
        });
      }
      appendApprovalProgress(
        id,
        status === 'approved' ? 'running' : 'rejected',
        status === 'approved'
          ? 'האישור התקבל. מתחיל תהליך תיקון ומכין בדיקת השפעה לפני פעולה.'
          : 'הבקשה נדחתה. התיקון לא יבוצע.',
        status === 'approved' ? 'success' : 'warning'
      );
      if (status === 'approved') {
        await waitForRepairStep(350);
        appendApprovalProgress(id, 'running', 'בודק את מקור הבעיה, את הפעולה המומלצת ואת ההרשאות שנדרשות לביצוע בטוח.');
        await waitForRepairStep(350);
        if (request) {
          const secret = missingExternalSecret(request);
          appendApprovalProgress(
            id,
            'running',
            secret
              ? `נמצא חסם מרכזי: חסר ${secret}. זה סוד חיצוני ולכן המערכת לא יכולה להשלים אותו לבד מתוך הדפדפן.`
              : `לא נמצא חסם של סוד חיצוני. ממשיך לבדוק אם קיימת פעולה אוטומטית מוגדרת עבור ${request.action_key || 'בקשה כללית'}.`,
            secret ? 'warning' : 'info'
          );
        }
      }
      const res = await fetch('/api/approval-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...dashboardAuthHeaders() },
        body: JSON.stringify({ id, status, decidedBy: currentUser?.username || 'admin' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'לא ניתן לעדכן את בקשת האישור.');
      if (status === 'approved') {
        appendApprovalProgress(
          id,
          'running',
          data?.executionNote
            ? `בוצעה פעולה מאושרת: ${data.executionNote}`
            : 'האישור נשמר במערכת. ממשיך לעדכן את תהליך התיקון בלוח הבקרה.',
          'info'
        );
      }
      setApprovalRequests((items) => items.map((item) => (item.id === id ? data.request : item)));
      const actionKey = String(data?.request?.action_key || '');
      if (actionKey.startsWith('repair_job:')) {
        const repairId = repairJobIdFromAction(actionKey);
        if (repairId) {
          if (status === 'approved') {
            await updateRepairJobProgress(repairId, 'running', 'האישור התקבל. פותח חלון עבודה חי ומתחיל לאסוף הקשר על הבעיה.', 'success');
            await waitForRepairStep(450);
            await updateRepairJobProgress(repairId, 'running', 'בודק איזה חלק במערכת מושפע: אתר, לוח בקרה, מסד נתונים, אוטומציות או הגדרות אבטחה.', 'info');
            await waitForRepairStep(450);
            await updateRepairJobProgress(repairId, 'running', 'מעביר את המשימה לרץ תיקונים חינמי ב-GitHub Actions. הוא יעדכן כאן כל שלב עד לסיום או עד חסם הרשאות.', 'info');
            const dispatchRes = await fetch('/api/repair-runner/dispatch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...dashboardAuthHeaders() },
              body: JSON.stringify({ id: repairId }),
            });
            const dispatchData = await dispatchRes.json().catch(() => null);
            if (!dispatchRes.ok) {
              await updateRepairJobProgress(repairId, 'blocked', dispatchData?.error || 'לא ניתן להפעיל את רץ התיקונים.', 'warning');
            }
          } else {
            await updateRepairJobProgress(repairId, 'rejected', 'המשימה נדחתה ולא תבוצע.', 'warning');
          }
        }
      } else if (status === 'approved') {
        await waitForRepairStep(450);
        const secret = request ? missingExternalSecret(request) : '';
        if (secret) {
          appendApprovalProgress(id, 'failed', `התיקון נעצר בצורה בטוחה כי חסר ${secret}. אחרי שתוסיף את המשתנה ב-Vercel ותבצע Redeploy, הרץ שוב את בדיקת הבריאות.`, 'warning');
        } else if (request?.action_key === 'approval:review_only') {
          appendApprovalProgress(id, 'failed', 'אין לפעולה הזו רץ תיקונים שמוגדר לבצע שינוי בפועל. המערכת שמרה את האישור והציגה את מקור הבעיה, אבל לא שינתה קוד או הרשאות.', 'warning');
        } else {
          appendApprovalProgress(id, 'completed', 'התהליך הסתיים בצד לוח הבקרה. אם נדרש שינוי קוד עמוק יותר, תיפתח משימת תיקון ייעודית שתמשיך מכאן.', 'success', 'התיקון הושלם בהצלחה');
        }
      }
    } catch (error) {
      appendApprovalProgress(id, 'failed', error instanceof Error ? error.message : 'התיקון נכשל בזמן העדכון.', 'error');
      setApprovalError(error instanceof Error ? error.message : 'לא ניתן לעדכן את בקשת האישור.');
    } finally {
      setApprovalSaving(null);
    }
  }

  async function createRepairJob(prompt?: string) {
    const text = String(prompt || repairPrompt).trim();
    if (!text) return;
    setRepairSaving(true);
    setRepairError('');
    try {
      const res = await fetch('/api/repair-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...dashboardAuthHeaders() },
        body: JSON.stringify({
          prompt: text,
          requestedBy: currentUser?.username || 'admin',
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'לא ניתן לפתוח תהליך תיקון.');
      setRepairPrompt('');
      setRepairJobs((prev) => [data.job, ...prev]);
    } catch (error) {
      setRepairError(error instanceof Error ? error.message : 'לא ניתן לפתוח תהליך תיקון.');
    } finally {
      setRepairSaving(false);
    }
  }

  async function createCoupon() {
    setCouponSaving(true);
    setCouponError('');
    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...dashboardAuthHeaders() },
        body: JSON.stringify({
          ownerName: couponDraft.ownerName,
          ownerEmail: couponDraft.ownerEmail,
          ownerPhone: couponDraft.ownerPhone,
          benefitType: couponDraft.benefitType,
          benefitValue: Number(couponDraft.benefitValue || 0),
          usageLimit: Number(couponDraft.usageLimit || 1),
          expiresAt: couponDraft.expiresAt || null,
          code: couponDraft.code,
          note: couponDraft.note,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'לא ניתן ליצור קופון.');
      setCoupons((items) => [data.coupon, ...items]);
      setCouponDraft({ code: '', ownerName: '', ownerEmail: '', ownerPhone: '', benefitType: 'percent', benefitValue: '10', usageLimit: '1', expiresAt: '', note: '' });
    } catch (error) {
      setCouponError(error instanceof Error ? error.message : 'לא ניתן ליצור קופון.');
    } finally {
      setCouponSaving(false);
    }
  }

  function openAdminView(view: AdminView) {
    setSelected(null);
    setActiveView(view);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((order) => {
      const items = parseItems(order.items);
      const values: Record<string, string> = {
        all: [
          order.customer_name,
          order.customer_email,
          order.customer_phone,
          order.customer_address,
          formatOrderId(order.id),
          order.external_order_id,
          items.map((i) => i.name).join(' '),
        ].join(' '),
        order: `${formatOrderId(order.id)} ${order.external_order_id || ''}`,
        name: order.customer_email || '',
        customer: `${order.customer_name || ''} ${order.customer_phone || ''}`,
        products: items.map((i) => i.name).join(' '),
        orderNumber: formatOrderId(order.id),
      };
      const searchOk = !q || (values[searchField] || values.all).toLowerCase().includes(q);
      const statusOk = filterStatus === 'all' || order.status === filterStatus;
      return searchOk && statusOk;
    });
  }, [orders, search, searchField, filterStatus]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    for (const order of orders) counts[order.status || 'pending'] = (counts[order.status || 'pending'] || 0) + 1;
    return counts;
  }, [orders]);

  const dashboardStats = useMemo(() => {
    const revenue = orders.reduce((sum, order) => sum + Number(order.total_price || 0), 0);
    const cost = orders.reduce((sum, order) => sum + Number(order.cost_price || 0), 0);
    const profit = orders.reduce((sum, order) => sum + Number(order.profit || 0), 0);
    const customers = new Set(orders.map((order) => order.customer_email || order.customer_phone || order.customer_name).filter(Boolean));
    const products = new Set(
      orders.flatMap((order) => parseItems(order.items).map((item) => item.name || item.sourceProductId).filter(Boolean) as string[])
    );
    return {
      revenue,
      cost,
      profit,
      customers: customers.size,
      products: products.size,
      pending: orders.filter((order) => (order.status || 'pending') === 'pending').length,
    };
  }, [orders]);

  const aiSafeOrders = useMemo(() => orders.filter(isAiSafeOrder), [orders]);
  const aiDraftOrders = useMemo(() => orders.filter(isAiDraftOrder), [orders]);

  const topProducts = useMemo(() => {
    const totals = new Map<string, { qty: number; revenue: number }>();
    for (const order of orders) {
      for (const item of parseItems(order.items)) {
        const name = item.name || item.sourceProductId || 'מוצר';
        const current = totals.get(name) || { qty: 0, revenue: 0 };
        current.qty += Number(item.quantity || 1);
        current.revenue += Number(item.price || 0) * Number(item.quantity || 1);
        totals.set(name, current);
      }
    }
    return Array.from(totals.entries())
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [orders]);

  const sourceStats = useMemo(() => {
    const totals = new Map<string, number>();
    for (const order of orders) {
      const label = sourceLabel(order);
      totals.set(label, (totals.get(label) || 0) + 1);
    }
    return Array.from(totals.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [orders]);

  if (!authed) return <LoginScreen />;

  if (activeView !== 'orders') {
    const maxProductRevenue = Math.max(...topProducts.map((item) => item.revenue), 1);
    const maxSourceCount = Math.max(...sourceStats.map((item) => item.count), 1);
    const viewTitle = NAV_ITEMS.find((item) => item.key === activeView)?.label || 'לוח בקרה';

    return (
      <main className="wp-admin-shell" dir="rtl">
        <aside className="wp-sidebar">
          <div className="wp-logo">מסורת</div>
          {visibleNavItems.map((item) => (
            <button key={item.key} className={item.key === activeView ? 'active' : ''} type="button" onClick={() => openAdminView(item.key)}>
              {item.label}
            </button>
          ))}
        </aside>

        <section className="wp-main">
          <header className="wp-topbar">
            <span>שלום, {currentUser?.fullName || currentUser?.username}</span>
            <button type="button" onClick={logout}>התנתק</button>
          </header>

          <div className="admin-view-head">
            <h1>{viewTitle}</h1>
            <button type="button" onClick={fetchOrders}>רענון נתונים</button>
          </div>

          {(activeView === 'dashboard' || activeView === 'reports' || activeView === 'graphs') && (
            <>
              <section className="metric-grid">
                <div><span>הזמנות</span><strong>{orders.length}</strong></div>
                <div><span>ממתינות</span><strong>{dashboardStats.pending}</strong></div>
                <div><span>הכנסות</span><strong>{formatMoney(dashboardStats.revenue)}</strong></div>
                <div><span>רווח</span><strong>{formatMoney(dashboardStats.profit)}</strong></div>
              </section>

              <section className="analytics-grid">
                <div className="wp-panel">
                  <h3>מוצרים מובילים</h3>
                  <div className="bar-list">
                    {topProducts.length === 0 ? <p>אין נתוני מוצרים להצגה</p> : topProducts.map((item) => (
                      <div key={item.name} className="bar-row">
                        <span>{item.name}</span>
                        <div><i style={{ width: `${Math.max(8, (item.revenue / maxProductRevenue) * 100)}%` }} /></div>
                        <strong>{formatMoney(item.revenue)}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="wp-panel">
                  <h3>מקורות הזמנה</h3>
                  <div className="bar-list compact">
                    {sourceStats.length === 0 ? <p>אין נתוני מקורות להצגה</p> : sourceStats.map((item) => (
                      <div key={item.name} className="bar-row">
                        <span>{item.name}</span>
                        <div><i style={{ width: `${Math.max(8, (item.count / maxSourceCount) * 100)}%` }} /></div>
                        <strong>{item.count}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}

          {activeView === 'products' && (
            <section className="wp-panel admin-table-panel">
              <h3>מוצרים מתוך הזמנות</h3>
              <table className="simple-admin-table">
                <thead><tr><th>מוצר</th><th>כמות</th><th>מכירות</th></tr></thead>
                <tbody>
                  {topProducts.map((item) => (
                    <tr key={item.name}><td>{item.name}</td><td>{item.qty}</td><td>{formatMoney(item.revenue)}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {activeView === 'customers' && (
            <section className="wp-panel admin-table-panel">
              <h3>לקוחות אחרונים</h3>
              <table className="simple-admin-table">
                <thead><tr><th>לקוח</th><th>אימייל</th><th>טלפון</th><th>הזמנה אחרונה</th></tr></thead>
                <tbody>
                  {orders.slice(0, 12).map((order) => (
                    <tr key={order.id}>
                      <td>{order.customer_name}</td>
                      <td>{order.customer_email}</td>
                      <td>{order.customer_phone}</td>
                      <td>#{formatOrderId(order.id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {activeView === 'coupons' && (
            <section className="wp-panel admin-table-panel">
              <h3>קופונים וזיכויים</h3>
              <p>כאן אפשר ליצור זיכוי ללקוח: קוד קופון בן 5 תווים, או זיכוי שמזוהה לפי מייל/טלפון של הלקוח.</p>
              {couponError && <div className="login-error">{couponError}</div>}
              <div className="coupon-create-grid">
                <input placeholder="קוד ידני או ריק לאוטומטי" value={couponDraft.code} onChange={(event) => setCouponDraft({ ...couponDraft, code: event.target.value.toUpperCase() })} />
                <input placeholder="שם לקוח" value={couponDraft.ownerName} onChange={(event) => setCouponDraft({ ...couponDraft, ownerName: event.target.value })} />
                <input placeholder="מייל לקוח" value={couponDraft.ownerEmail} onChange={(event) => setCouponDraft({ ...couponDraft, ownerEmail: event.target.value })} />
                <input placeholder="טלפון לקוח" value={couponDraft.ownerPhone} onChange={(event) => setCouponDraft({ ...couponDraft, ownerPhone: event.target.value })} />
                <select value={couponDraft.benefitType} onChange={(event) => setCouponDraft({ ...couponDraft, benefitType: event.target.value })}>
                  <option value="percent">אחוז הנחה</option>
                  <option value="fixed">סכום זיכוי</option>
                </select>
                <input type="number" min="0" placeholder="ערך" value={couponDraft.benefitValue} onChange={(event) => setCouponDraft({ ...couponDraft, benefitValue: event.target.value })} />
                <input type="number" min="1" placeholder="מספר שימושים" value={couponDraft.usageLimit} onChange={(event) => setCouponDraft({ ...couponDraft, usageLimit: event.target.value })} />
                <input type="datetime-local" value={couponDraft.expiresAt} onChange={(event) => setCouponDraft({ ...couponDraft, expiresAt: event.target.value })} />
                <input placeholder="הערה" value={couponDraft.note} onChange={(event) => setCouponDraft({ ...couponDraft, note: event.target.value })} />
                <button type="button" onClick={createCoupon} disabled={couponSaving}>צור קופון</button>
              </div>

              <table className="simple-admin-table">
                <thead>
                  <tr><th>קוד</th><th>לקוח</th><th>הטבה</th><th>שימושים</th><th>תוקף</th><th>סטטוס</th><th>נוצר</th></tr>
                </thead>
                <tbody>
                  {coupons.length === 0 ? (
                    <tr><td colSpan={7}>אין קופונים להצגה.</td></tr>
                  ) : coupons.map((coupon) => (
                    <tr key={coupon.id}>
                      <td><strong>{coupon.code}</strong></td>
                      <td>{coupon.owner_name || coupon.owner_email || coupon.owner_phone || '-'}</td>
                      <td>{coupon.benefit_type === 'fixed' ? `₪${coupon.benefit_value}` : `${coupon.benefit_value}%`}</td>
                      <td>{coupon.used_count}/{coupon.usage_limit}</td>
                      <td>{coupon.expires_at ? new Date(coupon.expires_at).toLocaleString('he-IL') : 'ללא'}</td>
                      <td>{coupon.status}</td>
                      <td>{new Date(coupon.created_at).toLocaleString('he-IL')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {activeView === 'settings' && (
            <section className="wp-panel admin-placeholder">
              <h3>הגדרות מערכת</h3>
              <p>מצב הזמנות אמת אצל הספק כבוי כל עוד לא מוגדר GitHub Secret בשם AUTO_ORDER_SUBMIT=true.</p>
              <p>הדאשבורד מחובר למסד הנתונים ומ��יג נתונים חיים מההזמנות.</p>
            </section>
          )}

          {activeView === 'health' && (
            canManageSystem ? (
              <section className="wp-panel admin-table-panel">
                <h3>בריאות האתר</h3>
                <p>כאן מרוכזת תמונת מצב חיה של האתר, לוח הבקרה, מסד הנתונים, הסנכרון, האוטומציה והמיילים. הבדיקה לא מציגה סיסמאות או מפתחות.</p>

                {systemHealthLoading && <p>בודק את כל מערך האתר...</p>}
                <section className="management-subsection approval-box">
                  <h4>בקשות אישור לתיקונים</h4>
                  <p>כאן יופיעו בעיות שהמערכת מצאה אבל לא נכון לתקן בלי אישור שלך, כמו שינוי אבטחה, מסד נתונים או פעולה שעלולה להשפיע על לקוחות.</p>
                  {approvalError && <div className="login-error">{approvalError}</div>}
                  {approvalRequests.length === 0 ? (
                    <p>אין כרגע בקשות שממתינות לאישור.</p>
                  ) : (
                    <div className="approval-list">
                      {approvalRequests.map((request) => {
                        const repairId = repairJobIdFromAction(request.action_key);
                        const linkedRepairJob = repairId ? repairJobs.find((job) => job.id === repairId) : null;
                        const linkedRepairLogs = linkedRepairJob ? parseRepairLogs(linkedRepairJob.logs) : [];
                        const progress = approvalProgress[request.id];
                        const blockerText = approvalBlockerText(request);
                        const canRunAutomatically = approvalCanRunAutomatically(request);
                        const visibleProgress = linkedRepairJob
                          ? { status: linkedRepairJob.status, logs: linkedRepairLogs, title: repairStatusLabel(linkedRepairJob.status), taskId: linkedRepairJob.id }
                          : progress
                            ? { status: progress.status, logs: progress.logs, title: approvalProgressStatusLabel(progress.status), taskId: null }
                            : request.status !== 'pending'
                              ? {
                                  status: request.status === 'rejected' ? 'rejected' : missingExternalSecret(request) || request.action_key === 'approval:review_only' ? 'failed' : 'completed',
                                  logs: approvalDiagnosisLogs(request, request.status === 'rejected' ? 'rejected' : missingExternalSecret(request) || request.action_key === 'approval:review_only' ? 'failed' : 'completed'),
                                  title: approvalProgressStatusLabel(request.status === 'rejected' ? 'rejected' : missingExternalSecret(request) || request.action_key === 'approval:review_only' ? 'failed' : 'completed'),
                                  taskId: null,
                                }
                            : null;
                        const isRunning = approvalSaving === request.id || progress?.status === 'running' || linkedRepairJob?.status === 'running' || linkedRepairJob?.status === 'queued';
                        return (
                          <article className={`approval-card ${request.severity}`} key={request.id}>
                            <div>
                              <strong>{request.title}</strong>
                              <span>{request.description}</span>
                              {request.recommended_action && <small>פעולה מומלצת: {request.recommended_action}</small>}
                              <small>מקור: {request.source} | נפתח: {new Date(request.created_at).toLocaleString('he-IL')}</small>
                            </div>
                            <div className="approval-card-actions">
                              <span className={`approval-status ${isRunning ? 'running' : request.status}`}>{isRunning ? 'בתהליך תיקון' : request.status === 'pending' ? 'ממתין לאישור' : request.status === 'approved' ? 'אושר' : request.status === 'rejected' ? 'נדחה' : 'בוצע'}</span>
                              {request.status === 'pending' && (
                                <>
                                  <button type="button" disabled={approvalSaving === request.id || !canRunAutomatically} onClick={() => decideApprovalRequest(request.id, 'approved')}>
                                    {canRunAutomatically ? 'אשר תיקון' : 'דורש הגדרה חיצונית'}
                                  </button>
                                  <button type="button" disabled={approvalSaving === request.id} onClick={() => decideApprovalRequest(request.id, 'rejected')}>דחה</button>
                                </>
                              )}
                            </div>
                            {blockerText && !canRunAutomatically && (
                              <div className="approval-blocker-note">{blockerText}</div>
                            )}
                            {visibleProgress && (
                              <div className={`approval-repair-panel ${visibleProgress.status}`}>
                                <div className="approval-repair-head">
                                  <div>
                                    <span>תהליך תיקון חי</span>
                                    <strong>{visibleProgress.title}</strong>
                                  </div>
                                  {visibleProgress.taskId ? <small>משימה #{visibleProgress.taskId}</small> : <small>בקשה #{request.id}</small>}
                                </div>
                                <div className="repair-progress-track" aria-label="שלבי התיקון">
                                  <span className={repairStageClass(visibleProgress.status, 'approval')}>אישור</span>
                                  <span className={repairStageClass(visibleProgress.status, 'scan')}>בדיקה</span>
                                  <span className={repairStageClass(visibleProgress.status, 'work')}>תיקון</span>
                                  <span className={repairStageClass(visibleProgress.status, 'done')}>סיום</span>
                                </div>
                                <div className="repair-log inline-live">
                                  {visibleProgress.logs.length === 0 ? (
                                    <small>ממתין להתחלת עבודה...</small>
                                  ) : visibleProgress.logs.slice(0, 8).map((entry, index) => (
                                    <small className={entry.level} key={`${request.id}-inline-${index}`}>
                                      {new Date(entry.at).toLocaleString('he-IL')} · {entry.text}
                                    </small>
                                  ))}
                                </div>
                                {visibleProgress.status === 'completed' && <div className="repair-complete-message">התיקון הושלם בהצלחה</div>}
                                {visibleProgress.status === 'blocked' && <div className="repair-blocked-message">התהליך נעצר כי חסרה הרשאה או הגדרה חיצונית. הלוג למעלה מפרט בדיוק מה צריך להשלים כדי להמשיך.</div>}
                                {visibleProgress.status === 'failed' && <div className="repair-blocked-message">התיקון נכשל בבדיקה. הלוג למעלה מציג את מקור התקלה האחרון שנמצא.</div>}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="management-subsection repair-center">
                  <h4>מרכז תיקונים ופיתוח חי</h4>
                  <p>כאן אפשר לבקש בדיקה, תיקון, אוטומציה או פיצ׳ר חדש. משימות שמצריכות שינוי קוד או גישה חיצונית ייפתחו כאישור מסודר, וכל שלב יירשם כאן בלוג חי.</p>
                  {repairError && <div className="login-error">{repairError}</div>}
                  <textarea
                    value={repairPrompt}
                    onChange={(event) => setRepairPrompt(event.target.value)}
                    placeholder="לדוגמה: בדוק למה מצב שבת לא מופעל, הוסף כפתור חדש, או הרץ בדיקה מקיפה על האוטומציות"
                    rows={4}
                  />
                  <div className="repair-actions">
                    <button type="button" disabled={repairSaving || !repairPrompt.trim()} onClick={() => createRepairJob()}>פתח תהליך תיקון</button>
                    <button type="button" disabled={repairSaving} onClick={() => createRepairJob('הרץ בדיקה מקיפה על האתר, לוח הבקרה, מסד הנתונים, האוטומציות, המיילים והגדרות האבטחה. דווח על כל בעיה ופתח בקשות אישור לכל תיקון מסוכן.')}>הרץ בדיקה מקיפה</button>
                  </div>
                  {repairJobs.length === 0 ? (
                    <p>אין עדיין תהליכי תיקון פתוחים.</p>
                  ) : (
                    <div className="repair-job-list">
                      {repairJobs.slice(0, 8).map((job) => {
                        const logs = parseRepairLogs(job.logs);
                        return (
                          <article className={`repair-job ${job.status}`} key={job.id}>
                            <div className="repair-job-head">
                              <strong>{job.title}</strong>
                              <span>{repairStatusLabel(job.status)}</span>
                            </div>
                            <p>{job.prompt}</p>
                            <div className="repair-log">
                              {logs.slice(0, 10).map((entry, index) => (
                                <small className={entry.level} key={`${job.id}-${index}`}>
                                  {new Date(entry.at).toLocaleString('he-IL')} · {entry.text}
                                </small>
                              ))}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                {systemHealthError && <div className="login-error">{systemHealthError}</div>}

                {systemHealth && (() => {
                  const summary = systemHealth.summary || healthSummaryFallback(systemHealth.checks);
                  const criticalChecks = systemHealth.checks.filter((check) => check.status === 'error' || check.status === 'missing');
                  const attentionChecks = systemHealth.checks.filter((check) => check.status === 'warning' || check.status === 'unknown');

                  return (
                    <>
                      <section className={healthSummaryClass(summary.status)}>
                        <div>
                          <span>מצב כללי</span>
                          <strong>{summary.label}</strong>
                          <p>{summary.detail}</p>
                        </div>
                        <button type="button" onClick={() => setActiveView('management')}>פתח ניהול</button>
                      </section>

                      <section className="metric-grid health-metrics">
                        <div><span>תקין</span><strong>{summary.totals.ok}</strong></div>
                        <div><span>אזהרות</span><strong>{summary.totals.warning}</strong></div>
                        <div><span>שגיאות</span><strong>{summary.totals.error}</strong></div>
                        <div><span>לא אומת</span><strong>{summary.totals.unknown}</strong></div>
                      </section>

                      <section className="health-grid">
                        <div className="health-card">
                          <h4>מה דורש טיפול</h4>
                          {criticalChecks.length === 0 ? (
                            <p>אין כרגע תקלות קריטיות.</p>
                          ) : criticalChecks.map((check) => (
                            <article key={`${check.scope}-${check.key}`} className="health-issue critical">
                              <strong>{check.label}</strong>
                              <span>{check.scope}</span>
                              <p>{check.detail}</p>
                              {check.nextStep && <small>{check.nextStep}</small>}
                            </article>
                          ))}
                        </div>

                        <div className="health-card">
                          <h4>נקודות למעקב</h4>
                          {attentionChecks.length === 0 ? (
                            <p>אין כרגע אזהרות פתוחות.</p>
                          ) : attentionChecks.slice(0, 8).map((check) => (
                            <article key={`${check.scope}-${check.key}`} className="health-issue attention">
                              <strong>{check.label}</strong>
                              <span>{check.scope}</span>
                              <p>{check.detail}</p>
                              {check.nextStep && <small>{check.nextStep}</small>}
                            </article>
                          ))}
                        </div>
                      </section>

                      <table className="simple-admin-table health-table">
                        <thead>
                          <tr>
                            <th>מערכת</th>
                            <th>בדיקה</th>
                            <th>מצב</th>
                            <th>פירוט</th>
                            <th>צעד מומלץ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {systemHealth.checks.map((check) => (
                            <tr key={`${check.scope}-${check.key}`}>
                              <td>{check.scope}</td>
                              <td>
                                <strong>{check.label}</strong>
                                <small>{check.key}</small>
                              </td>
                              <td><span className={systemStatusClass(check.status)}>{systemStatusLabel(check.status)}</span></td>
                              <td>{check.detail}</td>
                              <td>{check.nextStep || check.impact || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <p>עודכן לאחרונה: {new Date(systemHealth.generatedAt).toLocaleString('he-IL')}</p>
                    </>
                  );
                })()}
              </section>
            ) : (
              <section className="wp-panel admin-placeholder">
                <h3>אין הרשאה</h3>
                <p>לשונית בריאות האתר פתוחה רק למנהל מערכת או לבעלים.</p>
              </section>
            )
          )}

          {activeView === 'management' && (
            canManageSystem ? (
              <section className="wp-panel admin-table-panel">
                <h3>ניהול מערכת</h3>
                <p>כאן מרוכזות בדיקות החיבורים והמפתחות של לוח הבקרה ואתר הלקוחות. הערכים עצמם לא מוצגים.</p>

                <section className="management-subsection site-control-box">
                  <h4>כיבוי והפעלת האתר</h4>
                  {siteControlError && <div className="login-error">{siteControlError}</div>}
                  {!siteControl ? (
                    <p>טוען מצב אתר...</p>
                  ) : (
                    <>
                      <div className={siteControl.active ? 'site-control-status off' : 'site-control-status on'}>
                        <strong>{siteControl.active ? 'האתר כבוי ללקוחות' : 'האתר פתוח ללקוחות'}</strong>
                        <span>{siteControl.active ? siteControl.message : 'החנות פעילה כרגיל'}</span>
                      </div>
                      <div className="site-control-actions">
                        <label>
                          משפט שיוצג בזמן תחזוקה
                          <input value={siteControl.manualMessage || ''} onChange={(event) => setSiteControl({ ...siteControl, manualMessage: event.target.value })} />
                        </label>
                        <label>
                          כיבוי עד תאריך ושעה
                          <input type="datetime-local" value={manualUntilDraft} onChange={(event) => setManualUntilDraft(event.target.value)} />
                        </label>
                        <button type="button" disabled={siteControlSaving} onClick={() => saveSiteControl({ manualEnabled: true, manualUntil: dateTimeLocalToIso(manualUntilDraft) })}>השבת אתר עכשיו</button>
                        <button type="button" disabled={siteControlSaving} onClick={() => saveSiteControl({ manualEnabled: false, manualUntil: null })}>הפעל אתר עכשיו</button>
                      </div>
                      <div className="shabbat-control">
                        <h4>שבת</h4>
                        <p>אפשר להכניס מראש כמה שבתות שרוצים. בזמן החלון האתר יציג: אני אתר שומר שבת.</p>
                        <div className="site-control-actions">
                          <label>שם השבת<input value={shabbatDraft.name} onChange={(event) => setShabbatDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="שבת פרשת..." /></label>
                          <label>כיבוי<input type="datetime-local" value={shabbatDraft.startsAt} onChange={(event) => setShabbatDraft((prev) => ({ ...prev, startsAt: event.target.value }))} /></label>
                          <label>הפעלה<input type="datetime-local" value={shabbatDraft.endsAt} onChange={(event) => setShabbatDraft((prev) => ({ ...prev, endsAt: event.target.value }))} /></label>
                          <button type="button" disabled={siteControlSaving} onClick={addShabbatSchedule}>הוסף שבת</button>
                        </div>
                        {siteControl.shabbatSchedules.length === 0 ? <p>אין שבתות מתוזמנות.</p> : (
                          <table className="simple-admin-table">
                            <thead><tr><th>שם</th><th>כיבוי</th><th>הפעלה</th><th>פעולה</th></tr></thead>
                            <tbody>
                              {siteControl.shabbatSchedules.map((item) => (
                                <tr key={item.id}>
                                  <td>{item.name}</td>
                                  <td>{new Date(item.startsAt).toLocaleString('he-IL')}</td>
                                  <td>{new Date(item.endsAt).toLocaleString('he-IL')}</td>
                                  <td><button type="button" onClick={() => removeShabbatSchedule(item.id)} disabled={siteControlSaving}>מחק</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </>
                  )}
                </section>

                {systemHealthLoading && <p>טוען בדיקות מערכת...</p>}
                {systemHealthError && <div className="login-error">{systemHealthError}</div>}

                {systemHealth && (
                  <>
                    <div className="metric-grid">
                      <div><span>בדיקות</span><strong>{systemHealth.checks.length}</strong></div>
                      <div><span>פעיל</span><strong>{systemHealth.checks.filter((check) => check.status === 'ok').length}</strong></div>
                      <div><span>הזמנות AI זמניות</span><strong>{aiDraftOrders.length}</strong></div>
                      <div><span>כל הזמנות AI</span><strong>{aiSafeOrders.length}</strong></div>
                    </div>

                    <section className="management-subsection">
                      <h4>הזמנות AI זמניות</h4>
                      {aiDraftOrders.length === 0 ? (
                        <p>אין כרגע הזמנות AI שממתינות לאישור מנהל.</p>
                      ) : (
                        <table className="simple-admin-table">
                          <thead>
                            <tr>
                              <th>הזמנה</th>
                              <th>לקוח</th>
                              <th>סה&quot;כ</th>
                              <th>נוצרה</th>
                              <th>פעולה</th>
                            </tr>
                          </thead>
                          <tbody>
                            {aiDraftOrders.map((order) => (
                              <tr key={order.id}>
                                <td>
                                  <button className="order-link" type="button" onClick={() => setSelected(order)}>
                                    #{formatOrderId(order.id)}
                                  </button>
                                </td>
                                <td>{order.customer_name || 'לקוח'}<small>{order.customer_phone || order.customer_email}</small></td>
                                <td>{formatMoney(order.total_price)}</td>
                                <td>{dateHe(order.created_at)} {timeHe(order.created_at)}</td>
                                <td className="row-actions">
                                  <button type="button" onClick={() => decideAiDraftOrder(order, 'approve')} disabled={saving}>אשר לטיפול</button>
                                  <button type="button" onClick={() => decideAiDraftOrder(order, 'cancel')} disabled={saving}>בטל</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </section>

                    <section className="management-subsection">
                      <h4>פניות צור קשר</h4>
                      {contactError && <div className="login-error">{contactError}</div>}
                      {contactRequests.length === 0 ? (
                        <p>אין כרגע פניות צור קשר להצגה.</p>
                      ) : (
                        <table className="simple-admin-table">
                          <thead>
                            <tr>
                              <th>תאריך</th>
                              <th>שם</th>
                              <th>טלפון</th>
                              <th>מייל</th>
                              <th>הודעה</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contactRequests.map((request) => (
                              <tr key={request.id}>
                                <td>{dateHe(request.created_at)} {timeHe(request.created_at)}</td>
                                <td>{request.name}</td>
                                <td>{request.phone}</td>
                                <td>{request.email || '-'}</td>
                                <td>{request.message}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </section>

                    <table className="simple-admin-table">
                      <thead>
                        <tr>
                          <th>מערכת</th>
                          <th>בדיקה</th>
                          <th>מצב</th>
                          <th>פירוט</th>
                        </tr>
                      </thead>
                      <tbody>
                        {systemHealth.checks.map((check) => (
                          <tr key={`${check.scope}-${check.key}`}>
                            <td>{check.scope}</td>
                            <td>
                              <strong>{check.label}</strong>
                              <small>{check.key}</small>
                            </td>
                            <td><span className={systemStatusClass(check.status)}>{systemStatusLabel(check.status)}</span></td>
                            <td>{check.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <p>עודכן לאחרונה: {new Date(systemHealth.generatedAt).toLocaleString('he-IL')}</p>
                  </>
                )}
              </section>
            ) : (
              <section className="wp-panel admin-placeholder">
                <h3>אין הרשאה</h3>
                <p>לשונית ניהול פתוחה רק למנהל מערכת או לבעלים.</p>
              </section>
            )
          )}

        </section>
      </main>
    );
  }

  if (selected) {
    const items = parseItems(selected.items);
    const notes = parseAdminNotes(selected.admin_notes);
    const sourceParts = orderSourceParts(selected);
    const publicNote = customerNote(selected.notes);
    const shippingPrice = Math.max(0, Number(selected.total_price || 0) - items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0));
    return (
      <main className="wp-admin-shell" dir="rtl">
        <aside className="wp-sidebar">
          <div className="wp-logo">מסורת</div>
          {visibleNavItems.map((item) => (
            <button key={item.key} className={item.key === activeView ? 'active' : ''} type="button" onClick={() => openAdminView(item.key)}>
              {item.label}
            </button>
          ))}
        </aside>

        <section className="wp-main">
          <header className="wp-topbar">
            <span>שלום, {currentUser?.fullName || currentUser?.username}</span>
            <button type="button" onClick={() => setSelected(null)}>
              חזרה להזמנות
            </button>
          </header>

          <div className="order-title-row">
            <h1>עריכת הזמנה</h1>
            <button type="button" onClick={fetchOrders}>
              רענון
            </button>
          </div>

          <div className="order-edit-grid">
            <section className="wp-panel order-main-panel">
              <div className="panel-title">
                פרטי הזמנה #{formatOrderId(selected.id)}
                <span>נוצרה בתאריך {dateHe(selected.created_at)} בשעה {timeHe(selected.created_at)}</span>
              </div>

              <div className="order-form-grid">
                <label>
                  תאריך יצירה
                  <input readOnly value={dateHe(selected.created_at)} />
                </label>
                <label>
                  מצב
                  <select value={selected.status || 'pending'} onChange={(e) => updateStatus(selected.id, e.target.value)} disabled={saving}>
                    {STATUSES.map((status) => (
                      <option key={status.key} value={status.key}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  לקוח
                  <input readOnly value={selected.customer_name || ''} />
                </label>
                <label>
                  מקור
                  <input readOnly value={sourceLabel(selected)} />
                </label>
                <label>
                  כיצד התבצע התשלום
                  <input readOnly value={paymentMethodLabel(selected.payment_method, selected.payment_status)} />
                </label>
                <label>
                  סטטוס תשלום
                  <input readOnly value={paymentStatusLabel(selected.payment_status)} />
                </label>
              </div>

              <div className="addresses-grid">
                <div>
                  <h3>חיוב</h3>
                  <p>{selected.customer_name}</p>
                  <p>{selected.customer_address}</p>
                  <a href={`mailto:${selected.customer_email}`}>{selected.customer_email}</a>
                  <a href={`tel:${selected.customer_phone}`}>{selected.customer_phone}</a>
                  {publicNote && <div className="customer-note"><strong>הערת לקוח:</strong> {publicNote}</div>}
                </div>
                <div>
                  <h3>משלוח</h3>
                  <p>{selected.customer_name}</p>
                  <p>{selected.customer_address}</p>
                  <a href={`tel:${selected.customer_phone}`}>{selected.customer_phone}</a>
                  {publicNote && <div className="customer-note"><strong>הערת לקוח:</strong> {publicNote}</div>}
                </div>
              </div>

              <table className="items-table">
                <thead>
                  <tr>
                    <th>פריט</th>
                    <th>מחיר ללקוח</th>
                    <th>עלות</th>
                    <th>כמות</th>
                    <th>סך הכל</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const qty = Number(item.quantity || 1);
                    const price = Number(item.price || 0);
                    const cost = Number(item.cost || 0);
                    const product = matchProduct(item, productsCatalog);
                    const image = itemImage(item, product);
                    const lines = engravingLines(item);
                    const file = item.sketchFile;
                    return (
                      <tr key={`${item.name}-${index}`}>
                        <td className="product-cell">
                          <div className="product-line">
                            <div className="product-thumb">
                              {image ? <img src={image} alt="" /> : <span>אין תמונה</span>}
                            </div>
                            <div>
                          <a
                            href={productUrl(item)}
                            title={`פתח באתר החדש: ${productUrl(item)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => {
                              event.preventDefault();
                              openProduct(item);
                            }}
                          >
                            {item.name || item.sourceProductId || 'מוצר'}
                          </a>
                              <small>מק&quot;ט: {itemSku(item, product)}</small>
                              {lines.length > 0 && (
                                <div className="addon-fields">
                                  <strong>הטבעה / אפשרויות</strong>
                                  {lines.map((line) => <span key={line}>{line}</span>)}
                                </div>
                              )}
                              {file?.name && (
                                <div className="addon-fields">
                                  <strong>קובץ שהלקוח העלה</strong>
                                  {file.dataUrl ? (
                                    <a href={file.dataUrl} download={file.name} target="_blank" rel="noopener noreferrer">{file.name}</a>
                                  ) : (
                                    <span>{file.name}</span>
                                  )}
                                  <span>{[file.type, fileSizeLabel(file.size)].filter(Boolean).join(' · ')}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <input readOnly value={formatMoney(price)} />
                        </td>
                        <td>
                          <input readOnly value={formatMoney(cost)} />
                        </td>
                        <td>
                          <input readOnly value={qty} />
                        </td>
                        <td>{formatMoney(price * qty)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>סך ביניים</td>
                    <td>{formatMoney(selected.total_price)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4}>עלות מוצרים</td>
                    <td>{formatMoney(selected.cost_price)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4}>משלוח / תוספות מחיר</td>
                    <td>{formatMoney(shippingPrice)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4}>רווח</td>
                    <td>{formatMoney(selected.profit)}</td>
                  </tr>
                </tfoot>
              </table>

              <div className="wp-panel slim">
                <h3>פרטי מערכת</h3>
                <div className="custom-fields">
                  <span>מספר הזמנה אצל הספק</span>
                  <input readOnly value={selected.external_order_id || ''} />
                  <span>קישור המשך תשלום</span>
                  <input readOnly value={selected.checkout_url || ''} />
                  <span>שודר אוטומטית לספק</span>
                  <input readOnly value={selected.auto_submitted ? 'כן' : 'לא'} />
                </div>
              </div>
            </section>

            <aside className="order-side">
              <section className="wp-panel side-card">
                <h3>הזמנה פעולות</h3>
                <div className="side-action-row">
                  <button className="square-action" type="button" onClick={runOrderAction}>›</button>
                  <select value={orderAction} onChange={(e) => setOrderAction(e.target.value)} disabled={saving}>
                    {ORDER_ACTIONS.map((action) => (
                      <option key={action.value} value={action.value}>{action.label}</option>
                    ))}
                  </select>
                </div>
                <select value={selected.status || 'pending'} onChange={(e) => updateStatus(selected.id, e.target.value)} disabled={saving}>
                  {STATUSES.map((status) => (
                    <option key={status.key} value={status.key}>
                      {status.label}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setSelected(null)}>
                  חזרה לרשימה
                </button>
              </section>

              <section className="wp-panel side-card assignment-card">
                <h3>שיוך של הזמנה</h3>
                <dl>
                  <dt>מקור</dt>
                  <dd>{sourceParts.source}</dd>
                  <dt>סוג מקור</dt>
                  <dd>{sourceParts.type}</dd>
                  <dt>קמפיין</dt>
                  <dd>{sourceParts.campaign}</dd>
                  <dt>מקור</dt>
                  <dd>{selected.utm_source || selected.source || 'ישיר'}</dd>
                  <dt>בינוני</dt>
                  <dd>{sourceParts.medium}</dd>
                  <dt>סוג מכשיר</dt>
                  <dd>{sourceParts.device}</dd>
                </dl>
              </section>

              <section className="wp-panel side-card">
                <h3>סטטיסטיקת לקוח</h3>
                <p>סה&quot;כ הזמנות: 1</p>
                <p>ערך הזמנה: {formatMoney(selected.total_price)}</p>
                <p>רווח: {formatMoney(selected.profit)}</p>
              </section>

              {isAiSafeOrder(selected) && (
                <section className="wp-panel ai-safe-panel">
                  <h3>הזמנת AI זמנית</h3>
                  <p>ההזמנה נוצרה דרך הצ׳אט. היא לא נשלחה לאתר המקורי ולא בוצע חיוב.</p>
                  {isAiDraftOrder(selected) ? (
                    <div className="row-actions">
                      <button type="button" onClick={() => decideAiDraftOrder(selected, 'approve')} disabled={saving}>אשר לטיפול</button>
                      <button type="button" onClick={() => decideAiDraftOrder(selected, 'cancel')} disabled={saving}>בטל</button>
                    </div>
                  ) : (
                    <span className={statusChipClass(selected.status)}>{STATUS_LABELS[selected.status] || selected.status || 'ממתין לטיפול'}</span>
                  )}
                </section>
              )}

              <section className="wp-panel">
                <h3>דאטה לוג׳יקס</h3>
                <div className="datalogics-card">
                  <strong>{selected.external_order_id || 'לא שודר'}</strong>
                  <div>
                    <IconButton title="עדכון">↻</IconButton>
                    <IconButton title="הדפסה">▣</IconButton>
                    <IconButton title="שידור">➤</IconButton>
                  </div>
                  <span>{selected.auto_submitted ? 'שודר' : 'טיוטה בטוחה'}</span>
                </div>
              </section>

              <section className="wp-panel notes-log">
                <h3>הזמנה הערות</h3>
                <textarea value={adminNoteDraft} onChange={(e) => setAdminNoteDraft(e.target.value)} placeholder="הוסף הערה" />
                <button type="button" onClick={addAdminNote} disabled={!adminNoteDraft.trim() || saving}>הוספה</button>
                {notes.length === 0 ? <p>אין הערות עובדים להזמנה.</p> : notes.map((note) => (
                  <div className="admin-note" key={note.id}>
                    <p>{note.text}</p>
                    <small>{note.author} · {dateHe(note.createdAt)} {timeHe(note.createdAt)}</small>
                    <button type="button" onClick={() => deleteAdminNote(note.id)} disabled={saving}>למחוק את ההערה</button>
                  </div>
                ))}
              </section>
            </aside>
          </div>
        </section>
      </main>
    );
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((order) => selectedIds.includes(order.id));

  return (
    <main className="wp-admin-shell" dir="rtl">
      <aside className="wp-sidebar">
        <div className="wp-logo">מסורת</div>
        {visibleNavItems.map((item) => (
          <button key={item.key} className={item.key === activeView ? 'active' : ''} type="button" onClick={() => openAdminView(item.key)}>
            {item.label}
          </button>
        ))}
      </aside>

      <section className="orders-admin">
      <header className="orders-top">
        <div>
          <strong>הזמנות</strong>
          <span>לוח בקרה בסגנון WooCommerce</span>
        </div>
        <div>
          <button type="button" onClick={fetchOrders}>רענן</button>
          <button type="button" onClick={logout}>התנתק</button>
        </div>
      </header>

      <nav className="status-links">
        <button className={filterStatus === 'all' ? 'active' : ''} type="button" onClick={() => setFilterStatus('all')}>
          הכל ({statusCounts.all || 0})
        </button>
        {STATUSES.map((status) => (
          <button key={status.key} className={filterStatus === status.key ? 'active' : ''} type="button" onClick={() => setFilterStatus(status.key)}>
            {status.label} ({statusCounts[status.key] || 0})
          </button>
        ))}
      </nav>

      <section className="filters-row">
        <button type="button" onClick={() => setSearch('')}>חיפוש הזמנות</button>
        <select value={searchField} onChange={(e) => setSearchField(e.target.value)}>
          {FIELD_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="גלופה" />
      </section>

      <section className="bulk-row">
        <div className="pagination">
          <button type="button">»</button>
          <button type="button">‹</button>
          <input readOnly value="1" />
          <span>מתוך 1</span>
          <strong>{filtered.length} פריטים</strong>
        </div>

        <div className="bulk-actions">
          <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}>
            <option value="">עריכה קבוצתית</option>
            {STATUSES.map((status) => (
              <option key={status.key} value={status.key}>שינוי מצב ל{status.label}</option>
            ))}
          </select>
          <button type="button" onClick={runBulkAction} disabled={!bulkAction || selectedIds.length === 0 || saving}>
            החל
          </button>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">כל התאריכים</option>
            {STATUSES.map((status) => (
              <option key={status.key} value={status.key}>{status.label}</option>
            ))}
          </select>
          <button type="button" onClick={fetchOrders}>סנן</button>
        </div>
      </section>

      <section className="orders-table-wrap">
        <table className="orders-table">
          <thead>
            <tr>
              <th className="check-col">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => setSelectedIds(e.target.checked ? filtered.map((order) => order.id) : [])}
                />
              </th>
              <th>הזמנה</th>
              <th>תאריך</th>
              <th>מצב</th>
              <th>סה&quot;כ</th>
              <th>רווח</th>
              <th>דאטה לוג׳יקס</th>
              <th>מצב ייצוא</th>
              <th>מקור</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="empty-row">טוען הזמנות...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="empty-row">אין הזמנות להצגה</td></tr>
            ) : (
              filtered.map((order) => {
                const items = parseItems(order.items);
                const checked = selectedIds.includes(order.id);
                return (
                  <tr key={order.id}>
                    <td className="check-col">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, order.id] : prev.filter((id) => id !== order.id))}
                      />
                    </td>
                    <td>
                      <button className="order-link" type="button" onClick={() => setSelected(order)}>
                        #{formatOrderId(order.id)} {order.customer_name || 'לקוח'}
                      </button>
                      {isAiSafeOrder(order) && <span className="ai-order-badge">הזמנת AI זמנית</span>}
                      <small>{items.slice(0, 2).map((item) => item.name).join(', ')}</small>
                    </td>
                    <td>
                      <IconButton title="צפיה" onClick={() => setSelected(order)}>◉</IconButton>
                      <span>{dateHe(order.created_at)}</span>
                    </td>
                    <td><span className={statusChipClass(order.status)}>{STATUS_LABELS[order.status] || order.status || 'ממתין לטיפול'}</span></td>
                    <td>{formatMoney(order.total_price)}</td>
                    <td>{formatMoney(order.profit)}</td>
                    <td>
                      <div className="datalogics-actions">
                        <IconButton title="עריכה">✎</IconButton>
                        <IconButton title="הדפסה">▣</IconButton>
                        <IconButton title="שידור משלוח">➤</IconButton>
                      </div>
                      <button className="ship-button" type="button">שידור משלוח</button>
                    </td>
                    <td>—</td>
                    <td>{sourceLabel(order)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
      </section>
    </main>
  );
}

