import nodemailer, { type Transporter } from 'nodemailer';
import type { Sender } from '../../db/schema.js';

/** One pooled SMTP transport per sender, reused across jobs in this process. */
const transports = new Map<string, Transporter>();

function transportFor(sender: Sender): Transporter {
  const key = `${sender.id}:${sender.smtpPass}`;
  let transport = transports.get(key);
  if (!transport) {
    transport = nodemailer.createTransport({
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: sender.smtpPort === 465,
      auth: { user: sender.smtpUser, pass: sender.smtpPass },
      pool: true,
      maxConnections: 2,
      // Fail fast instead of nodemailer's 2 minute defaults; BullMQ retries with backoff.
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    transports.set(key, transport);
  }
  return transport;
}

export interface OutgoingEmail {
  /** Stable id used to build the Message-ID header, so a resend would be recognisable. */
  emailId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments: { filename: string; contentType: string; content: Buffer }[];
}

export async function sendEmail(sender: Sender, email: OutgoingEmail) {
  const info = await transportFor(sender).sendMail({
    from: { name: sender.name, address: sender.email },
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6">${email.html}</div>`,
    attachments: email.attachments,
    messageId: `<${email.emailId}@patrika.local>`,
    headers: { 'X-Patrika-Email-Id': email.emailId },
  });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  return { messageId: info.messageId, previewUrl: previewUrl || null };
}

export function closeTransports() {
  for (const t of transports.values()) t.close();
  transports.clear();
}
