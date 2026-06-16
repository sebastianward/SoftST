const fs = require('fs');
const DatabaseService = require('/app/src/services/db');
(async () => {
  const source = JSON.parse(fs.readFileSync('/app/tmp_workers_sync.json', 'utf8'));
  const db = new DatabaseService({ dbPath: '/app/data/app.sqlite' });
  await db.init([]);
  const existing = db.all('SELECT id, name FROM workers');
  const byLower = new Map(existing.map((worker) => [worker.name.toLowerCase(), worker]));
  let inserted = 0;
  let updated = 0;
  for (const worker of source) {
    const current = byLower.get(String(worker.name).toLowerCase());
    if (current) {
      db.run('UPDATE workers SET name = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [worker.name, worker.active ? 1 : 0, current.id]);
      updated += 1;
    } else {
      db.run("INSERT INTO workers (name, code, active, updated_at) VALUES (?, '', ?, CURRENT_TIMESTAMP)", [worker.name, worker.active ? 1 : 0]);
      inserted += 1;
    }
  }
  const finalCount = db.get('SELECT COUNT(*) AS count FROM workers').count;
  console.log(JSON.stringify({ inserted, updated, finalCount }, null, 2));
})();