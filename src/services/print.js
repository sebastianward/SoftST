const fs = require("fs/promises");
const net = require("net");

function buildEntryZpl(entry) {
  const lines = [
    "^XA",
    "^CI28",
    "^PW812",
    "^LL560",
    "^LH0,0",
    "^FO24,18^GB764,2,2^FS",
    "^FO32,28^A0N,28,28^FDSoftST / Antalis Abitek^FS",
    "^FO32,62^A0N,24,24^FDIngreso #" + sanitize(entry.id) + "^FS",
    "^FO530,24^BY2,2,46^BCN,46,N,N,N^FDING-" + sanitize(entry.id) + "^FS",
    "^FO24,92^GB764,2,2^FS",
  ];

  const leftX = 30;
  const rightX = 410;
  const topY = 108;
  const rowGap = 54;
  const wrapAt = 24;
  const fields = [
    { label: "Razon social", value: entry.business_name, x: leftX, y: topY, lines: 2 },
    { label: "R.U.T.", value: entry.rut, x: rightX, y: topY, lines: 1 },
    { label: "Contacto", value: entry.contact_name, x: leftX, y: topY + rowGap, lines: 1 },
    { label: "Correo", value: entry.contact_email || "-", x: rightX, y: topY + rowGap, lines: 2 },
    { label: "Telefono", value: entry.contact_phone || "-", x: leftX, y: topY + rowGap * 2, lines: 1 },
    { label: "Propiedad", value: entry.ownership || "-", x: rightX, y: topY + rowGap * 2, lines: 1 },
    { label: "Sucursal", value: entry.branch_office || "-", x: leftX, y: topY + rowGap * 3, lines: 1 },
    { label: "Serie", value: entry.serial_number || "-", x: rightX, y: topY + rowGap * 3, lines: 1 },
    { label: "Equipo", value: entry.equipment_model, x: leftX, y: topY + rowGap * 4, lines: 2 },
    { label: "Ingresado por", value: entry.worker_name_snapshot, x: rightX, y: topY + rowGap * 4, lines: 2 },
    { label: "Fecha", value: formatDate(entry.created_at), x: leftX, y: topY + rowGap * 5, lines: 1 },
    { label: "Imagenes", value: String(entry.image_count || 0), x: rightX, y: topY + rowGap * 5, lines: 1 },
  ];

  fields.forEach((field) => {
    pushCompactField(lines, {
      x: field.x,
      y: field.y,
      label: field.label,
      value: field.value,
      wrapAt,
      maxLines: field.lines,
    });
  });

  lines.push("^FO24,440^GB764,2,2^FS");

  pushSection(lines, {
    y: 452,
    title: "Reporte del cliente",
    value: entry.client_report || "-",
    x: leftX,
    wrapAt: 42,
    maxLines: 3,
  });

  pushSection(lines, {
    y: 452,
    title: "Detalle y accesorios",
    value: entry.details_accessories || "-",
    x: rightX,
    wrapAt: 22,
    maxLines: 3,
  });

  lines.push("^XZ");
  return lines.join("\n");
}

function pushCompactField(lines, options) {
  lines.push(`^FO${options.x},${options.y}^A0N,18,18^FD${sanitize(options.label)}:^FS`);
  const wrapped = wrapText(options.value, options.wrapAt)
    .slice(0, options.maxLines)
    .map((line, index, array) =>
      index === array.length - 1 ? withEllipsis(line, options.value, options.wrapAt, options.maxLines, index) : line
    );
  let cursorY = options.y + 20;
  wrapped.forEach((line) => {
    lines.push(`^FO${options.x},${cursorY}^A0N,22,22^FD${sanitize(line)}^FS`);
    cursorY += 22;
  });
}

function pushSection(lines, options) {
  lines.push(`^FO${options.x},${options.y}^A0N,18,18^FD${sanitize(options.title)}:^FS`);
  let cursorY = options.y + 20;

  const wrapped = wrapText(options.value, options.wrapAt)
    .slice(0, options.maxLines)
    .map((line, index, array) =>
      index === array.length - 1 ? withEllipsis(line, options.value, options.wrapAt, options.maxLines, index) : line
    );

  wrapped
    .forEach((line) => {
      lines.push(`^FO${options.x},${cursorY}^A0N,20,20^FD${sanitize(line)}^FS`);
      cursorY += 20;
    });
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
