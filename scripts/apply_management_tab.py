# -*- coding: utf-8 -*-
from pathlib import Path

page_path = Path("app/page.tsx")
text = page_path.read_text(encoding="utf-8")

parse_notes = """function parseAdminNotes(notes: Order['admin_notes']): AdminNote[] {
  if (Array.isArray(notes)) return notes;
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
"""
helpers = parse_notes + """
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
"""
if "function isAiSafeOrder" not in text:
    if parse_notes not in text:
        raise RuntimeError("parseAdminNotes block not found")
    text = text.replace(parse_notes, helpers, 1)

update_status = """  async function updateStatus(id: string, status: string) {
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
"""
order_patch_helpers = update_status + """
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
        ? 'הזמנת AI זמנית אושרה לטיפול ידני. עדיין לא נשלחה לאתר המקורי.'
        : 'הזמנת AI זמנית בוטלה על ידי מנהל.',
      createdAt: new Date().toISOString(),
    };
    await patchOrder(order.id, {
      status: decision === 'approve' ? 'needs_care' : 'cancelled',
      admin_notes: [note, ...parseAdminNotes(order.admin_notes)],
    });
  }
"""
if "async function decideAiDraftOrder" not in text:
    if update_status not in text:
        raise RuntimeError("updateStatus block not found")
    text = text.replace(update_status, order_patch_helpers, 1)

customer_stats = """  const customerStats = useMemo(() => {
    const revenue = orders.reduce((sum, order) => sum + Number(order.total_price || 0), 0);"""
ai_memos = """  const aiDraftOrders = useMemo(() => orders.filter(isAiDraftOrder), [orders]);
  const aiSafeOrders = useMemo(() => orders.filter(isAiSafeOrder), [orders]);

""" + customer_stats
if "const aiDraftOrders = useMemo" not in text:
    if customer_stats not in text:
        raise RuntimeError("customerStats block not found")
    text = text.replace(customer_stats, ai_memos, 1)

management_metrics = """                    <div className="metric-grid">
                      <div><span>בדיקות</span><strong>{systemHealth.checks.length}</strong></div>
                      <div><span>פעיל</span><strong>{systemHealth.checks.filter((check) => check.status === 'ok').length}</strong></div>
                      <div><span>דורש טיפול</span><strong>{systemHealth.checks.filter((check) => ['missing', 'warning', 'error'].includes(check.status)).length}</strong></div>
                      <div><span>לא נבדק מכאן</span><strong>{systemHealth.checks.filter((check) => check.status === 'unknown').length}</strong></div>
                    </div>

"""
ai_management = """                    <div className="metric-grid">
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

"""
if "הזמנות AI זמניות" not in text:
    if management_metrics not in text:
        raise RuntimeError("management metrics block not found")
    text = text.replace(management_metrics, ai_management, 1)

order_cell = """                      <button className="order-link" type="button" onClick={() => setSelected(order)}>
                        #{formatOrderId(order.id)} {order.customer_name || 'לקוח'}
                      </button>
                      <small>{items.slice(0, 2).map((item) => item.name).join(', ')}</small>"""
order_cell_new = """                      <button className="order-link" type="button" onClick={() => setSelected(order)}>
                        #{formatOrderId(order.id)} {order.customer_name || 'לקוח'}
                      </button>
                      {isAiSafeOrder(order) && <span className="ai-order-badge">הזמנת AI זמנית</span>}
                      <small>{items.slice(0, 2).map((item) => item.name).join(', ')}</small>"""
if "ai-order-badge" not in text:
    if order_cell not in text:
        raise RuntimeError("order cell block not found")
    text = text.replace(order_cell, order_cell_new, 1)

side_card = """              <section className="wp-panel">
                <h3>דאטה לוג׳יקס</h3>"""
ai_panel = """              {isAiSafeOrder(selected) && (
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

""" + side_card
if "ai-safe-panel" not in text:
    if side_card not in text:
        raise RuntimeError("side card block not found")
    text = text.replace(side_card, ai_panel, 1)

page_path.write_text(text, encoding="utf-8")
print("AI draft order management patch applied.")
