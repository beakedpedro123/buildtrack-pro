import { Resend } from "resend";

// ── Email Configuration ──
// Uses Resend.com for simple email delivery. Only needs one API key.
const ADMIN_EMAIL = "ccc22@myyahoo.com";
const APP_NAME = "BuildTrack Pro";
const BASE_URL = "https://buildtrack-dnjxcthz.manus.space";

// Create Resend client — uses RESEND_API_KEY env var
function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not configured — emails will be logged to console only");
    return null;
  }
  return new Resend(apiKey);
}

// ── Send helper ──
async function sendEmail(opts: { to: string; subject: string; html: string }) {
  const resend = getResend();
  if (!resend) {
    console.log(`[email][dry-run] To: ${opts.to} | Subject: ${opts.subject}`);
    return;
  }
  try {
    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} <onboarding@resend.dev>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) {
      console.warn(`[email] Resend error sending to ${opts.to}:`, JSON.stringify(error));
    } else {
      console.log(`[email] Sent to ${opts.to}:`, data?.id);
    }
  } catch (e) {
    console.warn("[email] Failed to send:", e);
  }
}

// ── Email Templates ──

function ticketCreatedHTML(ticket: {
  id: number;
  subject: string;
  description: string;
  category: string;
  priority: string;
  customerName?: string;
  customerEmail?: string;
  companyId: number;
  trackingToken?: string;
}) {
  const priorityColors: Record<string, string> = {
    low: "#22C55E",
    medium: "#C8A84E",
    high: "#F59E0B",
    urgent: "#EF4444",
  };
  const color = priorityColors[ticket.priority] || "#C8A84E";
  const trackingLink = ticket.trackingToken
    ? `<div style="margin-top:20px;text-align:center">
        <a href="${BASE_URL}/api/web/ticket/${ticket.trackingToken}" style="display:inline-block;padding:12px 32px;background:#C8A84E;color:#0f1114;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Track Your Ticket</a>
        <p style="color:#687076;font-size:11px;margin-top:8px">Or copy this link: ${BASE_URL}/api/web/ticket/${ticket.trackingToken}</p>
      </div>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0f1114;font-family:'Inter',Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#1a1d21;border-radius:12px;overflow:hidden;border:1px solid #2a2d32">
      <!-- Header -->
      <div style="background:#C8A84E;padding:20px 24px;text-align:center">
        <h1 style="margin:0;color:#0f1114;font-size:20px;font-weight:700">${APP_NAME} — New Support Ticket</h1>
      </div>
      <!-- Body -->
      <div style="padding:24px">
        <div style="background:#0f1114;border-radius:8px;padding:16px;margin-bottom:16px">
          <p style="margin:0 0 8px;color:#9BA1A6;font-size:12px;text-transform:uppercase;letter-spacing:1px">Ticket #${ticket.id}</p>
          <h2 style="margin:0 0 12px;color:#ECEDEE;font-size:18px">${ticket.subject}</h2>
          <div style="display:inline-block;padding:4px 12px;border-radius:20px;background:${color}22;color:${color};font-size:12px;font-weight:600;text-transform:uppercase">${ticket.priority} priority</div>
          <div style="display:inline-block;padding:4px 12px;border-radius:20px;background:#C8A84E22;color:#C8A84E;font-size:12px;font-weight:600;margin-left:8px">${ticket.category.replace(/_/g, " ")}</div>
        </div>
        <div style="margin-bottom:16px">
          <p style="color:#9BA1A6;font-size:13px;margin:0 0 4px">Description:</p>
          <p style="color:#ECEDEE;font-size:14px;line-height:1.6;margin:0;background:#0f1114;padding:12px;border-radius:8px">${ticket.description}</p>
        </div>
        ${ticket.customerName ? `<p style="color:#9BA1A6;font-size:13px;margin:0 0 4px">From: <span style="color:#ECEDEE">${ticket.customerName}</span>${ticket.customerEmail ? ` (${ticket.customerEmail})` : ""}</p>` : ""}
        <p style="color:#9BA1A6;font-size:13px;margin:8px 0 0">Company ID: <span style="color:#ECEDEE">${ticket.companyId}</span></p>
        <div style="margin-top:24px;text-align:center">
          <a href="${BASE_URL}/api/web/admin" style="display:inline-block;padding:12px 32px;background:#C8A84E;color:#0f1114;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">View in Admin Dashboard</a>
        </div>
      </div>
    </div>
    <p style="text-align:center;color:#687076;font-size:11px;margin-top:16px">This is an automated notification from ${APP_NAME}</p>
  </div>
</body>
</html>`;
}

function ticketCreatedCustomerHTML(ticket: {
  id: number;
  subject: string;
  customerName?: string;
  trackingToken: string;
}) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0f1114;font-family:'Inter',Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#1a1d21;border-radius:12px;overflow:hidden;border:1px solid #2a2d32">
      <div style="background:#C8A84E;padding:20px 24px;text-align:center">
        <h1 style="margin:0;color:#0f1114;font-size:20px;font-weight:700">${APP_NAME} — Ticket Received</h1>
      </div>
      <div style="padding:24px">
        ${ticket.customerName ? `<p style="color:#ECEDEE;font-size:15px;margin:0 0 16px">Hi ${ticket.customerName},</p>` : ""}
        <p style="color:#ECEDEE;font-size:14px;line-height:1.6;margin:0 0 16px">We've received your support ticket <strong style="color:#C8A84E">#${ticket.id}</strong>: "${ticket.subject}". Our team will review it shortly.</p>
        <p style="color:#9BA1A6;font-size:14px;line-height:1.6;margin:0 0 24px">You can track the status of your ticket anytime using the link below — no login required:</p>
        <div style="text-align:center;margin-bottom:16px">
          <a href="${BASE_URL}/api/web/ticket/${ticket.trackingToken}" style="display:inline-block;padding:14px 36px;background:#C8A84E;color:#0f1114;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px">Track My Ticket</a>
        </div>
        <p style="color:#687076;font-size:11px;text-align:center;margin:0">Bookmark this link to check back anytime</p>
      </div>
    </div>
    <p style="text-align:center;color:#687076;font-size:11px;margin-top:16px">This is an automated notification from ${APP_NAME}</p>
  </div>
</body>
</html>`;
}

function ticketResolvedHTML(ticket: {
  id: number;
  subject: string;
  resolution: string;
  customerName?: string;
  trackingToken?: string;
}) {
  const trackingLink = ticket.trackingToken
    ? `<div style="margin-top:16px;text-align:center">
        <a href="${BASE_URL}/api/web/ticket/${ticket.trackingToken}" style="display:inline-block;padding:12px 32px;background:#C8A84E;color:#0f1114;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">View Full Ticket</a>
      </div>`
    : `<div style="margin-top:16px;text-align:center">
        <a href="${BASE_URL}/api/web/support" style="display:inline-block;padding:12px 32px;background:#C8A84E;color:#0f1114;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Visit Support Portal</a>
      </div>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0f1114;font-family:'Inter',Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#1a1d21;border-radius:12px;overflow:hidden;border:1px solid #2a2d32">
      <div style="background:#22C55E;padding:20px 24px;text-align:center">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">${APP_NAME} — Ticket Resolved ✓</h1>
      </div>
      <div style="padding:24px">
        <div style="background:#0f1114;border-radius:8px;padding:16px;margin-bottom:16px">
          <p style="margin:0 0 8px;color:#9BA1A6;font-size:12px;text-transform:uppercase;letter-spacing:1px">Ticket #${ticket.id}</p>
          <h2 style="margin:0;color:#ECEDEE;font-size:18px">${ticket.subject}</h2>
        </div>
        ${ticket.customerName ? `<p style="color:#9BA1A6;font-size:13px;margin:0 0 12px">Hi ${ticket.customerName},</p>` : ""}
        <p style="color:#ECEDEE;font-size:14px;line-height:1.6;margin:0 0 16px">Your support ticket has been resolved. Here's the resolution:</p>
        <div style="background:#22C55E11;border:1px solid #22C55E33;border-radius:8px;padding:16px;margin-bottom:16px">
          <p style="color:#4ADE80;font-size:13px;font-weight:600;margin:0 0 8px">Resolution:</p>
          <p style="color:#ECEDEE;font-size:14px;line-height:1.6;margin:0">${ticket.resolution}</p>
        </div>
        <p style="color:#9BA1A6;font-size:13px;margin:0">If you're still experiencing issues, please reply to this ticket or create a new one from the Support Portal.</p>
        ${trackingLink}
      </div>
    </div>
    <p style="text-align:center;color:#687076;font-size:11px;margin-top:16px">This is an automated notification from ${APP_NAME}</p>
  </div>
</body>
</html>`;
}

function ticketStatusUpdateHTML(ticket: {
  id: number;
  subject: string;
  status: string;
  customerName?: string;
  trackingToken?: string;
}) {
  const statusLabels: Record<string, string> = {
    open: "Open",
    in_progress: "In Progress",
    waiting_customer: "Waiting for Your Response",
    resolved: "Resolved",
    closed: "Closed",
  };
  const statusColors: Record<string, string> = {
    open: "#C8A84E",
    in_progress: "#3B82F6",
    waiting_customer: "#F59E0B",
    resolved: "#22C55E",
    closed: "#687076",
  };
  const label = statusLabels[ticket.status] || ticket.status;
  const color = statusColors[ticket.status] || "#C8A84E";
  const trackingLink = ticket.trackingToken
    ? `${BASE_URL}/api/web/ticket/${ticket.trackingToken}`
    : `${BASE_URL}/api/web/support`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0f1114;font-family:'Inter',Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#1a1d21;border-radius:12px;overflow:hidden;border:1px solid #2a2d32">
      <div style="background:${color};padding:20px 24px;text-align:center">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">${APP_NAME} — Ticket Update</h1>
      </div>
      <div style="padding:24px">
        <div style="background:#0f1114;border-radius:8px;padding:16px;margin-bottom:16px">
          <p style="margin:0 0 8px;color:#9BA1A6;font-size:12px;text-transform:uppercase;letter-spacing:1px">Ticket #${ticket.id}</p>
          <h2 style="margin:0 0 12px;color:#ECEDEE;font-size:18px">${ticket.subject}</h2>
          <div style="display:inline-block;padding:6px 16px;border-radius:20px;background:${color}22;color:${color};font-size:14px;font-weight:600">${label}</div>
        </div>
        ${ticket.customerName ? `<p style="color:#9BA1A6;font-size:13px;margin:0 0 12px">Hi ${ticket.customerName},</p>` : ""}
        <p style="color:#ECEDEE;font-size:14px;line-height:1.6;margin:0">Your ticket status has been updated to <strong style="color:${color}">${label}</strong>. Our team is working on your request.</p>
        <div style="margin-top:24px;text-align:center">
          <a href="${trackingLink}" style="display:inline-block;padding:12px 32px;background:#C8A84E;color:#0f1114;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Check Status</a>
        </div>
      </div>
    </div>
    <p style="text-align:center;color:#687076;font-size:11px;margin-top:16px">This is an automated notification from ${APP_NAME}</p>
  </div>
</body>
</html>`;
}

// ── Send Functions ──

export async function notifyTicketCreated(ticket: {
  id: number;
  subject: string;
  description: string;
  category: string;
  priority: string;
  customerName?: string;
  customerEmail?: string;
  companyId: number;
  trackingToken?: string;
}) {
  // Notify admin
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `[${ticket.priority.toUpperCase()}] New Ticket #${ticket.id}: ${ticket.subject}`,
    html: ticketCreatedHTML(ticket),
  });

  // Notify customer with tracking link
  if (ticket.customerEmail && ticket.trackingToken) {
    await sendEmail({
      to: ticket.customerEmail,
      subject: `Ticket #${ticket.id} Received: ${ticket.subject} — ${APP_NAME}`,
      html: ticketCreatedCustomerHTML({
        id: ticket.id,
        subject: ticket.subject,
        customerName: ticket.customerName,
        trackingToken: ticket.trackingToken,
      }),
    });
  }
}

export async function notifyTicketResolved(ticket: {
  id: number;
  subject: string;
  resolution: string;
  customerName?: string;
  customerEmail?: string;
  trackingToken?: string;
}) {
  // Notify customer
  if (ticket.customerEmail) {
    await sendEmail({
      to: ticket.customerEmail,
      subject: `Ticket #${ticket.id} Resolved: ${ticket.subject}`,
      html: ticketResolvedHTML(ticket),
    });
  }
  // Notify admin
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `✓ Ticket #${ticket.id} Resolved: ${ticket.subject}`,
    html: ticketResolvedHTML(ticket),
  });
}

export async function notifyTicketStatusUpdate(ticket: {
  id: number;
  subject: string;
  status: string;
  customerName?: string;
  customerEmail?: string;
  trackingToken?: string;
}) {
  // Notify customer
  if (ticket.customerEmail) {
    await sendEmail({
      to: ticket.customerEmail,
      subject: `Ticket #${ticket.id} Update: ${ticket.subject}`,
      html: ticketStatusUpdateHTML(ticket),
    });
  }
  // Notify admin
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `Ticket #${ticket.id} → ${ticket.status.replace(/_/g, " ").toUpperCase()}: ${ticket.subject}`,
    html: ticketStatusUpdateHTML(ticket),
  });
}

// ── Welcome Signup Email ──

export async function notifyWelcomeSignup(info: {
  ownerName: string;
  ownerEmail: string;
  companyName: string;
  slug: string;
  pin: string;
}) {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0f1114;font-family:'Inter',Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#1a1d21;border-radius:12px;overflow:hidden;border:1px solid #2a2d32">
      <div style="background:#C8A84E;padding:24px;text-align:center">
        <h1 style="margin:0;color:#0f1114;font-size:22px;font-weight:800">Welcome to ${APP_NAME}!</h1>
        <p style="margin:6px 0 0;color:#0f1114;opacity:0.7;font-size:13px">Your 14-day free trial is active</p>
      </div>
      <div style="padding:28px">
        <p style="color:#ECEDEE;font-size:15px;margin:0 0 20px">Hi ${info.ownerName},</p>
        <p style="color:#ECEDEE;font-size:14px;line-height:1.6;margin:0 0 20px">Your account for <strong style="color:#C8A84E">${info.companyName}</strong> is ready. Here's everything you need to log in:</p>
        
        <div style="background:#0f1114;border:1px solid #C8A84E;border-radius:12px;padding:20px;margin:0 0 20px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#9BA1A6;font-size:13px;width:120px">Company Code:</td><td style="padding:6px 0;color:#ECEDEE;font-size:15px;font-weight:700;letter-spacing:1px">${info.slug}</td></tr>
            <tr><td style="padding:6px 0;color:#9BA1A6;font-size:13px">Your Name:</td><td style="padding:6px 0;color:#ECEDEE;font-size:14px">${info.ownerName}</td></tr>
            <tr><td style="padding:6px 0;color:#9BA1A6;font-size:13px">Your PIN:</td><td style="padding:6px 0;color:#ECEDEE;font-size:15px;font-weight:700;letter-spacing:2px">${info.pin}</td></tr>
            <tr><td style="padding:6px 0;color:#9BA1A6;font-size:13px">Role:</td><td style="padding:6px 0;color:#C8A84E;font-size:14px;font-weight:600">Owner</td></tr>
          </table>
        </div>
        
        <p style="color:#9BA1A6;font-size:13px;margin:0 0 20px">Share the company code with your team members so they can join. You can add employees from the Team tab once logged in.</p>
        
        <div style="text-align:center;margin:24px 0">
          <a href="${BASE_URL}/api/portal/" style="display:inline-block;padding:14px 36px;background:#C8A84E;color:#0f1114;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">Log In Now →</a>
        </div>
        
        <p style="color:#687076;font-size:12px;text-align:center;margin:0">Keep this email safe — it contains your login credentials</p>
      </div>
    </div>
    <p style="text-align:center;color:#687076;font-size:11px;margin-top:16px">This is an automated notification from ${APP_NAME}</p>
  </div>
</body>
</html>`;

  await sendEmail({
    to: info.ownerEmail,
    subject: `Welcome to ${APP_NAME} — Your Login Details`,
    html,
  });

  // Also notify admin of new signup
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `🆕 New Signup: ${info.companyName} (${info.slug})`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0f1114;font-family:'Inter',Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#1a1d21;border-radius:12px;overflow:hidden;border:1px solid #2a2d32">
      <div style="background:#22C55E;padding:20px 24px;text-align:center">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">New Company Signup!</h1>
      </div>
      <div style="padding:24px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#9BA1A6;font-size:13px;width:120px">Company:</td><td style="padding:8px 0;color:#ECEDEE;font-size:14px;font-weight:600">${info.companyName}</td></tr>
          <tr><td style="padding:8px 0;color:#9BA1A6;font-size:13px">Slug:</td><td style="padding:8px 0;color:#C8A84E;font-size:14px;font-weight:700">${info.slug}</td></tr>
          <tr><td style="padding:8px 0;color:#9BA1A6;font-size:13px">Owner:</td><td style="padding:8px 0;color:#ECEDEE;font-size:14px">${info.ownerName}</td></tr>
          <tr><td style="padding:8px 0;color:#9BA1A6;font-size:13px">Email:</td><td style="padding:8px 0;color:#ECEDEE;font-size:14px">${info.ownerEmail}</td></tr>
        </table>
        <div style="margin-top:20px;text-align:center">
          <a href="${BASE_URL}/api/web/admin" style="display:inline-block;padding:12px 32px;background:#C8A84E;color:#0f1114;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">View in Admin Dashboard</a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`,
  });
}
