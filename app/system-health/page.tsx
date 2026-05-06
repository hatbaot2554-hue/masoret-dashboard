"use client";

import { useEffect, useState } from "react";

type CheckStatus = "ok" | "missing" | "warning" | "error" | "unknown";

type HealthCheck = {
  key: string;
  label: string;
  scope: string;
  status: CheckStatus;
  detail: string;
};

type HealthResponse = {
  generatedAt: string;
  message: string;
  checks: HealthCheck[];
};

const statusText: Record<CheckStatus, string> = {
  ok: "פעיל",
  missing: "חסר",
  warning: "דורש בדיקה",
  error: "שגיאה",
  unknown: "לא נבדק מכאן",
};

const statusColor: Record<CheckStatus, string> = {
  ok: "#0f7a3a",
  missing: "#b42318",
  warning: "#a15c07",
  error: "#b42318",
  unknown: "#475467",
};

const statusBackground: Record<CheckStatus, string> = {
  ok: "#ecfdf3",
  missing: "#fef3f2",
  warning: "#fffaeb",
  error: "#fef3f2",
  unknown: "#f2f4f7",
};

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);

  function loadHealth(authToken: string) {
    setLoading(true);
    setError("");
    fetch("/api/system-health", {
      headers: { Authorization: `Bearer ${authToken}` },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || "לא ניתן לטעון את בדיקת המערכת.");
        }
        return response.json();
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "שגיאה לא ידועה"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const savedToken = sessionStorage.getItem("dashboard_token");
    if (savedToken) {
      setToken(savedToken);
      loadHealth(savedToken);
    }
  }, []);

  async function login() {
    if (!username || !password) {
      setError("יש להזין שם משתמש וסיסמה");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", username, password }),
      });
      const result = await response.json();
      if (!result.success || !result.token) {
        setError(result.error || "הכניסה נכשלה");
        return;
      }
      sessionStorage.setItem("dashboard_token", result.token);
      sessionStorage.setItem("dashboard_user", JSON.stringify(result.user));
      setToken(result.token);
      loadHealth(result.token);
    } catch {
      setError("שגיאת חיבור לשרת");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <p style={styles.eyebrow}>ניהול</p>
        <h1 style={styles.title}>בדיקת חיבורים ומפתחות</h1>
        <p style={styles.subtitle}>
          אזור פרטי לבעלים או למנהל מערכת. הבדיקה לא מציגה ערכי מפתחות, רק מצב כללי.
        </p>
      </section>

      {!token && (
        <section style={styles.loginBox}>
          <h2 style={styles.loginTitle}>כניסה לאזור הבדיקות</h2>
          <input style={styles.input} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="שם משתמש" />
          <input
            style={styles.input}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="סיסמה"
            type="password"
            onKeyDown={(event) => {
              if (event.key === "Enter") login();
            }}
          />
          <button style={styles.button} type="button" onClick={login} disabled={loading}>
            {loading ? "מתחבר..." : "כניסה"}
          </button>
        </section>
      )}

      {loading && <div style={styles.notice}>טוען בדיקה...</div>}
      {error && <div style={{ ...styles.notice, ...styles.error }}>{error}</div>}

      {data && (
        <>
          <div style={styles.notice}>{data.message}</div>
          <section style={styles.grid}>
            {data.checks.map((check) => (
              <article key={check.key} style={styles.card}>
                <div style={styles.cardTop}>
                  <div>
                    <p style={styles.scope}>{check.scope}</p>
                    <h2 style={styles.cardTitle}>{check.label}</h2>
                  </div>
                  <span
                    style={{
                      ...styles.badge,
                      color: statusColor[check.status],
                      background: statusBackground[check.status],
                    }}
                  >
                    {statusText[check.status]}
                  </span>
                </div>
                <p style={styles.detail}>{check.detail}</p>
                <p style={styles.key}>{check.key}</p>
              </article>
            ))}
          </section>
          <p style={styles.footer}>עודכן לאחרונה: {new Date(data.generatedAt).toLocaleString("he-IL")}</p>
        </>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "48px 24px",
    background: "#f8fafc",
    color: "#111827",
    fontFamily: "Arial, sans-serif",
  },
  header: {
    maxWidth: 1040,
    margin: "0 auto 24px",
  },
  eyebrow: {
    margin: 0,
    color: "#667085",
    fontSize: 14,
    fontWeight: 700,
  },
  title: {
    margin: "8px 0",
    fontSize: 34,
    lineHeight: 1.2,
  },
  subtitle: {
    margin: 0,
    maxWidth: 760,
    color: "#475467",
    fontSize: 17,
    lineHeight: 1.65,
  },
  loginBox: {
    maxWidth: 420,
    margin: "0 auto 20px",
    padding: 20,
    border: "1px solid #d0d5dd",
    borderRadius: 8,
    background: "#ffffff",
    display: "grid",
    gap: 12,
  },
  loginTitle: {
    margin: 0,
    fontSize: 22,
  },
  input: {
    border: "1px solid #d0d5dd",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 16,
  },
  button: {
    border: 0,
    borderRadius: 8,
    padding: "12px 14px",
    background: "#111827",
    color: "white",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  notice: {
    maxWidth: 1040,
    margin: "0 auto 20px",
    padding: "14px 16px",
    border: "1px solid #d0d5dd",
    borderRadius: 8,
    background: "#ffffff",
    color: "#344054",
  },
  error: {
    borderColor: "#fecdca",
    background: "#fef3f2",
    color: "#b42318",
  },
  grid: {
    maxWidth: 1040,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
  },
  card: {
    minHeight: 180,
    border: "1px solid #d0d5dd",
    borderRadius: 8,
    padding: 18,
    background: "#ffffff",
    boxShadow: "0 1px 2px rgba(16, 24, 40, 0.05)",
  },
  cardTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  scope: {
    margin: 0,
    color: "#667085",
    fontSize: 13,
  },
  cardTitle: {
    margin: "6px 0 0",
    fontSize: 20,
  },
  badge: {
    flexShrink: 0,
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 13,
    fontWeight: 700,
  },
  detail: {
    margin: "18px 0 0",
    color: "#344054",
    lineHeight: 1.6,
  },
  key: {
    margin: "16px 0 0",
    color: "#98a2b3",
    fontSize: 12,
    direction: "ltr",
    textAlign: "left",
  },
  footer: {
    maxWidth: 1040,
    margin: "20px auto 0",
    color: "#667085",
    fontSize: 13,
  },
};
