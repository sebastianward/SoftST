const fs = require("fs/promises");
const net = require("net");

const ENTRY_ZPL_TEMPLATE = [
  "^XA",
  "^CI28",
  "^PW800",
  "^LL400",
  "^LH0,0",
  "^FO80,76^A0N,24,24^FDRegistro Ingresos Antalis Abitek^FS",
  "^FO80,106^A0N,20,20^FDIngreso #@entry_id^FS",
  "^FO530,106^A0N,18,18^FD@created_at^FS",
  "^FO80,132^GB640,2,2^FS",
  "^FO80,148^A0N,16,16^FDRazon social:^FS",
  "^FO80,168^A0N,20,20^FD@business_name_1^FS",
  "^FO80,190^A0N,20,20^FD@business_name_2^FS",
  "^FO420,148^A0N,16,16^FDContacto:^FS",
  "^FO420,168^A0N,20,20^FD@contact_name_1^FS",
  "^FO420,190^A0N,20,20^FD@contact_name_2^FS",
  "^FO80,220^A0N,16,16^FDEquipo:^FS",
  "^FO80,240^A0N,20,20^FD@equipment_model_1^FS",
  "^FO80,262^A0N,20,20^FD@equipment_model_2^FS",
  "^FO420,220^A0N,16,16^FDSerie:^FS",
  "^FO420,240^A0N,20,20^FD@serial_number_1^FS",
  "^FO420,262^A0N,20,20^FD@serial_number_2^FS",
  "^FO80,292^A0N,16,16^FDIngresado por:^FS",
  "^FO80,312^A0N,20,20^FD@worker_name_snapshot_1^FS",
  "^FO80,334^A0N,20,20^FD@worker_name_snapshot_2^FS",
  "^XZ",
].join("\n");

function buildEntryZpl(entry) {
  const replacements = {
    "@entry_id": sanitize(entry.id),
    "@created_at": sanitize(formatDate(entry.created_at)),
    ...buildWrappedFieldReplacements("business_name", entry.business_name, 24, 2),
    ...buildWrappedFieldReplacements("contact_name", entry.contact_name, 24, 2),
    ...buildWrappedFieldReplacements("equipment_model", entry.equipment_model, 24, 2),
    ...buildWrappedFieldReplacements("serial_number", entry.serial_number || "-", 24, 2),
    ...buildWrappedFieldReplacements("worker_name_snapshot", entry.worker_name_snapshot, 52, 2),
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
  ENTRY_ZPL_TEMPLATE,
  buildEntryZpl,
  sendZplToPrinter,
};
