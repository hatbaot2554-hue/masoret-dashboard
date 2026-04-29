'use client';
import { useEffect, useState } from 'react';

type OrderItem = {
  name?: string;
  sourceProductId?: string;
  sourceProductIndex?: number;
  quantity?: number;
  price?: number;
  cost?: number;
  options?: string;
};
type Order = {
  id: string; created_at: string; customer_name: string; customer_phone: string;
  customer_email: string; customer_address: string; total_price: number;
  cost_price: number; profit: number; status: string; payment_status: string;
  payment_method: string; notes: string; source: string; utm_source: string;
  items: OrderItem[]; external_order_id?: string;
};

type CurrentUser = { id: number; username: string; fullName: string; email: string; role: string };

const SC: Record<string, string> = { pending:'#F59E0B', confirmed:'#3B82F6', shipped:'#8B5CF6', delivered:'#10B981', cancelled:'#EF4444' };
const SL: Record<string, string> = { pending:'ממתין לטיפול', confirmed:'אושר', shipped:'נשלח', delivered:'נמסר', cancelled:'בוטל' };

const SITE_URL = 'https://masoret-website.vercel.app';

function formatOrderId(id: string) {
  const numeric = String(id).replace(/\D/g, '');
  return numeric.slice(-5).padStart(5, '0');
}

function getProductUrl(item: OrderItem): string {
  if (typeof item.sourceProductIndex === 'number') {
    return `${SITE_URL}/products/${item.sourceProductIndex}`;
  }
  const idAsNum = parseInt(String(item.sourceProductId || ''));
  if (!isNaN(idAsNum) && idAsNum >= 0 && idAsNum < 1000) {
    return `${SITE_URL}/products/${idAsNum}`;
  }
  if (item.name) {
    return `${SITE_URL}/products?search=${encodeURIComponent(item.name)}`;
  }
  return `${SITE_URL}/products`;
}

const sourceLabel = (s: string) => {
  if (!s || s === 'direct') return '🔗 ישיר';
  if (s.includes('google')) return '🔍 Google';
  if (s.includes('facebook') || s.includes('fb')) return '📘 Facebook';
  if (s.includes('instagram')) return '📸 Instagram';
  if (s.includes('whatsapp')) return '💬 WhatsApp';
  return `📣 ${s}`;
};

function EyeIcon({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} tabIndex={-1}
      style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '4px', display: 'flex', alignItems: 'center' }}>
      {visible ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      )}
    </button>
  );
}

function PasswordInput({ value, onChange, placeholder, disabled, onKeyDown, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder: string;
  disabled?: boolean; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void; autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative', marginBottom: '10px' }}>
      <input type={visible ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled} onKeyDown={onKeyDown} autoFocus={autoFocus}
        style={{ width: '100%', padding: '12px 40px 12px 12px', border: '1px solid #374151', background: '#0F172A', color: '#fff', fontSize: '14px', textAlign: 'right', outline: 'none', borderRadius: '8px', boxSizing: 'border-box', direction: 'rtl' }} />
      <EyeIcon visible={visible} onClick={() => setVisible(v => !v)} />
    </div>
  );
}

function TextInput({ value, onChange, placeholder, disabled, onKeyDown, type = 'text', autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder: string;
  disabled?: boolean; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void; type?: string; autoFocus?: boolean;
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      disabled={disabled} onKeyDown={onKeyDown} autoFocus={autoFocus}
      style={{ width: '100%', padding: '12px', border: '1px solid #374151', background: '#0F172A', color: '#fff', fontSize: '14px', textAlign: 'right', outline: 'none', borderRadius: '8px', boxSizing: 'border-box', direction: 'rtl', marginBottom: '10px' }} />
  );
}

type LoginScreen = 'login' | 'forgot_password_email' | 'forgot_password_code' | 'forgot_username';

export default function Dashboard() {
  const [authed, setAuthed] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loginScreen, setLoginScreen] = useState<LoginScreen>('login');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPwd, setForgotNewPwd] = useState('');
  const [forgotConfirmPwd, setForgotConfirmPwd] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotErr, setForgotErr] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const [showChangePwd, setShowChangePwd] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changeMsg, setChangeMsg] = useState('');
  const [changeErr, setChangeErr] = useState('');
  const [changeLoading, setChangeLoading] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);
  const [updating, setUpdating] = useState(false);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = sessionStorage.getItem('dashboard_token');
      const userJson = sessionStorage.getItem('dashboard_user');
      if (token && userJson) {
        try { setCurrentUser(JSON.parse(userJson)); setAuthed(true); }
        catch { sessionStorage.clear(); }
      }
    }
  }, []);

  const fetchOrders = () => {
    setLoading(true);
    fetch('/api/orders').then(r => r.json()).then(data => { if (Array.isArray(data)) setOrders(data); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { if (authed) fetchOrders(); }, [authed]);

  const handleLogin = async () => {
    if (!username || !password) { setLoginError('יש להזין שם משתמש וסיסמה'); return; }
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', username, password })
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem('dashboard_token', data.token);
        sessionStorage.setItem('dashboard_user', JSON.stringify(data.user));
        setCurrentUser(data.user);
        setAuthed(true);
        setUsername(''); setPassword('');
      } else {
        setLoginError(data.error || 'שגיאה בכניסה');
      }
    } catch { setLoginError('שגיאת חיבור לשרת'); }
    setLoginLoading(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('dashboard_token');
    sessionStorage.removeItem('dashboard_user');
    setCurrentUser(null);
    setAuthed(false);
  };

  const handleForgotPasswordSendCode = async () => {
    setForgotMsg(''); setForgotErr('');
    if (!forgotEmail) { setForgotErr('יש להזין מייל'); return; }
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'forgot_password_send_code', email: forgotEmail })
      });
      const data = await res.json();
      if (data.success) {
        setForgotMsg(data.message);
        setLoginScreen('forgot_password_code');
      } else { setForgotErr(data.error || 'שגיאה'); }
    } catch { setForgotErr('שגיאת חיבור'); }
    setForgotLoading(false);
  };

  const handleForgotPasswordVerify = async () => {
    setForgotMsg(''); setForgotErr('');
    if (!forgotCode || !forgotNewPwd || !forgotConfirmPwd) { setForgotErr('יש למלא את כל השדות'); return; }
    if (forgotNewPwd !== forgotConfirmPwd) { setForgotErr('הסיסמאות אינן תואמות'); return; }
    if (forgotNewPwd.length < 6) { setForgotErr('הסיסמה חייבת להיות לפחות 6 תווים'); return; }
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'forgot_password_verify', email: forgotEmail, code: forgotCode, newPassword: forgotNewPwd })
      });
      const data = await res.json();
      if (data.success) {
        setForgotMsg('✅ ' + data.message);
        setTimeout(() => {
          setLoginScreen('login');
          setForgotEmail(''); setForgotCode(''); setForgotNewPwd(''); setForgotConfirmPwd('');
          setForgotMsg(''); setForgotErr('');
        }, 2000);
      } else { setForgotErr(data.error || 'שגיאה'); }
    } catch { setForgotErr('שגיאת חיבור'); }
    setForgotLoading(false);
  };

  const handleForgotUsername = async () => {
    setForgotMsg(''); setForgotErr('');
    if (!forgotEmail) { setForgotErr('יש להזין מייל'); return; }
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'forgot_username', email: forgotEmail })
      });
      const data = await res.json();
      if (data.success) { setForgotMsg('✅ ' + data.message); }
      else { setForgotErr(data.error || 'שגיאה'); }
    } catch { setForgotErr('שגיאת חיבור'); }
    setForgotLoading(false);
  };

  const handleChangePwd = async () => {
    setChangeMsg(''); setChangeErr('');
    if (!currentPwd || !newPwd || !confirmPwd) { setChangeErr('יש למלא את כל השדות'); return; }
    if (newPwd !== confirmPwd) { setChangeErr('הסיסמאות אינן תואמות'); return; }
    if (newPwd.length < 6) { setChangeErr('הסיסמה חייבת להיות לפחות 6 תווים'); return; }
    setChangeLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_password', username: currentUser?.username, currentPassword: currentPwd, newPassword: newPwd })
      });
      const data = await res.json();
      if (data.success) {
        setChangeMsg('✅ הסיסמה שונתה בהצלחה!');
        setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
        setTimeout(() => { setShowChangePwd(false); setChangeMsg(''); }, 2000);
      } else { setChangeErr(data.error || 'שגיאה'); }
    } catch { setChangeErr('שגיאת חיבור'); }
    setChangeLoading(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    setUpdating(true);
    await fetch(`/api/orders`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: newStatus }) });
    await fetchOrders();
    setUpdating(false);
    setSelected(prev => prev ? { ...prev, status: newStatus } : null);
  };

  const filtered = orders.filter(o => {
    const matchSearch = o.customer_name?.includes(search) || o.customer_phone?.includes(search) || o.customer_email?.includes(search) || formatOrderId(o.id).includes(search);
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
  const modalOverlay: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' };
  const modalBox: React.CSSProperties = { background: '#111827', border: '1px solid #1F2937', borderRadius: '12px', padding: '28px', maxWidth: '420px', width: '100%' };
  const primaryBtn: React.CSSProperties = { padding: '12px 20px', background: '#F59E0B', color: '#0A0E1A', border: 'none', fontSize: '14px', cursor: 'pointer', borderRadius: '8px', fontWeight: 700 };
  const secondaryBtn: React.CSSProperties = { padding: '12px 20px', background: '#1F2937', color: '#9CA3AF', border: '1px solid #374151', fontSize: '14px', cursor: 'pointer', borderRadius: '8px' };

  if (!authed) {
    return (
      <div dir="rtl" style={{ ...PS, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: '420px', width: '100%', padding: '0 24px' }}>

          {loginScreen === 'login' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔐</div>
              <h2 style={{ fontFamily: 'serif', fontSize: '28px', marginBottom: '24px', color: '#F59E0B' }}>לוח בקרה</h2>

              <TextInput value={username} onChange={setUsername} placeholder="שם משתמש" disabled={loginLoading}
                onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} autoFocus />
              <PasswordInput value={password} onChange={setPassword} placeholder="סיסמה" disabled={loginLoading}
                onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} />

              {loginError && (
                <div style={{ background: '#7F1D1D33', border: '1px solid #EF444466', color: '#FCA5A5', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>
                  {loginError}
                </div>
              )}

              <button onClick={handleLogin} disabled={loginLoading}
                style={{ ...primaryBtn, width: '100%', padding: '14px', fontSize: '16px', opacity: loginLoading ? 0.6 : 1 }}>
                {loginLoading ? 'מתחבר...' : 'כניסה'}
              </button>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <button onClick={() => { setLoginScreen('forgot_password_email'); setForgotEmail(''); setForgotMsg(''); setForgotErr(''); }}
                  style={{ background: 'none', border: 'none', color: '#60A5FA', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                  שכחתי סיסמה
                </button>
                <button onClick={() => { setLoginScreen('forgot_username'); setForgotEmail(''); setForgotMsg(''); setForgotErr(''); }}
                  style={{ background: 'none', border: 'none', color: '#60A5FA', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                  שכחתי שם משתמש
                </button>
              </div>
            </div>
          )}

          {loginScreen === 'forgot_password_email' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '40px' }}>📧</div>
                <h2 style={{ color: '#F59E0B', fontSize: '22px', margin: '8px 0' }}>איפוס סיסמה</h2>
                <p style={{ color: '#9CA3AF', fontSize: '13px' }}>הזן את המייל הרשום במערכת</p>
              </div>

              <TextInput value={forgotEmail} onChange={setForgotEmail} placeholder="כתובת מייל" type="email"
                disabled={forgotLoading} autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleForgotPasswordSendCode(); }} />

              {forgotErr && <div style={{ background: '#7F1D1D33', border: '1px solid #EF444466', color: '#FCA5A5', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>{forgotErr}</div>}
              {forgotMsg && <div style={{ background: '#1E3A8A33', border: '1px solid #3B82F666', color: '#93C5FD', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>{forgotMsg}</div>}

              <button onClick={handleForgotPasswordSendCode} disabled={forgotLoading}
                style={{ ...primaryBtn, width: '100%', padding: '14px', fontSize: '16px' }}>
                {forgotLoading ? 'שולח...' : 'שלח קוד למייל'}
              </button>

              <button onClick={() => setLoginScreen('login')}
                style={{ ...secondaryBtn, width: '100%', marginTop: '8px' }}>חזרה לכניסה</button>
            </div>
          )}

          {loginScreen === 'forgot_password_code' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '40px' }}>🔑</div>
                <h2 style={{ color: '#F59E0B', fontSize: '22px', margin: '8px 0' }}>הזן קוד וסיסמה חדשה</h2>
                <p style={{ color: '#9CA3AF', fontSize: '13px' }}>הקוד נשלח ל-{forgotEmail}</p>
              </div>

              <TextInput value={forgotCode} onChange={setForgotCode} placeholder="קוד מהמייל (6 ספרות)" disabled={forgotLoading} autoFocus />
              <PasswordInput value={forgotNewPwd} onChange={setForgotNewPwd} placeholder="סיסמה חדשה (לפחות 6 תווים)" disabled={forgotLoading} />
              <PasswordInput value={forgotConfirmPwd} onChange={setForgotConfirmPwd} placeholder="אישור סיסמה חדשה" disabled={forgotLoading}
                onKeyDown={e => { if (e.key === 'Enter') handleForgotPasswordVerify(); }} />

              {forgotErr && <div style={{ background: '#7F1D1D33', border: '1px solid #EF444466', color: '#FCA5A5', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>{forgotErr}</div>}
              {forgotMsg && <div style={{ background: '#06402344', border: '1px solid #10B98166', color: '#6EE7B7', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>{forgotMsg}</div>}

              <button onClick={handleForgotPasswordVerify} disabled={forgotLoading}
                style={{ ...primaryBtn, width: '100%', padding: '14px', fontSize: '16px' }}>
                {forgotLoading ? 'מאמת...' : 'אפס סיסמה'}
              </button>

              <button onClick={() => setLoginScreen('forgot_password_email')}
                style={{ ...secondaryBtn, width: '100%', marginTop: '8px' }}>שלח קוד שוב</button>
            </div>
          )}

          {loginScreen === 'forgot_username' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '40px' }}>👤</div>
                <h2 style={{ color: '#F59E0B', fontSize: '22px', margin: '8px 0' }}>שכחתי שם משתמש</h2>
                <p style={{ color: '#9CA3AF', fontSize: '13px' }}>נשלח את שם המשתמש למייל הרשום</p>
              </div>

              <TextInput value={forgotEmail} onChange={setForgotEmail} placeholder="כתובת מייל" type="email"
                disabled={forgotLoading} autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleForgotUsername(); }} />

              {forgotErr && <div style={{ background: '#7F1D1D33', border: '1px solid #EF444466', color: '#FCA5A5', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>{forgotErr}</div>}
              {forgotMsg && <div style={{ background: '#06402344', border: '1px solid #10B98166', color: '#6EE7B7', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>{forgotMsg}</div>}

              <button onClick={handleForgotUsername} disabled={forgotLoading}
                style={{ ...primaryBtn, width: '100%', padding: '14px', fontSize: '16px' }}>
                {forgotLoading ? 'שולח...' : 'שלח שם משתמש למייל'}
              </button>

              <button onClick={() => setLoginScreen('login')}
                style={{ ...secondaryBtn, width: '100%', marginTop: '8px' }}>חזרה לכניסה</button>
            </div>
          )}

        </div>
      </div>
    );
  }

  if (view === 'detail' && selected) return (
    <div dir="rtl" style={PS}>
      <div style={{ background: '#111827', borderBottom: '1px solid #1F2937', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={() => { setView('list'); setSelected(null); }} style={{ background: '#1F2937', border: '1px solid #374151', color: '#9CA3AF', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>→ חזור</button>
        <h1 style={{ margin: 0, color: '#F59E0B', fontSize: '18px' }}>הזמנה #{formatOrderId(selected.id)}</h1>
        {selected.external_order_id && (<span style={{ color: '#6B7280', fontSize: '13px' }}>מס׳ באתר הקיים: #{selected.external_order_id}</span>)}
        <span style={{ background: SC[selected.status] + '22', color: SC[selected.status], padding: '4px 12px', borderRadius: '20px', fontSize: '13px', border: `1px solid ${SC[selected.status]}44` }}>{SL[selected.status]}</span>
        <span style={{ color: '#6B7280', fontSize: '13px', marginRight: 'auto' }}>{sourceLabel(selected.utm_source || selected.source)}</span>
      </div>
      <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ background: '#111827', borderRadius: '12px', padding: '20px', border: '1px solid #1F2937' }}>
          <h3 style={{ color: '#F59E0B', marginTop: 0, fontSize: '15px' }}>👤 פרטי לקוח</h3>
          {([['שם', selected.customer_name], ['טלפון', selected.customer_phone], ['אימייל', selected.customer_email], ['כתובת', selected.customer_address], ['תאריך', new Date(selected.created_at).toLocaleDateString('he-IL')], ['מקור', sourceLabel(selected.utm_source || selected.source)]] as [string,string][]).map(([k,v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1F2937' }}>
              <span style={{ color: '#6B7280', fontSize: '13px' }}>{k}</span><span style={{ fontSize: '13px' }}>{v}</span>
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
                <p style={{ color, fontSize: '18px', fontWeight: 700, margin: 0 }}>{val}</p>
              </div>
            ))}
          </div>
          <p style={{ color: '#6B7280', fontSize: '13px', margin: '0 0 10px' }}>שנה סטטוס:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {Object.entries(SL).map(([key, label]) => (
              <button key={key} onClick={() => updateStatus(selected.id, key)} disabled={updating}
                style={{ background: selected.status === key ? SC[key] : '#1F2937', color: selected.status === key ? '#fff' : '#9CA3AF', border: `1px solid ${SC[key]}66`, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ background: '#111827', borderRadius: '12px', padding: '20px', border: '1px solid #1F2937', gridColumn: '1 / -1' }}>
          <h3 style={{ color: '#F59E0B', marginTop: 0, fontSize: '15px' }}>📦 מוצרים</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#0F172A' }}>
              {['מוצר', 'אפשרויות', 'כמות', 'מחיר ללקוח', 'עלות', 'רווח'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'right', fontSize: '12px', color: '#F59E0B' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {(Array.isArray(selected.items) ? selected.items : []).map((item, idx) => {
                const qty = item.quantity || 1; const price = item.price || 0; const cost = item.cost || 0;
                const itemProfit = (price - cost) * qty;
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #1F2937' }}>
                    <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                      <a href={getProductUrl(item)} target="_blank" rel="noreferrer"
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
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#F59E0B', margin: 0 }}>המרכז למסורת יהודית</h1>
            <p style={{ fontSize: '11px', color: '#6B7280', margin: 0 }}>שלום, {currentUser?.fullName || currentUser?.username}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchOrders} style={{ background: '#1F2937', border: '1px solid #374151', color: '#9CA3AF', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>🔄 רענן</button>
          <button onClick={() => setShowChangePwd(true)} style={{ background: '#1F2937', border: '1px solid #374151', color: '#9CA3AF', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>🔑 שינוי סיסמה</button>
          <button onClick={handleLogout} style={{ background: '#1F2937', border: '1px solid #374151', color: '#9CA3AF', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>🔒 התנתק</button>
        </div>
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
                  <p style={{ color: s.color, fontSize: '24px', fontWeight: 700, margin: 0 }}>{s.value}</p>
                </div>
                <span style={{ fontSize: '28px' }}>{s.icon}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 חיפוש לפי שם / טלפון / מייל / מס' הזמנה..."
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
              <thead><tr style={{ background: '#0F172A' }}>
                {['# שלנו', '# קיים', 'תאריך', 'לקוח', 'מוצרים', 'מחיר', 'עלות', 'רווח', 'מקור', 'סטטוס', 'פעולות'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', color: '#F59E0B', borderBottom: '1px solid #1F2937' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id} style={{ borderBottom: '1px solid #1F2937', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#1F2937')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#F59E0B', fontWeight: 700 }}>#{formatOrderId(order.id)}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6B7280' }}>{order.external_order_id ? '#' + order.external_order_id : '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#9CA3AF' }}>{new Date(order.created_at).toLocaleDateString('he-IL')}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{order.customer_name}</div>
                      <div style={{ fontSize: '11px', color: '#6B7280' }}>{order.customer_phone}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#9CA3AF', maxWidth: '150px' }}>
                      {(Array.isArray(order.items) ? order.items : []).map((item, idx) => (
                        <div key={idx}>{item.name || item.sourceProductId || 'מוצר'} ×{item.quantity || 1}</div>
                      ))}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#10B981', fontWeight: 600 }}>₪{Number(order.total_price).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#EF4444' }}>₪{Number(order.cost_price || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#F59E0B', fontWeight: 600 }}>₪{Number(order.profit || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#9CA3AF' }}>{sourceLabel(order.utm_source || order.source)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: SC[order.status] + '22', color: SC[order.status], padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, border: `1px solid ${SC[order.status]}44` }}>
                        {SL[order.status] || order.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button onClick={() => { setSelected(order); setView('detail'); }}
                        style={{ background: '#1F2937', border: '1px solid #F59E0B44', color: '#F59E0B', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>👁 צפה</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showChangePwd && (
        <div style={modalOverlay} onClick={() => setShowChangePwd(false)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#F59E0B', marginTop: 0, marginBottom: '8px', fontSize: '18px' }}>🔑 שינוי סיסמה</h3>
            <p style={{ color: '#9CA3AF', fontSize: '13px', marginBottom: '16px' }}>הזן את הסיסמה הנוכחית והחדשה</p>

            <PasswordInput value={currentPwd} onChange={setCurrentPwd} placeholder="סיסמה נוכחית" disabled={changeLoading} />
            <PasswordInput value={newPwd} onChange={setNewPwd} placeholder="סיסמה חדשה (לפחות 6 תווים)" disabled={changeLoading} />
            <PasswordInput value={confirmPwd} onChange={setConfirmPwd} placeholder="אישור סיסמה חדשה" disabled={changeLoading} />

            {changeErr && <div style={{ background: '#7F1D1D33', border: '1px solid #EF444466', color: '#FCA5A5', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>{changeErr}</div>}
            {changeMsg && <div style={{ background: '#06402344', border: '1px solid #10B98166', color: '#6EE7B7', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>{changeMsg}</div>}

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button onClick={handleChangePwd} disabled={changeLoading} style={{ ...primaryBtn, flex: 1 }}>
                {changeLoading ? 'משנה...' : 'שנה סיסמה'}
              </button>
              <button onClick={() => { setShowChangePwd(false); setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); setChangeErr(''); setChangeMsg(''); }}
                style={{ ...secondaryBtn, flex: 1 }}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
