'use client';
import { useEffect, useState } from 'react';

type Order = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  total_price: number;
  status: string;
  payment_status: string;
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500',
  confirmed: 'bg-blue-500',
  shipped: 'bg-purple-500',
  delivered: 'bg-green-500',
  cancelled: 'bg-red-500',
};

const statusLabels: Record<string, string> = {
  pending: 'ממתין',
  confirmed: 'אושר',
  shipped: 'נשלח',
  delivered: 'נמסר',
  cancelled: 'בוטל',
};

export default function Home() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/orders')
      .then(r => r.json())
      .then(data => { setOrders(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main dir="rtl" className="min-h-screen bg-gray-950 text-white p-8">
      <h1 className="text-3xl font-bold text-yellow-400 mb-6">
        📦 לוח בקרה — הזמנות
      </h1>
      {loading ? (
        <p className="text-gray-400">טוען הזמנות...</p>
      ) : orders.length === 0 ? (
        <p className="text-gray-400">אין הזמנות עדיין</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-800 text-yellow-400">
                <th className="p-3 text-right">תאריך</th>
                <th className="p-3 text-right">שם לקוח</th>
                <th className="p-3 text-right">טלפון</th>
                <th className="p-3 text-right">סכום</th>
                <th className="p-3 text-right">סטטוס</th>
                <th className="p-3 text-right">תשלום</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} className="border-b border-gray-800 hover:bg-gray-900">
                  <td className="p-3">{new Date(order.created_at).toLocaleDateString('he-IL')}</td>
                  <td className="p-3">{order.customer_name}</td>
                  <td className="p-3">{order.customer_phone}</td>
                  <td className="p-3">₪{order.total_price}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs ${statusColors[order.status]}`}>
                      {statusLabels[order.status]}
                    </span>
                  </td>
                  <td className="p-3">{order.payment_status === 'paid' ? '✅ שולם' : '⏳ טרם שולם'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}