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
  items: any[];
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  confirmed: '#3B82F6',
  shipped: '#8B5CF6',
  delivered: '#10B981',
  cancelled: '#EF4444',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין',
  confirmed: 'אושר',
  shipped: 'נשלח',
  delivered: 'נמסר',
  cancelled: 'בוטל',
};

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [updating, setUpdating] = useState(false);

  const fetchOrders = () => {
    fetch('/api/orders')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setOrders(data); else setError(data.error); setLoading(false); })
      .catch(() => { setError('שגיאת רשת'); setLoading(false); });
  };

  useEffect(() => { fetchOrders(); }, []);

  const updateStatus = async (id: string, status: string) => {
    setUpdating(true);
    await fetch(`/api/orders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    await fetchOrders();
    setUpdating(false);
    setSelected(null);
  };

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    revenue: orders.reduce((s, o) => s + Number(o.total_price), 0),
  };

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: '#0A0E1A', color: '#fff', fontFamily: 'Heebo, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#111827', borderBottom: '1px solid #1F2937', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '28px' }}>📦</span>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#F59E0B', margin: 0 }}>המרכז למסורת יהודית</h1>
            <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>לוח בקרה</p>
          </div>
        </div>
        <button onClick={fetchOrders} style={{ background: '#1F2937', border: '1px solid #374151', color: '#9CA3AF', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
          🔄 רענן
        </button>
      </div>

      <div style={{ padding: '32px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
          {[
            { label: 'סה"כ הזמנות', value: stats.total, icon: '🛒', color: '#3B82F6' },
            { label: 'ממתינות לטיפול', value: stats.pending, icon: '⏳', color: '#F59E0B' },
            { label: 'סה"כ הכנסות', value: `₪${stats.revenue.toLocaleString()}`, icon: '💰', color: '#10B981' },
          ].map((s, i) => (
            <div key={i} style={{ background: '#111827', border: `1px solid ${s.color}33`, borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ color: '#6B7280', fontSize: '13px', margin: '0 0 8px' }}>{s.label}</p>
                  <p style={{ color: s.color, fontSize: '28px', fontWeight: '700', margin: 0 }}>{s.value}</p>
                </div>
                <span style={{ fontSize: '32px' }}>{s.icon}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: '#111827', borderRadius: '12px', border: '1px solid #1F2937', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #1F2937' }}>
            <h2 style={{ margin: 0, fontSize: '16px', color: '#F59E0B' }}>📋 רשימת הזמנות</h2>
          </div>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>טוען...</div>
          ) : error ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#EF4444' }}>שגיאה: {error}</div>
          ) : orders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>אין הזמנות עדיין</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0F172A' }}>
                  {['תאריך', 'שם לקוח', 'טלפון', 'סכום', 'סטטוס', 'תשלום', 'פעולות'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', color: '#F59E0B', fontWeight: '600', borderBottom: '1px solid #1F2937' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order, i) => (
                  <tr key={order.id} style={{ borderBottom: '1px solid #1F2937', background: i % 2 === 0 ? '#111827' : '#0F172A' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1F2937')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#111827' : '#0F172A')}>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#9CA3AF' }}>{new Date(order.created_at).toLocaleDateString('he-IL')}</td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: '600' }}>{order.customer_name}</td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#9CA3AF' }}>{order.customer_phone}</td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#10B981', fontWeight: '600' }}>₪{Number(order.total_price).toLocaleString()}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ background: STATUS_COLORS[order.status] + '22', color: STATUS_COLORS[order.status], padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', border: `1px solid ${STATUS_COLORS[order.status]}44` }}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '13px' }}>
                      {order.payment_status === 'paid' ? <span style={{ color: '#10B981' }}>✅ שולם</span> : <span style={{ color: '#F59E0B' }}>⏳ ממתין</span>}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <button onClick={() => setSelected(order)} style={{ background: '#1F2937', border: '1px solid #374151', color: '#F59E0B', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                        ✏️ עדכן
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#111827', borderRadius: '16px', padding: '32px', width: '400px', border: '1px solid #1F2937' }}>
            <h3 style={{ color: '#F59E0B', marginTop: 0 }}>עדכון הזמנה</h3>
            <p style={{ color: '#9CA3AF' }}>לקוח: {selected.customer_name}</p>
            <p style={{ color: '#9CA3AF' }}>טלפון: {selected.customer_phone}</p>
            <p style={{ color: '#9CA3AF', marginBottom: '20px' }}>כתובת: {selected.customer_address}</p>
            <p style={{ color: '#fff', marginBottom: '12px' }}>שנה סטטוס:</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <button key={key} onClick={() => updateStatus(selected.id, key)} disabled={updating}
                  style={{ background: selected.status === key ? STATUS_COLORS[key] : '#1F2937', color: selected.status === key ? '#fff' : '#9CA3AF', border: `1px solid ${STATUS_COLORS[key]}`, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={() => setSelected(null)} style={{ width: '100%', background: '#374151', color: '#9CA3AF', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer' }}>
              סגור
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
