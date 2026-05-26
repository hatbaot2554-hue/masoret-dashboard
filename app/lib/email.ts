type EmailResult = { success: boolean; error?: string };

export function alertRecipients(): string[] {
  return (process.env.DASHBOARD_ALERT_EMAIL || process.env.ADMIN_EMAIL || process.env.OWNER_EMAIL || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function sendSystemEmail(to: string[], subject: string, html: string): Promise<EmailResult> {
  if (!to.length) return { success: false, error: "No alert recipients configured" };
  if (!process.env.RESEND_API_KEY) return { success: false, error: "RESEND_API_KEY is not configured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "מסורת <onboarding@resend.dev>",
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) return { success: false, error: `Resend returned ${response.status}` };
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Email send failed" };
  }
}
