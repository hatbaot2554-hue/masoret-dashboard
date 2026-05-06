# -*- coding: utf-8 -*-
from pathlib import Path

page_path = Path("app/page.tsx")
text = page_path.read_text(encoding="utf-8")

if "type HealthCheck" in text and "key: 'management'" in text:
    print("Management tab already present; nothing to do.")
    raise SystemExit(0)

replacements = [
    (
        "type AdminView = 'overview' | 'orders' | 'customers' | 'products' | 'reports' | 'settings';",
        "type CheckStatus = 'ok' | 'missing' | 'warning' | 'unknown';\n"
        "\n"
        "type HealthCheck = {\n"
        "  key: string;\n"
        "  label: string;\n"
        "  group: string;\n"
        "  status: CheckStatus;\n"
        "  message: string;\n"
        "};\n"
        "\n"
        "type HealthResponse = {\n"
        "  ok: boolean;\n"
        "  checkedAt: string;\n"
        "  checks: HealthCheck[];\n"
        "};\n"
        "\n"
        "type AdminView = 'overview' | 'orders' | 'customers' | 'products' | 'reports' | 'settings' | 'management';",
    ),
    (
        "  { key: 'settings', label: 'הגדרות' },",
        "  { key: 'settings', label: 'הגדרות' },\n  { key: 'management', label: 'ניהול' },",
    ),
]

for old, new in replacements:
    if old not in text:
        raise RuntimeError(f"Expected text not found: {old[:80]}")
    text = text.replace(old, new, 1)

old = """function statusChipClass(status: OrderStatus) {
  switch (status) {
    case 'completed':
      return 'status-chip completed';
    case 'cancelled':
      return 'status-chip cancelled';
    case 'processing':
      return 'status-chip processing';
    default:
      return 'status-chip pending';
  }
}
"""
new = old + """
function systemStatusLabel(status: CheckStatus) {
  switch (status) {
    case 'ok':
      return 'פעיל';
    case 'missing':
      return 'חסר';
    case 'warning':
      return 'דורש בדיקה';
    default:
      return 'לא נבדק מכאן';
  }
}

function systemStatusClass(status: CheckStatus) {
  switch (status) {
    case 'ok':
      return 'status-chip completed';
    case 'missing':
      return 'status-chip cancelled';
    case 'warning':
      return 'status-chip processing';
    default:
      return 'status-chip pending';
  }
}
"""
if old not in text:
    raise RuntimeError("statusChipClass block not found")
text = text.replace(old, new, 1)

old = """  const [settingsMessage, setSettingsMessage] = useState('');
  const [orderAction, setOrderAction] = useState<string | null>(null);
"""
new = old + """  const [systemHealth, setSystemHealth] = useState<HealthResponse | null>(null);
  const [systemHealthError, setSystemHealthError] = useState('');
  const [systemHealthLoading, setSystemHealthLoading] = useState(false);
"""
if old not in text:
    raise RuntimeError("state block not found")
text = text.replace(old, new, 1)

old = """  useEffect(() => {
    if (authed) fetchOrders();
  }, [authed]);
"""
new = old + """
  const normalizedRole = (currentUser?.role || '').trim().toLowerCase();
  const canManageSystem =
    currentUser?.username === 'admin' ||
    ['admin', 'owner', 'super_admin', 'מנהל', 'בעלים'].includes(normalizedRole);
  const visibleNavItems = NAV_ITEMS.filter((item) => item.key !== 'management' || canManageSystem);

  useEffect(() => {
    if (!authed || activeView !== 'management' || !canManageSystem) return;

    setSystemHealthLoading(true);
    setSystemHealthError('');
    fetch('/api/system-health', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'לא ניתן לטעון את בדיקות המערכת.');
        setSystemHealth(data);
      })
      .catch((error) => setSystemHealthError(error.message || 'לא ניתן לטעון את בדיקות המערכת.'))
      .finally(() => setSystemHealthLoading(false));
  }, [activeView, authed, canManageSystem, token]);
"""
if old not in text:
    raise RuntimeError("orders effect block not found")
text = text.replace(old, new, 1)

text = text.replace("NAV_ITEMS.map((item) => (", "visibleNavItems.map((item) => (")

old = """              {activeView === 'settings' && (
                <section className="wp-panel admin-table-panel">
                  <h3>הגדרות מערכת</h3>
                  <p>הגדרות החיבור נשמרות כמשתני סביבה מאובטחים בפרויקט.</p>
                  <div className="settings-grid">
                    <div>
                      <span>חיבור למסד נתונים</span>
                      <strong>{currentSettings.databaseConnected ? 'פעיל' : 'לא פעיל'}</strong>
                    </div>
                    <div>
                      <span>כתובת אתר הלקוחות</span>
                      <strong>{currentSettings.siteUrl}</strong>
                    </div>
                    <div>
                      <span>מצב אוטומציות</span>
                      <strong>{currentSettings.automationMode}</strong>
                    </div>
                    <div>
                      <span>ספק AI</span>
                      <strong>{currentSettings.aiProvider}</strong>
                    </div>
                  </div>
                  {settingsMessage && <div className="login-error success-message">{settingsMessage}</div>}
                </section>
              )}
"""
new = old + """
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
                          <div className="metric-card">
                            <span>בדיקות תקינות</span>
                            <strong>{systemHealth.checks.filter((check) => check.status === 'ok').length}</strong>
                          </div>
                          <div className="metric-card">
                            <span>דורשות טיפול</span>
                            <strong>{systemHealth.checks.filter((check) => check.status === 'missing' || check.status === 'warning').length}</strong>
                          </div>
                          <div className="metric-card">
                            <span>עודכן לאחרונה</span>
                            <strong>{new Date(systemHealth.checkedAt).toLocaleString('he-IL')}</strong>
                          </div>
                        </div>
                        <table className="simple-admin-table">
                          <thead>
                            <tr>
                              <th>בדיקה</th>
                              <th>מערכת</th>
                              <th>מצב</th>
                              <th>פירוט</th>
                            </tr>
                          </thead>
                          <tbody>
                            {systemHealth.checks.map((check) => (
                              <tr key={check.key}>
                                <td>{check.label}</td>
                                <td>{check.group}</td>
                                <td><span className={systemStatusClass(check.status)}>{systemStatusLabel(check.status)}</span></td>
                                <td>{check.message}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
if old not in text:
    raise RuntimeError("settings block not found")
text = text.replace(old, new, 1)

page_path.write_text(text, encoding="utf-8")
print("Management tab patch applied.")
