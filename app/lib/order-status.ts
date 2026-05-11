export type InternalOrderStatus =
  | 'pending'
  | 'needs_care'
  | 'ai_ready_for_source_submit'
  | 'source_submit_in_progress'
  | 'source_submitted'
  | 'source_waiting_payment'
  | 'warehouse_processing'
  | 'warehouse_backorder'
  | 'supplier_to_customer_warehouse'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'source_sync_error'
  | 'not_paid';

export type OrderStatusSyncInput = {
  currentStatus?: string | null;
  autoSubmitted?: boolean | null;
  externalOrderId?: string | null;
  checkoutUrl?: string | null;
  sourceStatus?: string | null;
};

const SOURCE_STATUS_MAP: Record<string, InternalOrderStatus> = {
  pending: 'source_submitted',
  processing: 'warehouse_processing',
  on_hold: 'source_waiting_payment',
  'on-hold': 'source_waiting_payment',
  awaiting_payment: 'source_waiting_payment',
  paid: 'confirmed',
  completed: 'delivered',
  shipped: 'shipped',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  refunded: 'cancelled',
  failed: 'source_sync_error',
  ממתין: 'source_submitted',
  בטיפול: 'warehouse_processing',
  שולם: 'confirmed',
  נשלח: 'shipped',
  הושלם: 'delivered',
  בוטל: 'cancelled',
};

export function normalizeSourceStatus(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '_');
}

export function mapSourceStatusToInternal(sourceStatus?: string | null): InternalOrderStatus | null {
  const normalized = normalizeSourceStatus(sourceStatus);
  if (!normalized) return null;
  return SOURCE_STATUS_MAP[normalized] || null;
}

export function nextLocalOrderStatus(input: OrderStatusSyncInput): InternalOrderStatus {
  const sourceMapped = mapSourceStatusToInternal(input.sourceStatus);
  if (sourceMapped) return sourceMapped;

  const current = String(input.currentStatus || 'pending') as InternalOrderStatus;

  if (input.externalOrderId) {
    if (input.checkoutUrl && current !== 'confirmed' && current !== 'shipped' && current !== 'delivered') {
      return 'source_waiting_payment';
    }
    return 'source_submitted';
  }

  if (current === 'ai_ready_for_source_submit') return 'source_submit_in_progress';
  if (current === 'source_submit_in_progress') return 'source_submit_in_progress';
  if (current === 'cancelled') return 'cancelled';
  return current || 'pending';
}

export function statusSyncNote(nextStatus: string, sourceStatus?: string | null): string {
  if (sourceStatus) return `סנכרון סטטוס מהאתר המקורי: ${sourceStatus} -> ${nextStatus}`;
  return `עדכון סטטוס אוטומטי לפי שלב ההזמנה אצלנו: ${nextStatus}`;
}
