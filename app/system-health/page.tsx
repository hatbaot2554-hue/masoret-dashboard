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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem("dashboard_token");
    if (!token) {
      setError("צריך להתחבר ללוח הבקרה לפני צפייה בבדיקות המערכת.");
      setLoading(false);
      return;
    }

    fetch("/api/system-health", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("לא ניתן לטעון את בדיקת המערכת.");
        }
        return response.json();
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "שגיאה לא ידועה"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <p style={styles.eyebrow}>ניהול</p>
        <h1 style={styles.title}>בדיקת חיבורים ומפתחות</h1>
        <p style={styles.subtitle}>
          כאן אפשר לראות אילו חיבורים זמינים בלוח הבקרה ואילו חיבורים נמצאים במערכות אחרות שצריך לבדוק בנפרד.
        </p>
      </section>

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
