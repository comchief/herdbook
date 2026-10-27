/** Sends a transactional email through Resend's HTTP API. Configured by
 * environment variables, so no SDK or extra dependency is needed:
 *
 *   RESEND_API_KEY  required to actually send; when absent the message is
 *                   only logged to the server console (local development).
 *   RESEND_FROM     the From address, e.g. "Herdbook <no-reply@yourdomain>".
 *                   Defaults to Resend's shared sandbox sender, which can
 *                   only deliver to the Resend account owner's own address
 *                   until a sending domain is verified in Resend.
 *
 * Never throws: callers (the forgot-password flow) must behave identically
 * whether or not delivery worked, so a failure is logged and reported via
 * the return value only. */
export async function sendEmail(opts: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY not set — not sending "${opts.subject}" to ${opts.to}.\n${opts.text}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "Herdbook <onboarding@resend.dev>",
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      console.error(`[email] Resend rejected "${opts.subject}" to ${opts.to}: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[email] failed sending "${opts.subject}" to ${opts.to}:`, err);
    return false;
  }
}

/** Public base URL used in emailed links. Deliberately NOT derived from the
 * request's Host header — that header is attacker-controlled, and a reset
 * link built from it could point a victim at someone else's site. */
export function appBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return "http://localhost:3000";
}
