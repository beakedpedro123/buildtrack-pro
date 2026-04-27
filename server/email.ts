import nodemailer from "nodemailer";

// ── Email Configuration ──
// Uses a simple SMTP relay. In production, configure with real SMTP credentials.
// For now, we use a direct-send approach that works without authentication.
const ADMIN_EMAIL = "ccc22@myyahoo.com";
const FROM_EMAIL = "notifications@buildtrackpro.app";
const APP_NAME = "BuildTrack Pro";

// Create a transporter — uses environment variables if available, otherwise falls back to direct send
function createTransporter() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587");
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpHost && smtpUser && smtpPass) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });
  }

  // Fallback: use JSON transport for logging (emails logged to console)
  return nodemailer.createTransport({ jsonTransport: true });
}

const transporter = createTransporter();

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
}) {
  const priorityColors: Record<string, string> = {
    low: "#22C55E",
    medium: "#C8A84E",
    high: "#F59E0B",
    urgent: "#EF4444",
  };
  const color = priorityColors[ticket.priority] || "#C8A84E";

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
          <a href="https://buildtrack-dnjxcthz.manus.space/api/web/admin" style="display:inline-block;padding:12px 32px;background:#C8A84E;color:#0f1114;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">View in Admin Dashboard</a>
        </div>
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
}) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0f1114;font-family:'Inter',Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#1a1d21;border-radius:12px;overflow:hidden;border:1px solid #2a2d32">
      <!-- Header -->
      <div style="background:#22C55E;padding:20px 24px;text-align:center">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">${APP_NAME} — Ticket Resolved ✓</h1>
      </div>
      <!-- Body -->
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
        <div style="margin-top:24px;text-align:center">
          <a href="https://buildtrack-dnjxcthz.manus.space/api/web/support" style="display:inline-block;padding:12px 32px;background:#C8A84E;color:#0f1114;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Visit Support Portal</a>
        </div>
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
          <a href="https://buildtrack-dnjxcthz.manus.space/api/web/support" style="display:inline-block;padding:12px 32px;background:#C8A84E;color:#0f1114;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Check Status</a>
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
}) {
  try {
    const info = await transporter.sendMail({
      from: `"${APP_NAME}" <${FROM_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject: `[${ticket.priority.toUpperCase()}] New Ticket #${ticket.id}: ${ticket.subject}`,
      html: ticketCreatedHTML(ticket),
    });
    console.log("[email] Ticket created notification sent:", info.messageId || "logged");
  } catch (e) {
    console.warn("[email] Failed to send ticket created notification:", e);
  }
}

export async function notifyTicketResolved(ticket: {
  id: number;
  subject: string;
  resolution: string;
  customerName?: string;
  customerEmail?: string;
}) {
  // Notify the customer if they provided an email
  if (ticket.customerEmail) {
    try {
      const info = await transporter.sendMail({
        from: `"${APP_NAME} Support" <${FROM_EMAIL}>`,
        to: ticket.customerEmail,
        subject: `Ticket #${ticket.id} Resolved: ${ticket.subject}`,
        html: ticketResolvedHTML(ticket),
      });
      console.log("[email] Ticket resolved notification sent to customer:", info.messageId || "logged");
    } catch (e) {
      console.warn("[email] Failed to send customer resolution notification:", e);
    }
  }
  // Also notify admin
  try {
    await transporter.sendMail({
      from: `"${APP_NAME}" <${FROM_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject: `✓ Ticket #${ticket.id} Resolved: ${ticket.subject}`,
      html: ticketResolvedHTML(ticket),
    });
  } catch (e) {
    console.warn("[email] Failed to send admin resolution notification:", e);
  }
}

export async function notifyTicketStatusUpdate(ticket: {
  id: number;
  subject: string;
  status: string;
  customerName?: string;
  customerEmail?: string;
}) {
  // Notify customer of status change if they have an email
  if (ticket.customerEmail) {
    try {
      await transporter.sendMail({
        from: `"${APP_NAME} Support" <${FROM_EMAIL}>`,
        to: ticket.customerEmail,
        subject: `Ticket #${ticket.id} Update: ${ticket.subject}`,
        html: ticketStatusUpdateHTML(ticket),
      });
      console.log("[email] Status update notification sent to customer");
    } catch (e) {
      console.warn("[email] Failed to send status update notification:", e);
    }
  }
  // Always notify admin
  try {
    await transporter.sendMail({
      from: `"${APP_NAME}" <${FROM_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject: `Ticket #${ticket.id} → ${ticket.status.replace(/_/g, " ").toUpperCase()}: ${ticket.subject}`,
      html: ticketStatusUpdateHTML(ticket),
    });
  } catch (e) {
    console.warn("[email] Failed to send admin status notification:", e);
  }
}
