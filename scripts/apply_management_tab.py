# -*- coding: utf-8 -*-
from pathlib import Path
import re

page_path = Path("app/page.tsx")
text = page_path.read_text(encoding="utf-8")

if "type HealthCheck" in text and "key: 'management'" in text:
    print("Management tab already present; nothing to do.")
    raise SystemExit(0)

admin_view_old = "type AdminView = 'dashboard' | 'orders' | 'products' | 'customers' | 'coupons' | 'reports' | 'graphs' | 'settings';"
admin_view_new = """type CheckStatus = 'ok' | 'missing' | 'warning' | 'error' | 'unknown';

type HealthCheck = {
  key: string;
  label: string;
  scope: string;
  status: CheckStatus;
  detail: string;
};

type HealthResponse = {
  generatedAt: string;
  safe: boolean;
  message: string;
  checks: HealthCheck[];
};

type AdminView = 'dashboard' | 'orders' | 'products' | 'customers' | 'coupons' | 'reports' | 'graphs' | 'settings' | 'management';"""
if admin_view_old not in text:
    raise RuntimeError("AdminView definition not found")
text = text.replace(admin_view_old, admin_view_new, 1)

nav_old = "  { key: 'settings', label: 'הגדרות' },"
nav_new = "  { key: 'settings', label: 'הגדרות' },\n  { key: 'management', label: 'ניהול' },"
if nav_old not in text:
    raise RuntimeError("Settings nav item not found")
text = text.replace(nav_old, nav_new, 1)

status_function = """function statusChipClass(status: string) {
  return `status-chip ${STATUSES.find((s) => s.key === status)?.chip || 'gray'}`;
}
"""
helpers = status_function + """
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
"""
if status_function not in text:
    raise RuntimeError("statusChipClass function not found")
text = text.replace(status_function, helpers, 1)

state_old = "  const [orderAction, setOrderAction] = useState('');\n"
state_new = state_old + """  const [systemHealth, setSystemHealth] = useState<HealthResponse | null>(null);
  const [systemHealthError, setSystemHealthError] = useState('');
  const [systemHealthLoading, setSystemHealthLoading] = useState(false);
"""
if state_old not in text:
    raise RuntimeError("orderAction state not found")
text = text.replace(state_old, state_new, 1)

orders_effect = """  useEffect(() => {
    if (authed) fetchOrders();
  }, [authed]);
"""
management_effect = orders_effect + """
  const normalizedRole = (currentUser?.role || '').trim().toLowerCase();
  const canManageSystem =
    currentUser?.username === 'admin' ||
    ['admin', 'owner', 'super_admin', 'מנהל', 'בעלים'].includes(normalizedRole);
  const visibleNavItems = NAV_ITEMS.filter((item) => item.key !== 'management' || canManageSystem);

  useEffect(() => {
    if (!authed || activeView !== 'management' || !canManageSystem) return;

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
  }, [activeView, authed, canManageSystem]);
"""
if orders_effect not in text:
    raise RuntimeError("orders effect not found")
text = text.replace(orders_effect, management_effect, 1)

text = text.replace("NAV_ITEMS.map((item) => (", "visibleNavItems.map((item) => (")
text = text.replace("className={item.key === 'orders' ? 'active' : ''}", "className={item.key === activeView ? 'active' : ''}")

management_block = """

          {activeView === 'management' && (
            canManageSystem ? (
              <section className="wp-panel admin-table-panel">
                <h3>ניהול מערכת</h3>
                <p>כאן מרוכזות בדיקות החיבורים והמפתחות של לוח הבקרה ואתר הלקוחות. הערכים עצמם לא מוצגים.</p>

                {systemHealthLoading && <p>טוען בדיקות מערכת...</p>}
                {systemHealthError && <div className="login-error">{systemHealthError}</div>}

                {systemHealth && (
                  <>
                    <div className="metric-grid">
                      <div><span>בדיקות</span><strong>{systemHealth.checks.length}</strong></div>
                      <div><span>פעיל</span><strong>{systemHealth.checks.filter((check) => check.status === 'ok').length}</strong></div>
                      <div><span>דורש טיפול</span><strong>{systemHealth.checks.filter((check) => ['missing', 'warning', 'error'].includes(check.status)).length}</strong></div>
                      <div><span>לא נבדק מכאן</span><strong>{systemHealth.checks.filter((check) => check.status === 'unknown').length}</strong></div>
                    </div>

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
"""
settings_pattern = re.compile(
    r"(\n\s*\{activeView === 'settings' && \(\n\s*<section className=\"wp-panel admin-placeholder\">.*?\n\s*</section>\n\s*\)\})",
    re.DOTALL,
)
match = settings_pattern.search(text)
if not match:
    raise RuntimeError("settings view block not found")
text = text[: match.end()] + management_block + text[match.end():]

page_path.write_text(text, encoding="utf-8")
print("Management tab patch applied.")
