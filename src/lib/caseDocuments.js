// Derives the Documents tab's list from data that already exists on the
// case — generated letters live on each meeting (letterOutput) and the
// case itself (investigationReport); uploaded documents live on
// cs.evidence, minus witness statements (those belong to Evidence/People,
// not "documents" in the letters-and-files sense this tab means).
export function deriveDocumentsForCase(cs) {
  const docs = [];

  (cs.meetings || []).forEach(m => {
    if (m.letterOutput) docs.push({ kind: "letter", label: `${m.type || "Meeting"} letter`, date: m.savedAt || m.date, content: m.letterOutput, meetingId: m.id });
  });

  if (cs.investigationReport) {
    docs.push({ kind: "report", label: "Investigation report", date: cs.investigationReportDate, content: cs.investigationReport });
  }

  (cs.evidence || []).forEach(ev => {
    if (ev.type === "Witness statement") return;
    docs.push({ kind: "evidence", label: ev.name, date: ev.date, evidenceId: ev.id, dataUrl: ev.dataUrl, size: ev.size, type: ev.type });
  });

  return docs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}
