const net = require("net");

function buildEntryZpl(entry) {
  return [
    "^XA",
    "^CI28",
    "^PW812",
    "^LL1218",
    "^FO40,40^A0N,42,42^FDSoftST / Antalis Abitek^FS",
    "^FO40,95^A0N,34,34^FDIngreso #" + entry.id + "^FS",
    "^FO40,150^A0N,28,28^FDEmpresa: " + sanitize(entry.business_name) + "^FS",
    "^FO40,195^A0N,28,28^FDContacto: " + sanitize(entry.contact_name) + "^FS",
    "^FO40,240^A0N,28,28^FDEquipo: " + sanitize(entry.equipment_model) + "^FS",
    "^FO40,285^A0N,28,28^FDSerie: " + sanitize(entry.serial_number || "-") + "^FS",
    "^FO40,330^A0N,28,28^FDIngresado por: " + sanitize(entry.worker_name_snapshot) + "^FS",
    "^FO40,385^A0N,28,28^FDRUT: " + sanitize(entry.rut) + "^FS",
    "^FO40,440^A0N,28,28^FDFecha: " + sanitize(entry.created_at) + "^FS",
    "^FO40,510^A0N,26,26^FDReporte cliente:^FS",
    "^FO40,545^FB720,4,8,L,0^A0N,26,26^FD" + sanitize(entry.client_report || "-") + "^FS",
    "^FO40,700^A0N,26,26^FDDetalle y accesorios:^FS",
    "^FO40,735^FB720,4,8,L,0^A0N,26,26^FD" + sanitize(entry.details_accessories || "-") + "^FS",
    "^XZ",
  ].join("\n");
}

function sanitize(value) {
  return String(value || "")
    .replace(/[\^~]/g, " ")
    .replace(/\r?\n/g, " ")
    .trim();
}

function sendZplToPrinter({ host, port, zpl }) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let finished = false;

    const done = (callback, value) => {
      if (finished) {
        return;
      }
      finished = true;
      socket.destroy();
      callback(value);
    };

    socket.setTimeout(8000);
    socket.connect(Number(port), host, () => {
      socket.write(zpl, "utf8", (error) => {
        if (error) {
          done(reject, error);
          return;
        }
        done(resolve, true);
      });
    });

    socket.on("error", (error) => done(reject, error));
    socket.on("timeout", () => done(reject, new Error("Timeout al conectar con la impresora")));
  });
}

module.exports = {
  buildEntryZpl,
  sendZplToPrinter,
};
