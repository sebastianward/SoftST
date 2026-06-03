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
