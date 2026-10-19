const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const vm = require('node:vm');
const { sendZplToPrinter } = require('../src/services/print');
const Database = require('../src/services/db');

test('USB ausente no crea archivo; archivo normal no se modifica', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'softst-print-'));
  const devicePath = path.join(dir, 'missing');
  try {
    await assert.rejects(sendZplToPrinter({mode:'usb', devicePath, zpl:'^XA^XZ'}));
    assert.equal(fs.existsSync(devicePath), false);
    fs.writeFileSync(devicePath, 'original');
    await assert.rejects(sendZplToPrinter({mode:'usb', devicePath, zpl:'^XA^XZ'}));
    assert.equal(fs.readFileSync(devicePath, 'utf8'), 'original');
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});

test('Ethernet recibe ZPL y puerto cerrado produce error', async () => {
  let received = '';
  const server = net.createServer(socket => socket.on('data', data => { received += data; }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await sendZplToPrinter({mode:'tcp',host:'127.0.0.1',port,zpl:'^XA^XZ'});
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(received,'^XA^XZ');
  await new Promise(resolve => server.close(resolve));
  await assert.rejects(sendZplToPrinter({mode:'tcp',host:'127.0.0.1',port,zpl:'test'}));
});

test('serial ausente rechaza sin derribar el proceso', async () => {
  await assert.rejects(sendZplToPrinter({mode:'serial',devicePath:process.platform === 'win32' ? 'COM9999' : '/dev/ttyUSB9999',zpl:'test'}));
});

test('cola persistente: desconexion, orden, recuperacion y pausa', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'softst-queue-'));
  try {
    const db = new Database({dbPath:path.join(dir,'app.sqlite')});
    await db.init([]);
    for (const id of [1,2]) db.run("INSERT INTO print_jobs (entry_id,printer_name,reason,zpl_content) VALUES (?, 'test', 'test', ?)",[id,`job${id}`]);
    let connected = false;
    let enabled = true;
    const sent = [];
    const source = fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
    const worker = source.slice(source.indexOf('async function processPendingPrintJobs()'),source.indexOf('async function bootstrap()'));
    const ctx = vm.createContext({db, getPrinterSettings:()=>({enabled,mode:'tcp',host:'test'}),sendZplToPrinter:async ({zpl})=>{if(!connected) throw Error('offline'); sent.push(zpl);}});
    vm.runInContext('let printWorkerRunning = false;\n'+worker,ctx);
    await ctx.processPendingPrintJobs();
    assert.equal(db.get('SELECT status FROM print_jobs WHERE id=1').status,'pending');
    assert.equal(db.get('SELECT attempts FROM print_jobs WHERE id=2').attempts,0);
    const reopened = new Database({dbPath:path.join(dir,'app.sqlite')});
    await reopened.init([]);
    assert.equal(reopened.get('SELECT status FROM print_jobs WHERE id=1').status,'pending');
    connected = true; enabled = false;
    await ctx.processPendingPrintJobs();
    assert.deepEqual(sent,[]);
    enabled = true;
    await Promise.all([ctx.processPendingPrintJobs(),ctx.processPendingPrintJobs()]);
    assert.deepEqual(sent,['job1','job2']);
    assert.equal(db.get("SELECT COUNT(*) AS n FROM print_jobs WHERE status='printed'").n,2);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
const { spawn } = require('node:child_process');
test('web inicia sin impresora y admin guarda configuracion persistente', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'softst-web-'));
  const probe = net.createServer();
  await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port = probe.address().port;
  await new Promise(resolve=>probe.close(resolve));
  const child = spawn(process.execPath,['src/app.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),DATA_DIR:path.join(dir,'data'),UPLOAD_DIR:path.join(dir,'uploads'),PRINT_ENABLED:'true',PRINTER_MODE:'usb',PRINTER_DEVICE:'/dev/usb/lp9999',ADMIN_USERNAME:'testadmin',ADMIN_PASSWORD:'testpassword',MAIL_ENABLED:'false',SESSION_SECRET:'test-secret',NODE_ENV:'test'},stdio:'ignore'});
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for(let i=0;i<60;i++) {try { const r=await fetch(base+'/login'); if(r.ok){ready=true;break;} } catch {} await new Promise(resolve=>setTimeout(resolve,100));}
    assert.equal(ready,true);
    const login = await fetch(base+'/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'testadmin',password:'testpassword'})});
    const cookie = login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
    assert.equal(login.status,302);
    let page = await fetch(base+'/settings',{headers:{cookie}});
    assert.equal(page.status,200);
    assert.match(await page.text(),/Serial \/ COM/);
    const save = await fetch(base+'/settings/printer',{method:'POST',redirect:'manual',headers:{cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({mode:'serial',devicePath:'COM7',host:'',port:'9100',baudRate:'19200',dataBits:'8',stopBits:'1',parity:'none'})});
    assert.equal(save.status,302);
    page = await fetch(base+'/settings',{headers:{cookie}});
    assert.match(await page.text(),/value="COM7"/);
    const stored = new Database({dbPath:path.join(dir,'data','app.sqlite')});await stored.init([]);
    assert.equal(stored.getAppSettings({}).printer_baud,'19200');
    assert.equal(stored.getAppSettings({}).printer_enabled,'false');
    await fetch(base+'/settings/printer',{method:'POST',redirect:'manual',headers:{cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({mode:'serial',devicePath:'../../bad',port:'9100',baudRate:'19200',dataBits:'8',stopBits:'1',parity:'none'})});
    page = await fetch(base+'/settings',{headers:{cookie}});
    assert.match(await page.text(),/value="COM7"/);
    const anonymous = await fetch(base+'/settings/printer',{method:'POST',redirect:'manual'});
    assert.equal(anonymous.headers.get('location'),'/login');
  } finally { child.kill(); await new Promise(resolve=>child.once('exit',resolve)); fs.rmSync(dir,{recursive:true,force:true}); }
});
test('serial aplica parametros y espera drain antes de cerrar', async () => {
  const { EventEmitter } = require('node:events');
  let options; const actions=[];
  class FakeSerial extends EventEmitter {
    constructor(value){super();options=value;this.isOpen=false;}
    open(cb){this.isOpen=true;cb();}
    write(zpl,encoding,cb){actions.push(zpl);cb();}
    drain(cb){actions.push('drain');cb();}
    close(cb){actions.push('close');this.isOpen=false;cb();}
  }
  const source=fs.readFileSync(path.join(__dirname,'../src/services/print.js'),'utf8');
  const context=vm.createContext({require:name=>name==='serialport'?{SerialPort:FakeSerial}:require(name),module:{exports:{}},process,Buffer,setTimeout,clearTimeout});
  vm.runInContext(source,context);
  await context.module.exports.sendZplToPrinter({mode:'serial',devicePath:'COM3',baudRate:19200,dataBits:7,stopBits:2,parity:'even',rtscts:true,zpl:'^XA^XZ'});
  assert.equal(options.baudRate,19200);assert.equal(options.dataBits,7);assert.equal(options.stopBits,2);assert.equal(options.parity,'even');assert.equal(options.rtscts,true);
  assert.deepEqual(actions,['^XA^XZ','drain','close']);
});
