const fs = require("fs/promises");
const net = require("net");

const ENTRY_ZPL_TEMPLATE = [
  "^XA",
  "^CI28",
  "^PW800",
  "^LL400",
  "^LH0,0",
  "^FO80,72^A0N,22,22^FDIngreso #@entry_id^FS",
  "^FO520,72^A0N,28,28^FD@created_at^FS",
  "^FO80,100^GB640,2,2^FS",
  "^FO80,114^A0N,30,30^FDRazon social:^FS",
  "^FO80,146^A0N,40,40^FD@business_name_1^FS",
  "^FO80,190^A0N,40,40^FD@business_name_2^FS",
  "^FO420,114^A0N,18,18^FDContacto:^FS",
  "^FO420,142^A0N,22,22^FD@contact_name_1^FS",
  "^FO420,168^A0N,22,22^FD@contact_name_2^FS",
  "^FO80,246^A0N,30,30^FDEquipo:^FS",
  "^FO80,278^A0N,40,40^FD@equipment_model_1^FS",
  "^FO80,322^A0N,40,40^FD@equipment_model_2^FS",
  "^FO420,246^A0N,30,30^FDSerie:^FS",
  "^FO420,278^A0N,40,40^FD@serial_number_1^FS",
  "^FO420,322^A0N,40,40^FD@serial_number_2^FS",
  "^FO80,366^A0N,18,18^FDIngresado por:^FS",
  "^FO80,386^A0N,14,14^FD@worker_name_single^FS",
  "^XZ",
].join("\n");

function buildEntryZpl(entry) {
  const replacements = {
    "@entry_id": sanitize(entry.id),
    "@created_at": sanitize(formatDate(entry.created_at)),
    "@worker_name_single": sanitize(entry.worker_name_snapshot),
    ...buildWrappedFieldReplacements("business_name", entry.business_name, 11, 2),
    ...buildWrappedFieldReplacements("contact_name", entry.contact_name, 20, 2),
    ...buildWrappedFieldReplacements("equipment_model", entry.equipment_model, 11, 2),
    ...buildWrappedFieldReplacements("serial_number", entry.serial_number || "-", 9, 2),
    ...buildWrappedFieldReplacements("worker_name_snapshot", entry.worker_name_snapshot, 36, 2),
  };

  return Object.entries(replacements).reduce(
    (template, [token, value]) => template.replaceAll(token, value),
    ENTRY_ZPL_TEMPLATE
  );
}

function buildWrappedFieldReplacements(key, value, wrapAt, maxLines) {
  const wrapped = wrapText(value, wrapAt)
    .slice(0, maxLines)
    .map((line, index, array) =>
      index === array.length - 1 ? withEllipsis(line, value, wrapAt, maxLines, index) : line
    );

  const replacements = {};
  for (let index = 0; index < maxLines; index += 1) {
    replacements[`@${key}_${index + 1}`] = sanitize(wrapped[index] || "");
  }
  return replacements;
}

function wrapText(value, maxChars) {
  const normalized = sanitize(value || "-");
  const paragraphs = normalized.split(/\s+/).filter(Boolean);

  if (paragraphs.length === 0) {
    return ["-"];
  }

  const wrapped = [];
  let current = "";

  paragraphs.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      return;
    }

    if (current) {
      wrapped.push(current);
    }

    if (word.length <= maxChars) {
      current = word;
      return;
    }

    let index = 0;
    while (index < word.length) {
      wrapped.push(word.slice(index, index + maxChars));
      index += maxChars;
    }
    current = "";
  });

  if (current) {
    wrapped.push(current);
  }

  return wrapped;
}

function sanitize(value) {
  return String(value || "")
    .replace(/[\^~]/g, " ")
    .replace(/\r?\n/g, " ")
    .trim();
}

function formatDate(value) {
  return String(value || "").replace("T", " ").replace("Z", "");
}

function withEllipsis(line, originalValue, wrapAt, maxLines, index) {
  const totalLines = wrapText(originalValue, wrapAt);
  const isTruncated = totalLines.length > maxLines && index === maxLines - 1;
  if (!isTruncated) {
    return line;
  }
  return line.length > 3 ? `${line.slice(0, Math.max(0, line.length - 3))}...` : `${line}...`;
}

function resolveDevicePath(devicePath) {
  if (process.platform === "linux" && devicePath.startsWith("/dev/") && require("fs").existsSync("/host-dev")) {
    const target = "/host-dev/" + devicePath.slice(5);
    try {
      if (require("fs").lstatSync(target).isSymbolicLink()) {
        const link = require("fs").readlinkSync(target);
        const resolved = require("path").resolve(require("path").dirname(target), link);
        return resolved.startsWith("/dev/") ? "/host-dev" + resolved.slice(4) : resolved;
      }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    return target;
  }
  return devicePath;
}

async function listPrinterDevices() {
  const devices = [];
  if (process.platform === "linux") {
    // En Docker, /dev del servidor esta montado en /host-dev.
    const root = require("fs").existsSync("/host-dev") ? "/host-dev" : "/dev";
    const scan = async (directory, pattern, mode, prefix) => {
      let names;
      try { names = await fs.readdir(directory); }
      catch (error) { if (error.code === "ENOENT") return; throw error; }
      for (const name of names.filter(name => pattern.test(name)).sort()) {
        const target = require("path").join(directory, name);
        try {
          // by-id contiene enlaces absolutos del host: resolverlos dentro del montaje.
          const info = await fs.lstat(target);
          let actual = target;
          if (info.isSymbolicLink()) {
            const link = await fs.readlink(target);
            actual = require("path").resolve(directory, link);
            if (root === "/host-dev" && actual.startsWith("/dev/")) actual = root + actual.slice(4);
          }
          if (!(await fs.stat(actual)).isCharacterDevice()) continue;
          devices.push({ mode, path: prefix + name, label: name });
        } catch (error) { if (!["ENOENT", "ENODEV"].includes(error.code)) throw error; }
      }
    };
    await scan(root + "/usb", /^lp[0-9]+$/, "usb", "/dev/usb/");
    await scan(root, /^tty(USB|ACM|S|AMA)[0-9]+$/, "serial", "/dev/");
    await scan(root + "/serial/by-id", /./, "serial", "/dev/serial/by-id/");
  } else {
    const { SerialPort } = require("serialport");
    for (const port of await SerialPort.list()) {
      devices.push({mode:"serial", path:port.path, label:[port.path, port.manufacturer, port.serialNumber].filter(Boolean).join(" - ")});
    }
  }
  return devices;
}

async function checkPrinterConnection(printer) {
  if (printer.mode === "tcp") {
    if (!printer.host || /[\s/]/.test(printer.host) || !Number.isInteger(Number(printer.port)) || Number(printer.port) < 1 || Number(printer.port) > 65535) {
      return { available: false, message: "Configura una IP y un puerto validos." };
    }
    return new Promise(resolve => {
      const socket = new net.Socket();
      let finished = false;
      const done = (available, message) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        socket.destroy();
        resolve({ available, message });
      };
      // Limite total: incluye tambien la resolucion del nombre de red.
      const timer = setTimeout(() => done(false, "Sin conexion: tiempo de espera agotado."), 3000);
      socket.once("error", () => done(false, "Sin conexion con la IP y el puerto configurados."));
      socket.connect(Number(printer.port), printer.host, () => done(true, "Conexion disponible en el puerto de impresion."));
    });
  }
  if (!["usb", "serial"].includes(printer.mode)) return {available:false, message:"Selecciona un tipo de conexion."};
  if (!printer.devicePath) return {available:false, message:"Selecciona un dispositivo."};
  try {
    const devices = await listPrinterDevices();
    if (!devices.some(device => device.mode === printer.mode && device.path === printer.devicePath)) {
      return {available:false, message:printer.mode === "usb" ? "USB no disponible: impresora desconectada." : "COM no disponible: puerto desconectado."};
    }
    return {available:true, message:"Dispositivo detectado. El resultado de los envios aparece en la cola."};
  } catch {
    return {available:false, message:"No se pudo consultar el dispositivo."};
  }
}

async function sendZplToPrinter({ mode, host, port, devicePath, zpl, baudRate = 9600, dataBits = 8, stopBits = 1, parity = "none", rtscts = false }) {
  if (mode === "serial") {
    const { SerialPort } = require("serialport");
    return new Promise((resolve, reject) => {
      const serial = new SerialPort({ path: resolveDevicePath(devicePath), baudRate, dataBits, stopBits, parity, rtscts, autoOpen: false });
      let finished = false;
      const done = (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (serial.isOpen) serial.close(() => {});
        error ? reject(error) : resolve(true);
      };
      const timer = setTimeout(() => done(new Error("Timeout de impresora serial")), 8000);
      serial.on("error", done);
      serial.on("close", () => { if (!finished) done(new Error("Impresora serial desconectada")); });
      serial.open((error) => {
        if (finished) { if (!error && serial.isOpen) serial.close(() => {}); return; }
        if (error) return done(error);
        serial.write(zpl, "utf8", (error) => {
          if (finished) return;
          if (error) return done(error);
          serial.drain(done);
        });
      });
    });
  }
  if (!["usb", "tcp"].includes(mode || "tcp")) throw new Error("Modo de impresora no valido");
  if ((mode || "tcp") === "usb") {
    const target = resolveDevicePath(devicePath || "/dev/usb/lp0");
    // Nunca crear un archivo si el dispositivo ha desaparecido.
    const handle = await fs.open(target, require("fs").constants.O_WRONLY | require("fs").constants.O_NONBLOCK);
    try {
      const stat = await handle.stat();
      if (!stat.isCharacterDevice()) throw new Error("La ruta no es un dispositivo de impresora");
      const data = Buffer.from(zpl, "utf8");
      let offset = 0;
      while (offset < data.length) {
        const { bytesWritten } = await handle.write(data, offset, data.length - offset);
        if (!bytesWritten) throw new Error("La impresora no acepta datos");
        offset += bytesWritten;
      }
    } finally {
      await handle.close();
    }
    return true;
  }

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
  ENTRY_ZPL_TEMPLATE,
  buildEntryZpl,
  sendZplToPrinter,
  listPrinterDevices,
  checkPrinterConnection,
};
