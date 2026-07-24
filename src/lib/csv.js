// Dependency-free CSV parse/generate. Handles quoted fields (commas,
// newlines, and escaped "" inside quotes) per the standard CSV convention —
// deliberately not a library, since the only inputs are small HR exports.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else if (c === "\r") {
      // swallow — \r\n line endings handled by the following \n
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter(r => !(r.length === 1 && r[0] === ""));
}

export function toCsv(rows) {
  return rows.map(r => r.map(v => '"' + String(v ?? "").split('"').join('""') + '"').join(",")).join("\n");
}

// rows: array of row-arrays (first row = header). Returns array of objects
// keyed by lowercased, trimmed header — so callers can look up columns
// case-insensitively without repeating that logic themselves.
export function csvRowsToObjects(rows) {
  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
    return obj;
  });
}
