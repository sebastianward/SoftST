const fs = require("fs");
const path = require("path");

function isMailEnabled() {
  return String(process.env.MAIL_ENABLED || "false").toLowerCase() === "true";
}

function getMailTestRecipient() {
  return (process.env.MAIL_TEST_TO || "").trim();
}

function getInternalRecipients() {
  return String(process.env.MAIL_INTERNAL_TO || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function refreshGoogleAccessToken() {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const refreshToken = (process.env.GOOGLE_REFRESH_TOKEN || "").trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Faltan credenciales OAuth de Google para correo.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const payload = await response.json();

  if (!response.ok || !payload.access_token) {
    throw new Error(`No se pudo refrescar el token de Gmail: ${payload.error || response.statusText}`);
  }

  return payload.access_token;
}

function toBase64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function guessMimeType(filename) {
  const extension = path.extname(filename || "").toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

function buildRawMimeMessage({ from, to, subject, text, html, attachments = [] }) {
  const mixedBoundary = `softst-mixed-${Date.now()}`;
  const alternativeBoundary = `softst-alt-${Date.now()}`;
  return [
    `From: SoftST <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    text,
    "",
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
    "",
    `--${alternativeBoundary}--`,
    "",
    ...attachments.flatMap((attachment) => [
      `--${mixedBoundary}`,
      `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: ${attachment.disposition || "attachment"}; filename="${attachment.filename}"`,
      ...(attachment.cid ? [`Content-ID: <${attachment.cid}>`] : []),
      "",
      attachment.content,
      "",
    ]),
    `--${mixedBoundary}--`,
  ].join("\r\n");
}

function buildCreatedEntryEmail(entry) {
  const diagnosticMinDays = toPositiveInteger(entry.diagnostic_min_days, 5);
  const diagnosticMaxDays = toPositiveInteger(entry.diagnostic_max_days, 7);
  const infoLines = String(entry.mail_info_text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows = [
    ["ID", `#${entry.id}`],
    ["Empresa", entry.business_name],
    ["RUT", entry.rut],
    ["Contacto", entry.contact_name],
    ["Correo contacto", entry.contact_email || "-"],
    ["Telefono contacto", entry.contact_phone || "-"],
    ["Propiedad", entry.ownership || "-"],
    ["Sucursal", entry.branch_office || "-"],
    ["Equipo", entry.equipment_model],
    ["Serie", entry.serial_number || "-"],
    ["Reporte cliente", entry.client_report],
    ["Detalle y accesorios", entry.details_accessories || "-"],
    ["Ingresado por", entry.worker_name_snapshot],
    ["Fecha de creacion", entry.created_at],
  ];

  const text = [
    "[DEBUG] Correo de prueba de SoftST.",
    "",
    `Se ha registrado un nuevo ingreso #${entry.id}.`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #22164b;">
      <p style="display: inline-block; margin: 0 0 16px; padding: 6px 10px; background: #fff2b3; color: #6c5200; font-weight: 700; border-radius: 999px;">
        DEBUG: correo de prueba
      </p>
      <h2 style="margin-bottom: 12px;">Nuevo ingreso registrado #${escapeHtml(entry.id)}</h2>
      <p style="margin-top: 0;">Resumen del formulario ingresado en SoftST.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 760px;">
        <tbody>
          ${rows
            .map(
              ([label, value]) => `
                <tr>
                  <td style="padding: 8px 12px; border: 1px solid #ddd3f5; font-weight: 700; width: 220px;">${escapeHtml(
                    label
                  )}</td>
                  <td style="padding: 8px 12px; border: 1px solid #ddd3f5;">${escapeHtml(value)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
      <div style="margin-top: 28px; max-width: 760px;">
        <p style="margin-bottom: 12px;"><strong>Para todas sus consultas dirigir a:</strong> servicio.tecnico@antalis.com</p>
        <p style="margin-bottom: 8px;"><strong>Informacion importante:</strong></p>
        ${
          infoLines.length > 0
            ? `
              <ul style="padding-left: 20px; line-height: 1.5;">
                ${infoLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
              </ul>
            `
            : `
              <ul style="padding-left: 20px; line-height: 1.5;">
                <li>El plazo de diagnostico es de ${diagnosticMinDays} a ${diagnosticMaxDays} dias habiles.</li>
              </ul>
            `
        }
      </div>
      <div style="margin-top: 28px; padding-top: 18px; border-top: 2px solid #ddd3f5; max-width: 760px;">
        ${
          entry.banner_cid
            ? `<div style="margin-bottom: 18px;"><img src="cid:${entry.banner_cid}" alt="Banner servicio tecnico" style="max-width: 100%; border-radius: 18px;"></div>`
            : ""
        }
        <div style="font-size: 40px; font-weight: 800; color: #22164b; margin-bottom: 10px;">Servicio Tecnico</div>
        <div style="font-size: 18px; line-height: 1.6;">
          <div>servicio.tecnico@antalis.com</div>
          <div>+56 2 24855070</div>
        </div>
      </div>
    </div>
  `.trim();

  return {
    subject: `[DEBUG] SoftST: registro creado ingreso #${entry.id}`,
    text,
    html,
  };
}

function buildAttachments(entry) {
  const regularAttachments = (entry.attachments || [])
    .map((attachmentPath) => {
      const absolutePath = path.resolve(attachmentPath);

      if (!fs.existsSync(absolutePath)) {
        return null;
      }

      return {
        filename: path.basename(absolutePath),
        mimeType: guessMimeType(absolutePath),
        content: fs.readFileSync(absolutePath).toString("base64"),
      };
    })
    .filter(Boolean);

  const bannerPath = (entry.banner_attachment || "").trim();
  const bannerAttachment =
    bannerPath && fs.existsSync(path.resolve(bannerPath))
      ? {
          filename: path.basename(bannerPath),
          mimeType: guessMimeType(bannerPath),
          content: fs.readFileSync(path.resolve(bannerPath)).toString("base64"),
          disposition: "inline",
          cid: "softst-mail-banner",
        }
      : null;

  return bannerAttachment ? [bannerAttachment, ...regularAttachments] : regularAttachments;
}

async function sendMail({ to, subject, text, html, attachments = [] }) {
  const senderEmail = (process.env.GOOGLE_SENDER_EMAIL || "").trim();

  if (!senderEmail) {
    throw new Error("Falta GOOGLE_SENDER_EMAIL en la configuracion.");
  }

  const rawMessage = buildRawMimeMessage({
    from: senderEmail,
    to,
    subject,
    text,
    html,
    attachments,
  });

  const accessToken = await refreshGoogleAccessToken();
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw: toBase64Url(rawMessage),
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`No se pudo enviar correo: ${payload.error?.message || response.statusText}`);
  }

  return payload;
}

async function sendCreatedEntryEmail(entry) {
  if (!isMailEnabled()) {
    return { skipped: true, reason: "mail_disabled" };
  }

  const recipients = new Set();
  const testRecipient = getMailTestRecipient();

  if (testRecipient) {
    recipients.add(testRecipient);
  }

  getInternalRecipients().forEach((recipient) => recipients.add(recipient));

  if (entry.contact_email) {
    recipients.add(String(entry.contact_email).trim());
  }

  const to = Array.from(recipients).filter(Boolean);

  if (to.length === 0) {
    return { skipped: true, reason: "missing_recipients" };
  }

  const email = buildCreatedEntryEmail(entry);
  const result = await sendMail({
    to: to.join(", "),
    subject: email.subject,
    text: email.text,
    html: email.html,
    attachments: buildAttachments(entry),
  });

  return { skipped: false, result, recipients: to };
}

module.exports = {
  sendCreatedEntryEmail,
};
