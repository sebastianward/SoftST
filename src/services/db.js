const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");
const bcrypt = require("bcryptjs");

class DatabaseService {
  constructor(options) {
    this.dbPath = options.dbPath;
    this.SQL = null;
    this.db = null;
  }

  async init(seedConfig) {
    this.SQL = await initSqlJs({});
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(fileBuffer);
    } else {
      this.db = new this.SQL.Database();
    }

    this.createSchema();
    this.runMigrations();
    this.seedUsers(seedConfig);
    this.persist();
  }

  createSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'operator', 'user')),
        area TEXT,
        worker_id INTEGER,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(worker_id) REFERENCES workers(id)
      );

      CREATE TABLE IF NOT EXISTS workers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        area TEXT NOT NULL DEFAULT 'servicio_tecnico',
        user_id INTEGER,
        code TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_name TEXT NOT NULL,
        rut TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        contact_email TEXT,
        contact_phone TEXT,
        ownership TEXT,
        branch_office TEXT,
        equipment_model TEXT NOT NULL,
        serial_number TEXT,
        client_report TEXT NOT NULL,
        details_accessories TEXT,
        entry_status TEXT NOT NULL DEFAULT 'no_asignado',
        sap_code TEXT,
        comment TEXT,
        diagnostic_task TEXT,
        final_task TEXT,
        quotation TEXT,
        purchase_order TEXT,
        area TEXT NOT NULL DEFAULT 'servicio_tecnico',
        worker_id INTEGER NOT NULL,
        worker_name_snapshot TEXT NOT NULL,
        image_paths TEXT NOT NULL DEFAULT '[]',
        deleted_at TEXT,
        deleted_by_user_id INTEGER,
        notification_read INTEGER NOT NULL DEFAULT 0,
        created_by_user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(worker_id) REFERENCES workers(id),
        FOREIGN KEY(created_by_user_id) REFERENCES users(id),
        FOREIGN KEY(deleted_by_user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL,
        notification_type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        due_at TEXT NOT NULL,
        read_at TEXT,
        emailed_at TEXT,
        email_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(entry_id, notification_type),
        FOREIGN KEY(entry_id) REFERENCES entries(id)
      );

      CREATE TABLE IF NOT EXISTS print_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL,
        printer_name TEXT NOT NULL,
        printer_mode TEXT NOT NULL DEFAULT 'zpl',
        status TEXT NOT NULL DEFAULT 'pending',
        reason TEXT NOT NULL,
        zpl_content TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        processed_at TEXT,
        FOREIGN KEY(entry_id) REFERENCES entries(id)
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        area TEXT NOT NULL DEFAULT 'servicio_tecnico',
        is_replacement INTEGER NOT NULL DEFAULT 0,
        assigned_worker_id INTEGER,
        assigned_worker_name_snapshot TEXT,
        assigned_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(assigned_worker_id) REFERENCES workers(id)
      );

      CREATE TABLE IF NOT EXISTS vehicle_assignment_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER NOT NULL,
        vehicle_name_snapshot TEXT NOT NULL,
        worker_id INTEGER NOT NULL,
        worker_name_snapshot TEXT NOT NULL,
        area TEXT NOT NULL DEFAULT 'servicio_tecnico',
        shift_key TEXT NOT NULL,
        assigned_at TEXT NOT NULL,
        unassigned_at TEXT,
        unassigned_reason TEXT,
        assigned_by_user_id INTEGER,
        FOREIGN KEY(vehicle_id) REFERENCES vehicles(id),
        FOREIGN KEY(worker_id) REFERENCES workers(id),
        FOREIGN KEY(assigned_by_user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS vehicle_activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        area TEXT NOT NULL DEFAULT 'servicio_tecnico',
        vehicle_id INTEGER,
        vehicle_name_snapshot TEXT,
        worker_id INTEGER,
        worker_name_snapshot TEXT,
        event_type TEXT NOT NULL,
        event_label TEXT NOT NULL,
        details TEXT,
        shift_key TEXT,
        actor_user_id INTEGER,
        actor_username_snapshot TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(vehicle_id) REFERENCES vehicles(id),
        FOREIGN KEY(worker_id) REFERENCES workers(id),
        FOREIGN KEY(actor_user_id) REFERENCES users(id)
      );
    `);
  }

  runMigrations() {
    this.migrateUsersRoleConstraint();
    this.migrateEntryStatuses();
    this.ensureColumn("users", "email", "TEXT");
    this.ensureColumn("users", "area", "TEXT");
    this.ensureColumn("users", "worker_id", "INTEGER");
    this.ensureColumn("workers", "email", "TEXT");
    this.ensureColumn("workers", "area", "TEXT NOT NULL DEFAULT 'servicio_tecnico'");
    this.ensureColumn("workers", "user_id", "INTEGER");
    this.ensureColumn("entries", "entry_status", "TEXT NOT NULL DEFAULT 'no_asignado'");
    this.ensureColumn("entries", "sap_code", "TEXT");
    this.ensureColumn("entries", "comment", "TEXT");
    this.ensureColumn("entries", "diagnostic_task", "TEXT");
    this.ensureColumn("entries", "final_task", "TEXT");
    this.ensureColumn("entries", "quotation", "TEXT");
    this.ensureColumn("entries", "purchase_order", "TEXT");
    this.ensureColumn("entries", "area", "TEXT NOT NULL DEFAULT 'servicio_tecnico'");
    this.ensureColumn("entries", "deleted_at", "TEXT");
    this.ensureColumn("entries", "deleted_by_user_id", "INTEGER");
    this.ensureColumn("notifications", "emailed_at", "TEXT");
    this.ensureColumn("notifications", "email_error", "TEXT");
    this.ensureColumn("vehicles", "area", "TEXT NOT NULL DEFAULT 'servicio_tecnico'");
    this.ensureColumn("vehicles", "is_replacement", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("vehicles", "assigned_worker_id", "INTEGER");
    this.ensureColumn("vehicles", "assigned_worker_name_snapshot", "TEXT");
    this.ensureColumn("vehicles", "assigned_at", "TEXT");
    this.createUniqueIndexes();
    this.backfillLegacyAreas();
  }

  migrateEntryStatuses() {
    this.db.run(`
      UPDATE entries
      SET entry_status = CASE entry_status
        WHEN 'estado_1' THEN 'no_asignado'
        WHEN 'estado_2' THEN 'no_asignado'
        WHEN 'estado_3' THEN 'espera_oc'
        ELSE entry_status
      END
    `);
  }

  migrateUsersRoleConstraint() {
    const tableInfo = this.get(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'"
    );

    if (!tableInfo?.sql || tableInfo.sql.includes("'operator'")) {
      return;
    }

    this.db.run(`
      ALTER TABLE users RENAME TO users_legacy;

      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'operator', 'user')),
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO users (id, username, password_hash, role, active, created_at)
      SELECT id, username, password_hash, role, active, created_at
      FROM users_legacy;

      DROP TABLE users_legacy;
    `);
  }

  ensureColumn(tableName, columnName, columnDefinition) {
    const columns = this.all(`PRAGMA table_info(${tableName})`);
    const exists = columns.some((column) => column.name === columnName);

    if (!exists) {
      this.db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    }
  }

  createUniqueIndexes() {
    this.db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
      ON users(email)
      WHERE email IS NOT NULL AND trim(email) != '';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_email_unique
      ON workers(email)
      WHERE email IS NOT NULL AND trim(email) != '';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_name_area_unique
      ON vehicles(area, name);
    `);
  }

  backfillLegacyAreas() {
    this.db.run(`
      UPDATE workers
      SET area = 'servicio_tecnico'
      WHERE area IS NULL OR trim(area) = '';

      UPDATE users
      SET area = 'servicio_tecnico'
      WHERE role != 'admin' AND (area IS NULL OR trim(area) = '');

      UPDATE entries
      SET area = 'servicio_tecnico'
      WHERE area IS NULL OR trim(area) = '';

      UPDATE vehicles
      SET area = 'servicio_tecnico'
      WHERE area IS NULL OR trim(area) = '';
    `);
  }

  seedUsers(seedConfig) {
    for (const user of seedConfig) {
      const existing = this.get(
        "SELECT id, email, area, worker_id FROM users WHERE username = ?",
        [user.username]
      );

      const passwordHash = bcrypt.hashSync(user.password, 10);
      const nextEmail = user.email ?? existing?.email ?? null;
      const nextArea =
        Object.prototype.hasOwnProperty.call(user, "area")
          ? user.area
          : (existing?.area ?? null);
      const nextWorkerId =
        Object.prototype.hasOwnProperty.call(user, "workerId")
          ? user.workerId
          : (existing?.worker_id ?? null);

      if (!existing) {
        this.run(
          "INSERT INTO users (username, email, password_hash, role, area, worker_id, active) VALUES (?, ?, ?, ?, ?, ?, 1)",
          [user.username, nextEmail, passwordHash, user.role, nextArea, nextWorkerId]
        );
      } else {
        this.run(
          "UPDATE users SET email = ?, password_hash = ?, role = ?, area = ?, worker_id = ?, active = 1 WHERE username = ?",
          [nextEmail, passwordHash, user.role, nextArea, nextWorkerId, user.username]
        );
      }
    }
  }

  persist() {
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  run(sql, params = []) {
    this.db.run(sql, params);
    this.persist();
  }

  all(sql, params = []) {
    const statement = this.db.prepare(sql, params);
    const rows = [];

    while (statement.step()) {
      rows.push(statement.getAsObject());
    }

    statement.free();
    return rows;
  }

  get(sql, params = []) {
    const statement = this.db.prepare(sql, params);
    const hasRow = statement.step();
    const row = hasRow ? statement.getAsObject() : null;
    statement.free();
    return row;
  }

  getAppSettings(defaults = {}) {
    const rows = this.all("SELECT setting_key, setting_value FROM app_settings");
    const values = { ...defaults };

    rows.forEach((row) => {
      values[row.setting_key] = row.setting_value;
    });

    return values;
  }

  setAppSettings(settings = {}) {
    Object.entries(settings).forEach(([key, value]) => {
      this.run(
        `INSERT INTO app_settings (setting_key, setting_value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(setting_key) DO UPDATE SET
           setting_value = excluded.setting_value,
           updated_at = CURRENT_TIMESTAMP`,
        [key, String(value ?? "")]
      );
    });
  }
}

module.exports = DatabaseService;
