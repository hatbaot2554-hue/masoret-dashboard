'use client';
import { useEffect, useState } from 'react';

type Order = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string;
  total_price: number;
  status: string;
  payment_status: string;
  payment_method: string;
  notes: string;
  items: { name?: string; sourceProductId?: string; quantity?: number; price?: number }[];
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B', confirmed: '#3B82F6', shipped: '#8B5CF6', delivered: '#10B981', cancelled: '#EF4444',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין לטיפול', confirmed: 'אושר', shipped: 'נשלח', delivered: 'נמסר', cancelled: 'בוטל',
};

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);
  const [updating, setUpdating] = useState(false);
  const [view, setView] = useState<'list' | 'detail'>('list');

  const fetchOrders = () => {
    setLoading(true);
    fetch('/api/orders')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setOrders(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchOrders(); }, []);

  const updateStatus = async (id: string, newStatus: string) => {
    setUpdating(true);
    await fetch(`/api/orders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
    await fetchOrders();
    setUpdating(false);
    if (selected) setSelected(prev => prev ? { ...prev, status: newStatus } : null);
  };

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    revenue: orders.reduce((sum, o) => sum + Number(o.total_price), 0),
    delivered: orders.filter(o => o.status === 'delivered').length,
  };

  const pageStyle = { background: '#0A0E1A', color: '#fff', fontFamily: 'Heebo, sans-serif', minHeight: '100vh' };

  if (view === 'detail' && selected) return (
    <div dir="rtl" style={pageStyle}>
      <div style={{ background: '#111827', borderBottom: '1px solid #1F2937', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={() => { setView('list'); setSelected(null); }} style={{ background: '#1F2937', border: '1px solid #374151', color: '#9CA3AF', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>
          → חזור לרשימה
        </button>
        <h1 style={{ margin: 0, color: '#F59E0B', fontSize: '18px' }}>הזמנה #{selected.id.slice(-6).toUpperCase()}</h1>
        <span style={{ background: STATUS_COLORS[selected.status] + '22', color: STATUS_COLORS[selected.status], padding: '4px 12px', borderRadius: '20px', fontSize: '13px', border: `1px solid ${STATUS_COLORS[selected.status]}44` }}>
          {STATUS_LABELS[selected.status]}
        </span>
      </div>

      <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ background: '#111827', borderRadius: '12px', padding: '20px', border: '1px solid #1F2937' }}>
          <h3 style={{ color: '#F59E0B', marginTop: 0, fontSize: '15px' }}>👤 פרטי לקוח</h3>
          {([
            ['שם', selected.customer_name],
            ['טלפון', selected.customer_phone],
            ['אימייל', selected.customer_email],
            ['כתובת', selected.customer_address],
            ['תאריך', new Date(selected.created_at).toLocaleDateString('he-IL')],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1F2937' }}>
              <span style={{ color: '#6B7280', fontSize: '13px' }}>{k}</span>
              <span style={{ fontSize: '13px' }}>{v}</span>
            </div>
          ))}
          {selected.notes && <p style={{ color: '#9CA3AF', fontSize: '13px', marginTop: '12px' }}>הערות: {selected.notes}</p>}
        </div>

        <div style={{ background: '#111827', borderRadius: '12px', padding: '20px', border: '1px solid #1F2937' }}>
          <h3 style={{ color: '#F59E0B', marginTop: 0, fontSize: '15px' }}>💳 תשלום וסטטוס</h3>
          <div style={{ marginBottom: '16px' }}>
            <p style={{ color: '#6B7280', fontSize: '13px', margin: '0 0 4px' }}>סכום כולל</p>
            <p style={{ color: '#10B981', fontSize: '28px', fontWeight: '700', margin: 0 }}>₪{Number(selected.total_price).toLocaleString()}</p>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <p style={{ color: '#6B7280', fontSize: '13px', margin: '0 0 4px' }}>סטטוס תשלום</p>
            <p style={{ margin: 0 }}>{selected.payment_status === 'paid' ? '✅ שולם' : '⏳ ממתין לתשלום'}</p>
          </div>
          <p style={{ color: '#6B7280', fontSize: '13px', margin: '0 0 12px' }}>שנה סטטוס הזמנה:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <button key={key} onClick={() => updateStatus(selected.id, key)} disabled={updating}
                style={{ background: selected.status === key ? STATUS_COLORS[key] : '#1F2937', color: selected.status === key ? '#fff' : '#9CA3AF', border: `1px solid ${STATUS_COLORS[key]}66`, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
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
                {['מוצר', 'כמות', 'מחיר יחידה', 'סה"כ'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'right', fontSize: '12px', color: '#F59E0B' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(selected.items) ? selected.items : []).map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #1F2937' }}>
                  <td style={{ padding: '12px 16px', fontSize: '13px' }}>{item.name || item.sourceProductId || 'מוצר'}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#9CA3AF' }}>{item.quantity || 1}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#9CA3AF' }}>₪{item.price || 0}</td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#10B981' }}>₪{((item.price || 0) * (item.quantity || 1)).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div dir="rtl" style={pageStyle}>
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
            { label: 'ממתינות לטיפול', value: stats.pending, icon: '⏳', color: '#F59E0B' },
            { label: 'נמסרו', value: stats.delivered, icon: '✅', color: '#10B981' },
            { label: 'סה"כ הכנסות', value: `₪${stats.revenue.toLocaleString()}`, icon: '💰', color: '#10B981' },
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

        <div style={{ background: '#111827', borderRadius: '12px', border: '1px solid #1F2937', overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #1F2937' }}>
            <h2 style={{ margin: 0, fontSize: '15px', color: '#F59E0B' }}>📋 רשימת הזמנות ({orders.length})</h2>
          </div>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>טוען...</div>
          ) : orders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>אין הזמנות עדיין</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0F172A' }}>
                  {['#', 'תאריך', 'לקוח', 'טלפון', 'סכום', 'סטטוס', 'תשלום', 'פעולות'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', color: '#F59E0B', borderBottom: '1px solid #1F2937' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} style={{ borderBottom: '1px solid #1F2937', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1F2937')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6B7280' }}>#{order.id.slice(-6).toUpperCase()}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#9CA3AF' }}>{new Date(order.created_at).toLocaleDateString('he-IL')}</td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '600' }}>{order.customer_name}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#9CA3AF' }}>{order.customer_phone}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#10B981', fontWeight: '600' }}>₪{Number(order.total_price).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: STATUS_COLORS[order.status] + '22', color: STATUS_COLORS[order.status], padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', border: `1px solid ${STATUS_COLORS[order.status]}44` }}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px' }}>
                      {order.payment_status === 'paid' ? <span style={{ color: '#10B981' }}>✅ שולם</span> : <span style={{ color: '#F59E0B' }}>⏳ ממתין</span>}
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
