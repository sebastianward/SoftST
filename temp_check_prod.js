const DatabaseService = require('/app/src/services/db');
(async()=>{
  const db = new DatabaseService({ dbPath: '/app/data/app.sqlite' });
  await db.init([]);
  console.log('COUNT=' + db.get('SELECT COUNT(*) AS count FROM workers').count);
  const rows = db.all('SELECT name FROM workers ORDER BY name ASC LIMIT 5');
  console.log(JSON.stringify(rows));
})().catch((e)=>{ console.error(e); process.exit(1); });
