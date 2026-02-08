import nodemailer from "nodemailer";

/**
 * Create a Nodemailer transporter from env vars.
 * For Gmail (free): SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=your@gmail.com, SMTP_PASS=App Password
 * For Outlook: smtp.office365.com, 587
 */
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return null;
  }
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export function isEmailConfigured(): boolean {
  return getTransporter() != null;
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return { ok: false, error: "SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS)" };
  }
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || "noreply@localhost";
  try {
    await transporter.sendMail({
      from: options.from || from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html != null ? options.html : options.text.replace(/\n/g, "<br>"),
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
