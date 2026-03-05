import fs from "node:fs";
import path from "node:path";

export function createJsonlLogger(filePath) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  function writeLine(record) {
    const line = `${JSON.stringify(record)}\n`;
    fs.appendFileSync(resolved, line, "utf8");
  }

  return {
    filePath: resolved,
    log(event, payload = {}) {
      writeLine({
        ts: new Date().toISOString(),
        event,
        ...payload,
      });
    },
  };
}
