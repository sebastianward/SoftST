const fs = require("fs/promises");
const net = require("net");

function buildEntryZpl(entry) {
  const lines = [
    "^XA",
    "^CI28",
    "^PW812",
    "^LL2400",
    "^LH0,0",
    "^FO30,25^GB752,2,2^FS",
    "^FO40,45^A0N,42,42^FDSoftST / Antalis Abitek^FS",
    "^FO40,95^A0N,30,30^FDIngreso #" + sanitize(entry.id) + "^FS",
    "^FO520,45^BY2,2,70^BCN,70,Y,N,N^FDING-" + sanitize(entry.id) + "^FS",
  ];

  let y = 205;
  const left = 40;
  const width = 720;

  const fields = [
    ["Razon social", entry.business_name],
    ["R.U.T.", entry.rut],
    ["Contacto", entry.contact_name],
    ["Correo", entry.contact_email || "-"],
    ["Telefono", entry.contact_phone || "-"],
    ["Propiedad", entry.ownership || "-"],
    ["Sucursal", entry.branch_office || "-"],
    ["Equipo (marca y modelo)", entry.equipment_model],
    ["Serie", entry.serial_number || "-"],
    ["Ingresado por", entry.worker_name_snapshot],
    ["Imagenes cargadas", String(entry.image_count || 0)],
    ["Fecha de ingreso", formatDate(entry.created_at)],
  ];

  fields.forEach(([label, value]) => {
    y = pushFieldBlock(lines, {
      y,
      label,
      value,
      x: left,
      width,
      labelHeight: 28,
      valueHeight: 28,
      lineGap: 8,
      blockGap: 14,
      wrapAt: 42,
    });
  });

  y += 8;
  lines.push(`^FO${left},${y}^GB${width},2,2^FS`);
  y += 22;

  y = pushSection(lines, {
    y,
    title: "Reporte del cliente",
    value: entry.client_report || "-",
    x: left,
    width,
    wrapAt: 48,
    maxLines: 8,
  });

  y = pushSection(lines, {
    y,
    title: "Detalle y accesorios",
    value: entry.details_accessories || "-",
    x: left,
    width,
    wrapAt: 48,
    maxLines: 8,
  });

  lines.push("^XZ");
  return lines.join("\n");
}

function pushFieldBlock(lines, options) {
  const wrappedLines = wrapText(options.value, options.wrapAt);
  lines.push(
    `^FO${options.x},${options.y}^A0N,${options.labelHeight},${options.labelHeight}^FD${sanitize(options.label)}:^FS`
  );

  let cursorY = options.y + options.labelHeight + options.lineGap;
  wrappedLines.forEach((line) => {
    lines.push(
      `^FO${options.x},${cursorY}^A0N,${options.valueHeight},${options.valueHeight}^FD${sanitize(line)}^FS`
    );
    cursorY += options.valueHeight + 4;
  });

  return cursorY + options.blockGap;
}

function pushSection(lines, options) {
  lines.push(`^FO${options.x},${options.y}^A0N,30,30^FD${sanitize(options.title)}:^FS`);
  let cursorY = options.y + 40;

  wrapText(options.value, options.wrapAt)
    .slice(0, options.maxLines)
    .forEach((line) => {
      lines.push(`^FO${options.x},${cursorY}^A0N,26,26^FD${sanitize(line)}^FS`);
      cursorY += 32;
    });

  return cursorY + 18;
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

async function sendZplToPrinter({ mode, host, port, devicePath, zpl }) {
  if ((mode || "tcp") === "usb") {
    const target = devicePath || "/dev/usb/lp0";
    await fs.writeFile(target, zpl, { encoding: "utf8" });
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
  buildEntryZpl,
  sendZplToPrinter,
};
