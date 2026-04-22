// הוסף state:
const [authed, setAuthed] = useState(false)
const [pass, setPass] = useState('')
const DASHBOARD_PASSWORD = process.env.NEXT_PUBLIC_DASHBOARD_PASSWORD || 'masoret2024'

// הוסף לפני ה-return הראשי:
if (!authed) {
  return (
    <div style={{ maxWidth: '400px', margin: '120px auto', padding: '0 24px', textAlign: 'center' }}>
      <h2 style={{ fontFamily: 'serif', fontSize: '28px', marginBottom: '24px' }}>לוח בקרה</h2>
      <input type="password" value={pass} onChange={e => setPass(e.target.value)}
        placeholder="סיסמה" onKeyDown={e => { if (e.key === 'Enter' && pass === DASHBOARD_PASSWORD) setAuthed(true) }}
        style={{ width: '100%', padding: '12px', border: '1px solid #ddd', fontSize: '16px', marginBottom: '12px', textAlign: 'center' }} />
      <button onClick={() => { if (pass === DASHBOARD_PASSWORD) setAuthed(true) }}
        style={{ width: '100%', padding: '12px', background: '#1A2332', color: '#C9A84C', border: 'none', fontSize: '16px', cursor: 'pointer' }}>
        כניסה
      </button>
    </div>
  )
}
'use client';
import { useEffect, useState } from 'react';

type OrderItem = { name?: string; sourceProductId?: string; quantity?: number; price?: number; cost?: number; options?: string };
type Order = {
  id: string; created_at: string; customer_name: string; customer_phone: string;
  customer_email: string; customer_address: string; total_price: number;
  cost_price: number; profit: number; status: string; payment_status: string;
  payment_method: string; notes: string; source: string; utm_source: string;
  items: OrderItem[]; external_order_id?: string;
};

const SC: Record<string, string> = { pending:'#F59E0B', confirmed:'#3B82F6', shipped:'#8B5CF6', delivered:'#10B981', cancelled:'#EF4444' };
const SL: Record<string, string> = { pending:'ממתין לטיפול', confirmed:'אושר', shipped:'נשלח', delivered:'נמסר', cancelled:'בוטל' };

function formatOrderId(id: string) {
  return String(id).replace(/\D/g, '').padStart(5, '0');
}

const sourceLabel = (s: string) => {
  if (!s || s === 'direct') return '🔗 ישיר';
  if (s.includes('google')) return '🔍 Google';
  if (s.includes('facebook') || s.includes('fb')) return '📘 Facebook';
  if (s.includes('instagram')) return '📸 Instagram';
  if (s.includes('whatsapp')) return '💬 WhatsApp';
  return `📣 ${s}`;
};

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);
  const [updating, setUpdating] = useState(false);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const fetchOrders = () => {
    setLoading(true);
    fetch('/api/orders').then(r => r.json()).then(data => { if (Array.isArray(data)) setOrders(data); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchOrders(); }, []);

  const updateStatus = async (id: string, newStatus: string) => {
    setUpdating(true);
    await fetch(`/api/orders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
    await fetchOrders();
    setUpdating(false);
    setSelected(prev => prev ? { ...prev, status: newStatus } : null);
  };

  const filtered = orders.filter(o => {
    const matchSearch = o.customer_name?.includes(search) || o.customer_phone?.includes(search) || o.customer_email?.includes(search);
    const matchStatus = filterStatus === 'all' || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    revenue: orders.reduce((s, o) => s + Number(o.total_price), 0),
    profit: orders.reduce((s, o) => s + Number(o.profit || 0), 0),
  };

  const PS = { background: '#0A0E1A', color: '#fff', fontFamily: 'Heebo, sans-serif', minHeight: '100vh' };

  if (view === 'detail' && selected) return (
    <div dir="rtl" style={PS}>
      <div style={{ background: '#111827', borderBottom: '1px solid #1F2937', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={() => { setView('list'); setSelected(null); }} style={{ background: '#1F2937', border: '1px solid #374151', color: '#9CA3AF', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>→ חזור</button>
        <h1 style={{ margin: 0, color: '#F59E0B', fontSize: '18px' }}>הזמנה #{formatOrderId(selected.id)}</h1>
        {selected.external_order_id && (
          <span style={{ color: '#6B7280', fontSize: '13px' }}>מס׳ באתר הקיים: #{selected.external_order_id}</span>
        )}
        <span style={{ background: SC[selected.status] + '22', color: SC[selected.status], padding: '4px 12px', borderRadius: '20px', fontSize: '13px', border: `1px solid ${SC[selected.status]}44` }}>{SL[selected.status]}</span>
        <span style={{ color: '#6B7280', fontSize: '13px', marginRight: 'auto' }}>{sourceLabel(selected.utm_source || selected.source)}</span>
      </div>

      <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ background: '#111827', borderRadius: '12px', padding: '20px', border: '1px solid #1F2937' }}>
          <h3 style={{ color: '#F59E0B', marginTop: 0, fontSize: '15px' }}>👤 פרטי לקוח</h3>
          {([['שם', selected.customer_name], ['טלפון', selected.customer_phone], ['אימייל', selected.customer_email], ['כתובת', selected.customer_address], ['תאריך', new Date(selected.created_at).toLocaleDateString('he-IL')], ['מקור', sourceLabel(selected.utm_source || selected.source)]] as [string,string][]).map(([k,v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1F2937' }}>
              <span style={{ color: '#6B7280', fontSize: '13px' }}>{k}</span>
              <span style={{ fontSize: '13px' }}>{v}</span>
            </div>
          ))}
          {selected.notes && <p style={{ color: '#9CA3AF', fontSize: '13px', marginTop: '12px' }}>הערות: {selected.notes}</p>}
        </div>

        <div style={{ background: '#111827', borderRadius: '12px', padding: '20px', border: '1px solid #1F2937' }}>
          <h3 style={{ color: '#F59E0B', marginTop: 0, fontSize: '15px' }}>💰 כספים וסטטוס</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
            {[['מחיר ללקוח', `₪${Number(selected.total_price).toLocaleString()}`, '#10B981'],
              ['עלות לנו', `₪${Number(selected.cost_price || 0).toLocaleString()}`, '#EF4444'],
              ['רווח', `₪${Number(selected.profit || 0).toLocaleString()}`, '#F59E0B']].map(([label, val, color]) => (
              <div key={label} style={{ background: '#0F172A', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <p style={{ color: '#6B7280', fontSize: '11px', margin: '0 0 4px' }}>{label}</p>
                <p style={{ color, fontSize: '18px', fontWeight: '700', margin: 0 }}>{val}</p>
              </div>
            ))}
          </div>
          <p style={{ color: '#6B7280', fontSize: '13px', margin: '0 0 10px' }}>שנה סטטוס:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {Object.entries(SL).map(([key, label]) => (
              <button key={key} onClick={() => updateStatus(selected.id, key)} disabled={updating}
                style={{ background: selected.status === key ? SC[key] : '#1F2937', color: selected.status === key ? '#fff' : '#9CA3AF', border: `1px solid ${SC[key]}66`, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: '#111827', borderRadius: '12px', padding: '20px', border: '1px solid #1F2937', gridColumn: '1 / -1' }}>
          <h3 style={{ color: '#F59E0B', marginTop: 0, fontSize: '15px' }}>📦 מוצרים</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0F172A' }}>
                {['מוצר', 'אפשרויות', 'כמות', 'מחיר ללקוח', 'עלות', 'רווח'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'right', fontSize: '12px', color: '#F59E0B' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(selected.items) ? selected.items : []).map((item, idx) => {
                const qty = item.quantity || 1;
                const price = item.price || 0;
                const cost = item.cost || 0;
                const itemProfit = (price - cost) * qty;
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #1F2937' }}>
                    <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                      <a href={`https://masoret-website.vercel.app/products/${item.sourceProductId}`} target="_blank" rel="noreferrer"
                        style={{ color: '#60A5FA', textDecoration: 'none' }}>
                        {item.name || item.sourceProductId || 'מוצר'}
                      </a>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#9CA3AF' }}>{item.options || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#9CA3AF' }}>{qty}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#10B981' }}>₪{(price * qty).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#EF4444' }}>₪{(cost * qty).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#F59E0B' }}>₪{itemProfit.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div dir="rtl" style={PS}>
      <div style={{ background: '#111827', borderBottom: '1px solid #1F2937', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>📦</span>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: '700', color: '#F59E0B', margin: 0 }}>המרכז למסורת יהודית</h1>
            <p style={{ fontSize: '11px', color: '#6B7280', margin: 0 }}>לוח בקרה</p>
          </div>
        </div>
        <button onClick={fetchOrders} style={{ background: '#1F2937', border: '1px solid #374151', color: '#9CA3AF', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>🔄 רענן</button>
      </div>

      <div style={{ padding: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'סה"כ הזמנות', value: stats.total, icon: '🛒', color: '#3B82F6' },
            { label: 'ממתינות', value: stats.pending, icon: '⏳', color: '#F59E0B' },
            { label: 'הכנסות', value: `₪${stats.revenue.toLocaleString()}`, icon: '💵', color: '#10B981' },
            { label: 'רווח נקי', value: `₪${stats.profit.toLocaleString()}`, icon: '💰', color: '#F59E0B' },
          ].map((s) => (
            <div key={s.label} style={{ background: '#111827', border: `1px solid ${s.color}33`, borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ color: '#6B7280', fontSize: '12px', margin: '0 0 6px' }}>{s.label}</p>
                  <p style={{ color: s.color, fontSize: '24px', fontWeight: '700', margin: 0 }}>{s.value}</p>
                </div>
                <span style={{ fontSize: '28px' }}>{s.icon}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 חיפוש לפי שם / טלפון / מייל..."
            style={{ flex: 1, background: '#111827', border: '1px solid #1F2937', color: '#fff', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ background: '#111827', border: '1px solid #1F2937', color: '#9CA3AF', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
            <option value="all">כל הסטטוסים</option>
            {Object.entries(SL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div style={{ background: '#111827', borderRadius: '12px', border: '1px solid #1F2937', overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #1F2937' }}>
            <h2 style={{ margin: 0, fontSize: '15px', color: '#F59E0B' }}>📋 הזמנות ({filtered.length})</h2>
          </div>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>טוען...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>אין הזמנות</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0F172A' }}>
                  {['# שלנו', '# קיים', 'תאריך', 'לקוח', 'מוצרים', 'מחיר', 'עלות', 'רווח', 'מקור', 'סטטוס', 'פעולות'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', color: '#F59E0B', borderBottom: '1px solid #1F2937' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id} style={{ borderBottom: '1px solid #1F2937', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1F2937')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#F59E0B', fontWeight: '700' }}>#{formatOrderId(order.id)}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6B7280' }}>
                      {order.external_order_id ? '#' + order.external_order_id : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#9CA3AF' }}>{new Date(order.created_at).toLocaleDateString('he-IL')}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600' }}>{order.customer_name}</div>
                      <div style={{ fontSize: '11px', color: '#6B7280' }}>{order.customer_phone}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#9CA3AF', maxWidth: '150px' }}>
                      {(Array.isArray(order.items) ? order.items : []).map((item, idx) => (
                        <div key={idx}>{item.name || item.sourceProductId || 'מוצר'} ×{item.quantity || 1}</div>
                      ))}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#10B981', fontWeight: '600' }}>₪{Number(order.total_price).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#EF4444' }}>₪{Number(order.cost_price || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#F59E0B', fontWeight: '600' }}>₪{Number(order.profit || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#9CA3AF' }}>{sourceLabel(order.utm_source || order.source)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: SC[order.status] + '22', color: SC[order.status], padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', border: `1px solid ${SC[order.status]}44` }}>
                        {SL[order.status] || order.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button onClick={() => { setSelected(order); setView('detail'); }}
                        style={{ background: '#1F2937', border: '1px solid #F59E0B44', color: '#F59E0B', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                        👁 צפה
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
