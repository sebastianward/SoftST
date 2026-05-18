const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const DatabaseService = require("./services/db");
const { requireAuth, requireAdmin, requireAdminOrOperator } = require("./middleware/auth");
const { buildEntryZpl, sendZplToPrinter } = require("./services/print");
const { sendCreatedEntryEmail } = require("./services/mail");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || "data");
const uploadDir = path.resolve(rootDir, process.env.UPLOAD_DIR || "uploads");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new DatabaseService({
  dbPath: path.join(dataDir, "app.sqlite"),
});
let printWorkerRunning = false;

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const safeBase = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    callback(null, `${Date.now()}-${safeBase}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 15,
  },
});

const authCookieName = "softst_auth";
const defaultWorkerPassword = "Antalis2025";
const departmentAreas = ["servicio_tecnico", "grafica"];
const departmentAreaLabels = {
  servicio_tecnico: "Servicio Tecnico",
  grafica: "Grafica",
};
const entryStatuses = [
  { value: "diagnostico_pendiente", label: "Diagnostico pendiente" },
  { value: "no_asignado", label: "No asignado" },
  { value: "espera_oc", label: "Espera de OC" },
  { value: "finalizado", label: "Finalizado" },
];
const notificationDefinitions = [
  {
    type: "created",
    title: "Registro creado",
    message: (entry) => `Se creo el ingreso #${entry.id} para ${entry.business_name}.`,
  },
  {
    type: "pending_action",
    title: "Accion pendiente",
    message: (entry) => `El ingreso #${entry.id} tiene una accion pendiente por revisar, por ejemplo una cotizacion.`,
  },
  {
    type: "deadline",
    title: "Plazo limite",
    message: (entry) => `El ingreso #${entry.id} alcanzo el plazo limite sin cierre registrado.`,
  },
  {
    type: "urgent_not_updated",
    title: "Caso urgente, no actualizado",
    message: (entry) => `El ingreso #${entry.id} sigue sin actualizacion despues del plazo limite.`,
  },
];

const appSettingsDefaults = {
  pending_action_days: "4",
  deadline_days_after_pending: "3",
  urgent_days_after_deadline: "1",
  diagnostic_min_days: "5",
  diagnostic_max_days: "7",
  mail_info_text:
    "El plazo de diagnostico es de 5 a 7 dias habiles.\nEn caso de que el presupuesto no sea aprobado o caduque por vencimiento, el cliente acepta el cobro de UF 2 por diagnostico.\nLuego de 60 dias de permanencia del equipo por falta de autorizacion o retiro, Antalis Abitek podra gestionar su disposicion informando previamente por correo.",
  mail_banner_path: "",
};

function normalizeArea(value, fallback = "servicio_tecnico") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  return departmentAreas.includes(normalized) ? normalized : fallback;
}

function getAreaLabel(area) {
  return departmentAreaLabels[normalizeArea(area)] || departmentAreaLabels.servicio_tecnico;
}

function getUserArea(user) {
  if (!user) {
    return "servicio_tecnico";
  }

  if (user.role === "admin") {
    return null;
  }

  return normalizeArea(user.area);
}

function getEffectiveArea(req) {
  if (!req.session.user) {
    return "servicio_tecnico";
  }

  if (req.session.user.role === "admin") {
    return normalizeArea(req.session.viewArea || "servicio_tecnico");
  }

  return getUserArea(req.session.user);
}

function formatDisplayNameFromEmail(email) {
  const localPart = String(email || "")
    .trim()
    .toLowerCase()
    .split("@")[0];

  return localPart
    .split(".")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseInstitutionalEmails(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeNamePart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function getInstitutionalEmailDomain() {
  return String(process.env.INSTITUTIONAL_EMAIL_DOMAIN || "antalis.com")
    .trim()
    .toLowerCase();
}

function buildInstitutionalEmailFromName(name, domain = getInstitutionalEmailDomain()) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .map(normalizeNamePart)
    .filter(Boolean);

  if (parts.length < 2) {
    return "";
  }

  const firstName = parts[0];
  const firstSurname = parts.length === 2 ? parts[1] : parts[parts.length - 2];

  if (!firstName || !firstSurname || !domain) {
    return "";
  }

  return `${firstName}.${firstSurname}@${domain}`;
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || "";
  return cookieHeader.split(";").reduce((cookies, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) {
      return cookies;
    }

    cookies[rawKey] = decodeURIComponent(rawValue.join("="));
    return cookies;
  }, {});
}

function signAuthToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "change_this_secret")
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || !token.includes(".")) {
    return null;
  }

  const [body, providedSignature] = token.split(".");
  const expectedSignature = crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "change_this_secret")
    .update(body)
    .digest("base64url");

  if (providedSignature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function buildPersistentToken(user) {
  return signAuthToken({
    id: user.id,
    username: user.username,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
  });
}

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function getFlash(req) {
  const flash = req.session.flash || null;
  delete req.session.flash;
  return flash;
}

function normalizeEntry(row) {
  return {
    ...row,
    images: JSON.parse(row.image_paths || "[]"),
  };
}

function getEntryStatusLabel(value) {
  return entryStatuses.find((status) => status.value === value)?.label || value;
}

function parseSqliteDate(value) {
  return new Date(String(value).replace(" ", "T") + "Z");
}

function toSqliteDate(value) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createOrSyncWorkerAccount({ email, area, role = "user", active = 1 }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedArea = normalizeArea(area);
  const normalizedRole = role === "user" ? "user" : "user";

  if (!normalizedEmail) {
    throw new Error("Debes indicar un correo institucional valido.");
  }

  const workerName = formatDisplayNameFromEmail(normalizedEmail);

  if (!workerName) {
    throw new Error(`No se pudo derivar el nombre desde ${normalizedEmail}.`);
  }

  let worker = db.get("SELECT * FROM workers WHERE lower(email) = lower(?)", [normalizedEmail]);

  if (!worker) {
    worker = db.get(
      "SELECT * FROM workers WHERE lower(name) = lower(?) AND area = ? ORDER BY id ASC LIMIT 1",
      [workerName, normalizedArea]
    );
  }

  if (!worker) {
    db.run(
      `INSERT INTO workers (name, email, area, code, active, updated_at)
       VALUES (?, ?, ?, '', ?, CURRENT_TIMESTAMP)`,
      [workerName, normalizedEmail, normalizedArea, active]
    );
    worker = db.get("SELECT * FROM workers ORDER BY id DESC LIMIT 1");
  } else {
    db.run(
      `UPDATE workers
       SET name = ?, email = ?, area = ?, active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [workerName, normalizedEmail, normalizedArea, active, Number(worker.id)]
    );
    worker = db.get("SELECT * FROM workers WHERE id = ?", [Number(worker.id)]);
  }

  const passwordHash = bcrypt.hashSync(defaultWorkerPassword, 10);
  let user = db.get("SELECT * FROM users WHERE lower(email) = lower(?)", [normalizedEmail]);

  if (!user) {
    user = db.get("SELECT * FROM users WHERE worker_id = ?", [Number(worker.id)]);
  }

  if (!user) {
    db.run(
      `INSERT INTO users (username, email, password_hash, role, area, worker_id, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [normalizedEmail, normalizedEmail, passwordHash, normalizedRole, normalizedArea, Number(worker.id)]
    );
    user = db.get("SELECT * FROM users ORDER BY id DESC LIMIT 1");
  } else {
    db.run(
      `UPDATE users
       SET username = ?, email = ?, password_hash = ?, role = ?, area = ?, worker_id = ?, active = 1
       WHERE id = ?`,
      [normalizedEmail, normalizedEmail, passwordHash, normalizedRole, normalizedArea, Number(worker.id), Number(user.id)]
    );
    user = db.get("SELECT * FROM users WHERE id = ?", [Number(user.id)]);
  }

  db.run(
    "UPDATE workers SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [Number(user.id), Number(worker.id)]
  );

  return {
    worker,
    user,
    generatedName: workerName,
  };
}

function backfillWorkerEmailsAndAccounts() {
  const workers = db.all("SELECT id, name, email, area, user_id, active FROM workers ORDER BY id ASC");

  workers.forEach((worker) => {
    const derivedEmail = worker.email || buildInstitutionalEmailFromName(worker.name);

    if (!derivedEmail) {
      return;
    }

    const normalizedArea = normalizeArea(worker.area);
    const active = Number(worker.active) === 1 ? 1 : 0;

    if (!worker.email) {
      db.run(
        "UPDATE workers SET email = ?, area = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [derivedEmail, normalizedArea, Number(worker.id)]
      );
    }

    let user = worker.user_id
      ? db.get("SELECT * FROM users WHERE id = ?", [Number(worker.user_id)])
      : db.get("SELECT * FROM users WHERE lower(email) = lower(?)", [derivedEmail]);

    const passwordHash = bcrypt.hashSync(defaultWorkerPassword, 10);

    if (!user) {
      db.run(
        `INSERT INTO users (username, email, password_hash, role, area, worker_id, active)
         VALUES (?, ?, ?, 'user', ?, ?, ?)`,
        [derivedEmail, derivedEmail, passwordHash, normalizedArea, Number(worker.id), active]
      );
      user = db.get("SELECT * FROM users ORDER BY id DESC LIMIT 1");
    } else {
      const nextRole = user.role === "admin" ? "admin" : (user.role || "user");
      const nextArea = nextRole === "admin" ? null : normalizedArea;

      db.run(
        `UPDATE users
         SET username = ?, email = ?, password_hash = ?, role = ?, area = ?, worker_id = ?, active = ?
         WHERE id = ?`,
        [derivedEmail, derivedEmail, passwordHash, nextRole, nextArea, Number(worker.id), active, Number(user.id)]
      );
    }

    db.run("UPDATE workers SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      Number(user.id),
      Number(worker.id),
    ]);
  });
}

function getAppSettings() {
  return db.getAppSettings(appSettingsDefaults);
}

function buildNotificationSchedule(entry, settings = getAppSettings()) {
  const createdAt = parseSqliteDate(entry.created_at);
  const pendingActionDays = toPositiveInteger(settings.pending_action_days, 4);
  const deadlineDaysAfterPending = toPositiveInteger(settings.deadline_days_after_pending, 3);
  const urgentDaysAfterDeadline = toPositiveInteger(settings.urgent_days_after_deadline, 1);
  const dayOffsets = {
    created: 0,
    pending_action: pendingActionDays,
    deadline: pendingActionDays + deadlineDaysAfterPending,
    urgent_not_updated: pendingActionDays + deadlineDaysAfterPending + urgentDaysAfterDeadline,
  };

  return notificationDefinitions.map((definition) => {
    const dueAt = new Date(createdAt);
    dueAt.setUTCDate(dueAt.getUTCDate() + (dayOffsets[definition.type] || 0));

    return {
      entryId: Number(entry.id),
      type: definition.type,
      title: definition.title,
      message: definition.message(entry),
      dueAt: toSqliteDate(dueAt),
    };
  });
}

function ensureNotificationsForEntry(entry) {
  const existingTypes = new Set(
    db
      .all("SELECT notification_type FROM notifications WHERE entry_id = ?", [Number(entry.id)])
      .map((row) => row.notification_type)
  );

  buildNotificationSchedule(entry).forEach((notification) => {
    if (!existingTypes.has(notification.type)) {
      db.run(
        `INSERT INTO notifications (entry_id, notification_type, title, message, due_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          notification.entryId,
          notification.type,
          notification.title,
          notification.message,
          notification.dueAt,
        ]
      );
    }
  });
}

function backfillNotifications() {
  const entries = db.all("SELECT id, business_name, created_at FROM entries");
  entries.forEach((entry) => ensureNotificationsForEntry(entry));
}

function queuePrintJob(entryId, reason) {
  const entry = db.get(
    `SELECT id, business_name, rut, contact_name, contact_email, contact_phone,
            ownership, branch_office, equipment_model, serial_number,
            worker_name_snapshot, client_report, details_accessories, image_paths, created_at
     FROM entries
     WHERE id = ?`,
    [Number(entryId)]
  );

  if (!entry) {
    return null;
  }

  const zplContent = buildEntryZpl({
    ...entry,
    image_count: JSON.parse(entry.image_paths || "[]").length,
  });
  db.run(
    `INSERT INTO print_jobs (entry_id, printer_name, printer_mode, status, reason, zpl_content)
     VALUES (?, ?, ?, 'pending', ?, ?)`,
    [
      Number(entryId),
      process.env.PRINTER_NAME || "gk420t",
      process.env.PRINTER_MODE || "zpl",
      reason,
      zplContent,
    ]
  );

  return db.get("SELECT id, status FROM print_jobs ORDER BY id DESC LIMIT 1");
}

function markEntryAsDeleted(entryId, deletedByUserId) {
  const entry = db.get("SELECT id, deleted_at FROM entries WHERE id = ?", [Number(entryId)]);

  if (!entry || entry.deleted_at) {
    return false;
  }

  db.run(
    "UPDATE entries SET deleted_at = CURRENT_TIMESTAMP, deleted_by_user_id = ? WHERE id = ?",
    [Number(deletedByUserId), Number(entryId)]
  );
  return true;
}

function restoreDeletedEntry(entryId) {
  const entry = db.get("SELECT id, deleted_at FROM entries WHERE id = ?", [Number(entryId)]);

  if (!entry || !entry.deleted_at) {
    return false;
  }

  db.run("UPDATE entries SET deleted_at = NULL, deleted_by_user_id = NULL WHERE id = ?", [Number(entryId)]);
  return true;
}

function parseVisibilityFilter(value) {
  return String(value || "").trim() === "1";
}

function resolveEntryVisibilityFilters(query = {}) {
  const hasPending = Object.prototype.hasOwnProperty.call(query, "showPending");
  const hasFinalized = Object.prototype.hasOwnProperty.call(query, "showFinalized");
  const hasDeleted = Object.prototype.hasOwnProperty.call(query, "showDeleted");

  if (!hasPending && !hasFinalized && !hasDeleted) {
    return {
      showPending: true,
      showFinalized: false,
      showDeleted: false,
    };
  }

  return {
    showPending: hasPending ? parseVisibilityFilter(query.showPending) : false,
    showFinalized: hasFinalized ? parseVisibilityFilter(query.showFinalized) : false,
    showDeleted: hasDeleted ? parseVisibilityFilter(query.showDeleted) : false,
  };
}

function triggerPrintWorker() {
  processPendingPrintJobs().catch((error) => {
    console.error("Error al procesar cola de impresion:", error);
  });
}

async function processPendingPrintJobs() {
  if (printWorkerRunning) {
    return;
  }

  printWorkerRunning = true;

  try {
    const enabled = String(process.env.PRINT_ENABLED || "false").toLowerCase() === "true";
    const printerMode = String(process.env.PRINTER_MODE || "tcp").toLowerCase();
    const host = process.env.PRINTER_HOST || "";
    const port = Number(process.env.PRINTER_PORT || 9100);
    const devicePath = process.env.PRINTER_DEVICE || "/dev/usb/lp0";

    if (!enabled) {
      return;
    }

    if (printerMode === "usb" && !devicePath) {
      return;
    }

    if (printerMode !== "usb" && !host) {
      return;
    }

    const jobs = db.all(
      `SELECT id, zpl_content
       FROM print_jobs
       WHERE status IN ('pending', 'failed')
       ORDER BY id ASC
       LIMIT 3`
    );

    for (const job of jobs) {
      try {
        db.run(
          "UPDATE print_jobs SET status = 'processing', attempts = attempts + 1, error_message = NULL WHERE id = ?",
          [Number(job.id)]
        );

        await sendZplToPrinter({
          mode: printerMode,
          host,
          port,
          devicePath,
          zpl: job.zpl_content || "",
        });

        db.run(
          "UPDATE print_jobs SET status = 'printed', processed_at = CURRENT_TIMESTAMP WHERE id = ?",
          [Number(job.id)]
        );
      } catch (error) {
        db.run(
          "UPDATE print_jobs SET status = 'failed', error_message = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?",
          [String(error.message || error), Number(job.id)]
        );
      }
    }
  } finally {
    printWorkerRunning = false;
  }
}

async function bootstrap() {
  await db.init([
    {
      username: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD || "admin123",
      role: "admin",
      email: (process.env.ADMIN_EMAIL || "").trim() || null,
      area: null,
    },
    {
      username: process.env.USER_USERNAME || "user",
      password: process.env.USER_PASSWORD || "user123",
      role: "user",
      email: (process.env.USER_EMAIL || "").trim() || null,
      area: "servicio_tecnico",
    },
    {
      username: process.env.OPERATOR_USERNAME || "operator",
      password: process.env.OPERATOR_PASSWORD || "operator123",
      role: "operator",
      email: (process.env.OPERATOR_EMAIL || "").trim() || null,
      area: "servicio_tecnico",
    },
  ]);
  backfillWorkerEmailsAndAccounts();
  backfillNotifications();
  setInterval(triggerPrintWorker, 15000);

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  app.use("/public", express.static(path.join(__dirname, "public")));
  app.use("/uploads", express.static(uploadDir));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "change_this_secret",
      resave: false,
      saveUninitialized: false,
      name: "softst_session",
      cookie: {
        maxAge: 1000 * 60 * 60 * 8,
        sameSite: "lax",
        httpOnly: true,
      },
    })
  );

  app.use((req, _res, next) => {
    if (req.session.user) {
      return next();
    }

    const cookies = parseCookies(req);
    const payload = verifyAuthToken(cookies[authCookieName]);

    if (!payload) {
      return next();
    }

    const user = db.get(
      "SELECT id, username, email, role, area, active FROM users WHERE id = ? AND username = ?",
      [Number(payload.id), payload.username]
    );

    if (!user || !user.active || user.role !== payload.role) {
      return next();
    }

    req.session.user = {
      id: Number(user.id),
      username: user.username,
      email: user.email || "",
      role: user.role,
      area: getUserArea(user),
    };

    return next();
  });

  app.use((req, res, next) => {
    const currentUser = req.session.user || null;
    const currentArea = getEffectiveArea(req);
    const notificationCount =
      currentUser && currentUser.role === "admin"
        ? db.get(
            `SELECT COUNT(*) AS count
             FROM notifications
             JOIN entries ON entries.id = notifications.entry_id
             WHERE read_at IS NULL
             AND entries.area = ?
             AND datetime(due_at) <= datetime('now')`
          , [currentArea]).count
        : 0;

    res.locals.currentUser = currentUser;
    res.locals.currentArea = currentArea;
    res.locals.areaOptions = departmentAreas.map((area) => ({
      value: area,
      label: getAreaLabel(area),
    }));
    res.locals.currentAreaLabel = getAreaLabel(currentArea);
    res.locals.notificationCount = Number(notificationCount || 0);
    res.locals.flash = getFlash(req);
    next();
  });

  app.get("/", requireAuth, (req, res) => {
    const currentArea = getEffectiveArea(req);
    const latestEntries = db.all(
      `SELECT id, business_name, equipment_model, worker_name_snapshot, created_at, image_paths
       FROM entries
       WHERE area = ?
       ORDER BY id DESC
       LIMIT 5`,
      [currentArea]
    ).map(normalizeEntry);

    const activeWorkers = db.get(
      "SELECT COUNT(*) AS count FROM workers WHERE active = 1 AND area = ?",
      [currentArea]
    ).count;
    const totalEntries = db.get(
      "SELECT COUNT(*) AS count FROM entries WHERE area = ?",
      [currentArea]
    ).count;

    res.render("dashboard", {
      latestEntries,
      stats: {
        activeWorkers: Number(activeWorkers || 0),
        totalEntries: Number(totalEntries || 0),
      },
    });
  });

  app.get("/login", (req, res) => {
    if (req.session.user) {
      return res.redirect("/");
    }

    return res.render("login");
  });

  app.post("/login", (req, res) => {
    const identity = String(req.body.identity || req.body.username || "").trim().toLowerCase();
    const { password } = req.body;
    const user = db.get(
      `SELECT id, username, email, password_hash, role, area, active
       FROM users
       WHERE lower(username) = ? OR lower(email) = ?
       LIMIT 1`,
      [identity, identity]
    );

    if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
      setFlash(req, "error", "Credenciales invalidas.");
      return res.redirect("/login");
    }

    req.session.user = {
      id: Number(user.id),
      username: user.username,
      email: user.email || "",
      role: user.role,
      area: getUserArea(user),
    };
    if (user.role === "admin" && !req.session.viewArea) {
      req.session.viewArea = "servicio_tecnico";
    }

    res.cookie(authCookieName, buildPersistentToken(req.session.user), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30,
      path: "/",
    });

    setFlash(req, "success", `Bienvenido, ${user.username}.`);
    return res.redirect("/");
  });

  app.get("/admin/switch-area/:area", requireAuth, requireAdmin, (req, res) => {
    req.session.viewArea = normalizeArea(req.params.area);
    return res.redirect(req.get("referer") || "/");
  });

  app.post("/logout", requireAuth, (req, res) => {
    res.clearCookie(authCookieName, { path: "/" });
    req.session.destroy(() => res.redirect("/login"));
  });

  app.get("/entries/new", requireAuth, (req, res) => {
    const currentArea = getEffectiveArea(req);
    const workers = db.all(
      "SELECT id, name FROM workers WHERE active = 1 AND area = ? ORDER BY name ASC",
      [currentArea]
    );
    res.render("entry-form", {
      workers,
      formData: { workerName: "" },
    });
  });

  app.post("/entries", requireAuth, upload.array("images", 15), (req, res) => {
    const currentArea = getEffectiveArea(req);
    const workers = db.all(
      "SELECT id, name FROM workers WHERE active = 1 AND area = ? ORDER BY name ASC",
      [currentArea]
    );
    const imagePaths = (req.files || []).map((file) =>
      path.posix.join("uploads", path.basename(file.path))
    );

    const formData = {
      businessName: req.body.businessName?.trim(),
      rut: req.body.rut?.trim(),
      contactName: req.body.contactName?.trim(),
      contactEmail: req.body.contactEmail?.trim(),
      contactPhone: req.body.contactPhone?.trim(),
      ownership: req.body.ownership?.trim(),
      branchOffice: req.body.branchOffice?.trim(),
      equipmentModel: req.body.equipmentModel?.trim(),
      serialNumber: req.body.serialNumber?.trim(),
      clientReport: req.body.clientReport?.trim(),
      detailsAccessories: req.body.detailsAccessories?.trim(),
      workerId: req.body.workerId,
      workerName: req.body.workerName?.trim() || "",
    };

    if (
      !formData.businessName ||
      !formData.rut ||
      !formData.contactName ||
      !formData.equipmentModel ||
      !formData.clientReport ||
      (!formData.workerId && !formData.workerName)
    ) {
      setFlash(req, "error", "Completa los campos obligatorios del ingreso.");
      return res.status(422).render("entry-form", {
        workers,
        formData,
      });
    }

    let worker = null;

    if (formData.workerId) {
      worker = db.get("SELECT id, name FROM workers WHERE id = ? AND active = 1 AND area = ?", [
        Number(formData.workerId),
        currentArea,
      ]);
    }

    if (!worker && formData.workerName) {
      worker = db.get(
        "SELECT id, name FROM workers WHERE lower(name) = lower(?) AND active = 1 AND area = ?",
        [formData.workerName, currentArea]
      );
    }

    if (!worker) {
      setFlash(req, "error", "Debes seleccionar un trabajador valido.");
      return res.status(422).render("entry-form", {
        workers,
        formData,
      });
    }

    db.run(
      `INSERT INTO entries (
        business_name, rut, contact_name, contact_email, contact_phone, ownership,
        branch_office, equipment_model, serial_number, client_report,
        details_accessories, entry_status, sap_code, comment, final_task, quotation, purchase_order, area,
        worker_id, worker_name_snapshot, image_paths,
        notification_read, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'no_asignado', '', '', '', '', '', ?, ?, ?, ?, 0, ?)`,
      [
        formData.businessName,
        formData.rut,
        formData.contactName,
        formData.contactEmail || "",
        formData.contactPhone || "",
        formData.ownership || "",
        formData.branchOffice || "",
        formData.equipmentModel,
        formData.serialNumber || "",
        formData.clientReport,
        formData.detailsAccessories || "",
        currentArea,
        Number(worker.id),
        worker.name,
        JSON.stringify(imagePaths),
        req.session.user.id,
      ]
    );
    const newEntry = db.get(
      `SELECT id, business_name, rut, contact_name, contact_email, contact_phone, ownership,
              branch_office, equipment_model, serial_number, client_report, details_accessories,
              entry_status, sap_code, comment, final_task, quotation, purchase_order,
              worker_name_snapshot, image_paths, created_at
       FROM entries
       ORDER BY id DESC
       LIMIT 1`
    );
    ensureNotificationsForEntry(newEntry);
    if (String(process.env.PRINT_AUTO_ON_CREATE || "true").toLowerCase() === "true") {
      queuePrintJob(newEntry.id, "auto_create");
      triggerPrintWorker();
    }

    const currentSettings = getAppSettings();

    sendCreatedEntryEmail({
      ...newEntry,
      entry_status_label: getEntryStatusLabel(newEntry.entry_status),
      image_count: JSON.parse(newEntry.image_paths || "[]").length,
      attachments: JSON.parse(newEntry.image_paths || "[]").map((imagePath) =>
        path.resolve(rootDir, imagePath)
      ),
      ...currentSettings,
      banner_attachment: currentSettings.mail_banner_path
        ? path.resolve(rootDir, currentSettings.mail_banner_path)
        : "",
      banner_cid: "softst-mail-banner",
    }).catch((error) => {
      console.error(`Error al enviar correo del ingreso #${newEntry.id}:`, error.message || error);
    });

    setFlash(req, "success", "Ingreso registrado correctamente.");
    return res.redirect("/entries");
  });

  app.get("/entries", requireAuth, (req, res) => {
    const currentArea = getEffectiveArea(req);
    const visibilityFilters = resolveEntryVisibilityFilters(req.query);
    const workers = req.session.user.role === "admin"
      ? db.all("SELECT id, name FROM workers WHERE active = 1 AND area = ? ORDER BY name ASC", [currentArea])
      : [];
    const entries = db.all(
      `SELECT e.*, u.username AS created_by_username,
              d.username AS deleted_by_username,
              (
                SELECT pj.status
                FROM print_jobs pj
                WHERE pj.entry_id = e.id
                ORDER BY pj.id DESC
                LIMIT 1
              ) AS latest_print_status
       FROM entries e
       JOIN users u ON u.id = e.created_by_user_id
       LEFT JOIN users d ON d.id = e.deleted_by_user_id
       WHERE e.area = ?
       AND (
         (? = 1 AND e.deleted_at IS NULL AND e.entry_status != 'finalizado')
         OR (? = 1 AND e.deleted_at IS NULL AND e.entry_status = 'finalizado')
         OR (? = 1 AND e.deleted_at IS NOT NULL)
       )
       ORDER BY e.id DESC`,
      [
        currentArea,
        visibilityFilters.showPending ? 1 : 0,
        visibilityFilters.showFinalized ? 1 : 0,
        visibilityFilters.showDeleted ? 1 : 0,
      ]
    ).map(normalizeEntry);

    res.render("entries", {
      entries,
      workers,
      entryStatuses,
      visibilityFilters,
    });
  });

  app.post("/entries/:id/update", requireAuth, requireAdminOrOperator, (req, res) => {
    const entryId = Number(req.params.id);
    const currentArea = getEffectiveArea(req);
    const currentEntry = db.get("SELECT id, area, deleted_at FROM entries WHERE id = ?", [entryId]);

    if (!currentEntry || normalizeArea(currentEntry.area) !== currentArea) {
      setFlash(req, "error", "Ingreso no encontrado en el area seleccionada.");
      return res.redirect("/entries");
    }

    if (currentEntry.deleted_at) {
      setFlash(req, "error", "No puedes editar un ingreso eliminado.");
      return res.redirect("/entries");
    }

    if (req.session.user.role === "admin") {
      const formData = {
        businessName: req.body.businessName?.trim(),
        rut: req.body.rut?.trim(),
        contactName: req.body.contactName?.trim(),
        contactEmail: req.body.contactEmail?.trim() || "",
        contactPhone: req.body.contactPhone?.trim() || "",
        ownership: req.body.ownership?.trim() || "",
        branchOffice: req.body.branchOffice?.trim() || "",
        equipmentModel: req.body.equipmentModel?.trim(),
        serialNumber: req.body.serialNumber?.trim() || "",
        clientReport: req.body.clientReport?.trim() || "",
        detailsAccessories: req.body.detailsAccessories?.trim() || "",
        entryStatus: req.body.entryStatus,
        sapCode: req.body.sapCode?.trim() || "",
        comment: req.body.comment?.trim() || "",
        finalTask: req.body.finalTask?.trim() || "",
        quotation: req.body.quotation?.trim() || "",
        purchaseOrder: req.body.purchaseOrder?.trim() || "",
        workerId: Number(req.body.workerId),
      };

      if (
        !formData.businessName ||
        !formData.rut ||
        !formData.contactName ||
        !formData.equipmentModel ||
        !formData.entryStatus ||
        !formData.workerId
      ) {
        setFlash(req, "error", "Faltan campos obligatorios para actualizar el ingreso.");
        return res.redirect("/entries");
      }

      const worker = db.get(
        "SELECT id, name FROM workers WHERE id = ? AND active = 1 AND area = ?",
        [formData.workerId, currentArea]
      );

      if (!worker) {
        setFlash(req, "error", "Trabajador invalido.");
        return res.redirect("/entries");
      }

      db.run(
        `UPDATE entries SET
          business_name = ?, rut = ?, contact_name = ?, contact_email = ?, contact_phone = ?,
          ownership = ?, branch_office = ?, equipment_model = ?, serial_number = ?, client_report = ?,
          details_accessories = ?, entry_status = ?, sap_code = ?, comment = ?, final_task = ?,
          quotation = ?, purchase_order = ?, area = ?, worker_id = ?, worker_name_snapshot = ?
         WHERE id = ?`,
        [
          formData.businessName,
          formData.rut,
          formData.contactName,
          formData.contactEmail,
          formData.contactPhone,
          formData.ownership,
          formData.branchOffice,
          formData.equipmentModel,
          formData.serialNumber,
          formData.clientReport,
          formData.detailsAccessories,
          formData.entryStatus,
          formData.sapCode,
          formData.comment,
          formData.finalTask,
          formData.quotation,
          formData.purchaseOrder,
          currentArea,
          worker.id,
          worker.name,
          entryId,
        ]
      );
    } else {
      db.run(
        `UPDATE entries SET
          entry_status = ?, sap_code = ?, comment = ?, final_task = ?, quotation = ?, purchase_order = ?
         WHERE id = ?`,
        [
          req.body.entryStatus,
          req.body.sapCode?.trim() || "",
          req.body.comment?.trim() || "",
          req.body.finalTask?.trim() || "",
          req.body.quotation?.trim() || "",
          req.body.purchaseOrder?.trim() || "",
          entryId,
        ]
      );
    }

    setFlash(req, "success", `Ingreso #${entryId} actualizado.`);
    return res.redirect("/entries");
  });

  app.post("/entries/:id/reprint", requireAuth, requireAdminOrOperator, (req, res) => {
    const entryId = Number(req.params.id);
    const entry = db.get("SELECT id, area, deleted_at FROM entries WHERE id = ?", [entryId]);

    if (!entry || normalizeArea(entry.area) !== getEffectiveArea(req)) {
      setFlash(req, "error", "Ingreso no encontrado en el area seleccionada.");
      return res.redirect("/entries");
    }

    if (entry.deleted_at) {
      setFlash(req, "error", "No puedes reimprimir un ingreso eliminado.");
      return res.redirect("/entries");
    }

    const job = queuePrintJob(entryId, "manual_reprint");

    if (!job) {
      setFlash(req, "error", "No se pudo crear la orden de reimpresion.");
      return res.redirect("/entries");
    }

    triggerPrintWorker();
    setFlash(req, "success", `Reimpresion solicitada para ingreso #${entryId}.`);
    return res.redirect("/entries");
  });

  app.post("/entries/:id/delete", requireAuth, requireAdmin, (req, res) => {
    const entryId = Number(req.params.id);
    const entry = db.get("SELECT id, area FROM entries WHERE id = ?", [entryId]);

    if (!entry || normalizeArea(entry.area) !== getEffectiveArea(req)) {
      setFlash(req, "error", "Ingreso no encontrado en el area seleccionada.");
      return res.redirect("/entries");
    }

    const deleted = markEntryAsDeleted(entryId, req.session.user.id);

    if (!deleted) {
      setFlash(req, "error", "No se pudo eliminar el ingreso.");
      return res.redirect("/entries");
    }

    setFlash(req, "success", `Ingreso #${entryId} eliminado.`);
    return res.redirect("/entries?showDeleted=1");
  });

  app.post("/entries/:id/restore", requireAuth, requireAdmin, (req, res) => {
    const entryId = Number(req.params.id);
    const entry = db.get("SELECT id, area FROM entries WHERE id = ?", [entryId]);

    if (!entry || normalizeArea(entry.area) !== getEffectiveArea(req)) {
      setFlash(req, "error", "Ingreso no encontrado en el area seleccionada.");
      return res.redirect("/entries");
    }

    const restored = restoreDeletedEntry(entryId);

    if (!restored) {
      setFlash(req, "error", "No se pudo restaurar el ingreso.");
      return res.redirect("/entries");
    }

    setFlash(req, "success", `Ingreso #${entryId} restaurado.`);
    return res.redirect("/entries?showDeleted=1");
  });

  app.get("/workers", requireAuth, requireAdmin, (req, res) => {
    const currentArea = getEffectiveArea(req);
    const workers = db.all(
      `SELECT w.*, u.role AS linked_role
       FROM workers w
       LEFT JOIN users u ON u.id = w.user_id
       WHERE w.area = ?
       ORDER BY w.active DESC, w.name ASC`,
      [currentArea]
    );
    res.render("workers", { workers, defaultWorkerPassword });
  });

  app.post("/workers/enroll", requireAuth, requireAdmin, (req, res) => {
    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      const area = normalizeArea(req.body.area || getEffectiveArea(req));

      createOrSyncWorkerAccount({ email, area, role: "user" });
      setFlash(req, "success", `Cuenta y trabajador enrolados para ${email}.`);
      return res.redirect("/workers");
    } catch (error) {
      setFlash(req, "error", error.message || "No se pudo enrolar la cuenta.");
      return res.redirect("/workers");
    }
  });

  app.post("/workers/enroll-bulk", requireAuth, requireAdmin, (req, res) => {
    const area = normalizeArea(req.body.area || getEffectiveArea(req));
    const emails = parseInstitutionalEmails(req.body.emails);

    if (emails.length === 0) {
      setFlash(req, "error", "Pega al menos un correo institucional separado por comas.");
      return res.redirect("/workers");
    }

    const created = [];
    const failed = [];

    emails.forEach((email) => {
      try {
        createOrSyncWorkerAccount({ email, area, role: "user" });
        created.push(email);
      } catch (error) {
        failed.push(`${email}: ${error.message || "error"}`);
      }
    });

    if (created.length > 0 && failed.length === 0) {
      setFlash(req, "success", `Enrolamiento masivo completado: ${created.length} cuentas en ${getAreaLabel(area)}.`);
      return res.redirect("/workers");
    }

    if (created.length > 0) {
      setFlash(req, "success", `Se enrolaron ${created.length} cuentas. Revisa pendientes: ${failed.join(" | ")}`);
      return res.redirect("/workers");
    }

    setFlash(req, "error", `No se pudo enrolar ninguna cuenta: ${failed.join(" | ")}`);
    return res.redirect("/workers");
  });

  app.post("/workers/:id/update", requireAuth, requireAdmin, (req, res) => {
    try {
      const workerId = Number(req.params.id);
      const name = req.body.name?.trim();
      const email = String(req.body.email || "").trim().toLowerCase();
      const area = normalizeArea(req.body.area || getEffectiveArea(req));
      const active = req.body.active === "on" ? 1 : 0;
      const worker = db.get("SELECT * FROM workers WHERE id = ?", [workerId]);

      if (!worker || normalizeArea(worker.area) !== getEffectiveArea(req)) {
        setFlash(req, "error", "Trabajador no encontrado en el area seleccionada.");
        return res.redirect("/workers");
      }

      if (!name || !email) {
        setFlash(req, "error", "Nombre y correo son obligatorios.");
        return res.redirect("/workers");
      }

      db.run(
        `UPDATE workers
         SET name = ?, email = ?, area = ?, active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [name, email, area, active, workerId]
      );

      const passwordHash = bcrypt.hashSync(defaultWorkerPassword, 10);
      const existingUser = db.get("SELECT id FROM users WHERE worker_id = ? OR lower(email) = lower(?)", [
        workerId,
        email,
      ]);

      if (existingUser) {
        db.run(
          `UPDATE users
           SET username = ?, email = ?, password_hash = ?, role = ?, area = ?, worker_id = ?, active = ?
           WHERE id = ?`,
          [email, email, passwordHash, "user", area, workerId, active, Number(existingUser.id)]
        );
        db.run("UPDATE workers SET user_id = ? WHERE id = ?", [Number(existingUser.id), workerId]);
      } else {
        db.run(
          `INSERT INTO users (username, email, password_hash, role, area, worker_id, active)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [email, email, passwordHash, "user", area, workerId, active]
        );
        const newUser = db.get("SELECT id FROM users ORDER BY id DESC LIMIT 1");
        db.run("UPDATE workers SET user_id = ? WHERE id = ?", [Number(newUser.id), workerId]);
      }

      setFlash(req, "success", "Trabajador actualizado.");
      return res.redirect("/workers");
    } catch (error) {
      setFlash(req, "error", error.message || "No se pudo actualizar el trabajador.");
      return res.redirect("/workers");
    }
  });

  app.post("/workers/:id/toggle", requireAuth, requireAdmin, (req, res) => {
    const workerId = Number(req.params.id);
    const worker = db.get("SELECT active, area, user_id FROM workers WHERE id = ?", [workerId]);

    if (!worker || normalizeArea(worker.area) !== getEffectiveArea(req)) {
      setFlash(req, "error", "Trabajador no encontrado.");
      return res.redirect("/workers");
    }

    const nextValue = Number(worker.active) === 1 ? 0 : 1;
    db.run("UPDATE workers SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      nextValue,
      workerId,
    ]);
    if (worker.user_id) {
      db.run("UPDATE users SET active = ? WHERE id = ?", [nextValue, Number(worker.user_id)]);
    }
    setFlash(req, "success", "Estado de trabajador actualizado.");
    return res.redirect("/workers");
  });

  app.get("/settings", requireAuth, requireAdmin, (req, res) => {
    res.render("settings", {
      settings: getAppSettings(),
    });
  });

  app.post("/settings", requireAuth, requireAdmin, upload.single("mailBanner"), (req, res) => {
    const currentSettings = getAppSettings();
    const nextSettings = {
      pending_action_days: String(toPositiveInteger(req.body.pendingActionDays, 4)),
      deadline_days_after_pending: String(toPositiveInteger(req.body.deadlineDaysAfterPending, 3)),
      urgent_days_after_deadline: String(toPositiveInteger(req.body.urgentDaysAfterDeadline, 1)),
      diagnostic_min_days: String(toPositiveInteger(req.body.diagnosticMinDays, 5)),
      diagnostic_max_days: String(toPositiveInteger(req.body.diagnosticMaxDays, 7)),
      mail_info_text: req.body.mailInfoText?.trim() || "",
      mail_banner_path: currentSettings.mail_banner_path || "",
    };

    if (req.body.removeMailBanner === "on" && currentSettings.mail_banner_path) {
      const previousBannerPath = path.resolve(rootDir, currentSettings.mail_banner_path);
      if (fs.existsSync(previousBannerPath)) {
        fs.unlinkSync(previousBannerPath);
      }
      nextSettings.mail_banner_path = "";
    }

    if (req.file) {
      if (currentSettings.mail_banner_path) {
        const previousBannerPath = path.resolve(rootDir, currentSettings.mail_banner_path);
        if (fs.existsSync(previousBannerPath)) {
          fs.unlinkSync(previousBannerPath);
        }
      }

      nextSettings.mail_banner_path = path.posix.join("uploads", path.basename(req.file.path));
    }

    db.setAppSettings(nextSettings);
    setFlash(req, "success", "Configuracion actualizada. Los nuevos plazos aplicaran a ingresos creados desde ahora.");
    return res.redirect("/settings");
  });

  app.get("/notifications", requireAuth, requireAdmin, (req, res) => {
    const currentArea = getEffectiveArea(req);
    const notifications = db.all(
      `SELECT
         n.id,
         n.title,
         n.message,
         n.notification_type,
         n.due_at,
         n.read_at,
         e.id AS entry_id,
         e.business_name,
         e.worker_name_snapshot,
         e.created_at
       FROM notifications n
       JOIN entries e ON e.id = n.entry_id
       WHERE e.area = ?
       AND datetime(n.due_at) <= datetime('now')
       ORDER BY n.read_at IS NOT NULL ASC, datetime(n.due_at) DESC, n.id DESC`
      ,
      [currentArea]
    );

    res.render("notifications", { notifications });
  });

  app.post("/notifications/:id/read", requireAuth, requireAdmin, (req, res) => {
    db.run("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ?", [Number(req.params.id)]);
    setFlash(req, "success", "Notificacion marcada como revisada.");
    return res.redirect("/notifications");
  });

  app.use((req, res) => {
    res.status(404).render("not-found");
  });

  app.listen(port, () => {
    console.log(`Registro Ingresos Antalis Abitek disponible en http://localhost:${port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Error al iniciar la aplicacion:", error);
  process.exit(1);
});
