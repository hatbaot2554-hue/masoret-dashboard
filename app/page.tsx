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

type AdminView = 'dashboard' | 'orders' | 'products' | 'customers' | 'coupons' | 'reports' | 'graphs' | 'settings';

const PRODUCT_SITE_URL = 'https://masoret-website.vercel.app';

const STATUSES = [
  { key: 'pending', label: 'ממתין לטיפול', chip: 'red' },
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

  useEffect(() => {
    const token = sessionStorage.getItem('dashboard_token');
    const user = sessionStorage.getItem('dashboard_user');
    if (token && user) {
      try {
        setCurrentUser(JSON.parse(user));
        setAuthed(true);
      } catch {
        sessionStorage.clear();
      }
    }
  }, []);

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
          {NAV_ITEMS.map((item) => (
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
            <section className="wp-panel admin-placeholder">
              <h3>קופונים</h3>
              <p>אין כרגע מנגנון קופונים במסד הנתונים. הכפתור פעיל ומוכן לחיבור כשנוסיף טבלת קופונים.</p>
            </section>
          )}

          {activeView === 'settings' && (
            <section className="wp-panel admin-placeholder">
              <h3>הגדרות מערכת</h3>
              <p>מצב הזמנות אמת אצל הספק כבוי כל עוד לא מוגדר GitHub Secret בשם AUTO_ORDER_SUBMIT=true.</p>
              <p>הדאשבורד מחובר למסד הנתונים ומציג נתונים חיים מההזמנות.</p>
            </section>
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
          {NAV_ITEMS.map((item) => (
            <button key={item.key} className={item.key === 'orders' ? 'active' : ''} type="button" onClick={() => openAdminView(item.key)}>
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
        {NAV_ITEMS.map((item) => (
          <button key={item.key} className={item.key === 'orders' ? 'active' : ''} type="button" onClick={() => openAdminView(item.key)}>
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
