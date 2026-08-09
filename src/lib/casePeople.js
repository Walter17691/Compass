// Derives the People tab's list from data that already exists elsewhere
// on the case — there's no dedicated people table, so this reads the
// employee name, each meeting's chair + participants, and witness
// evidence entries (whose name follows the "Witness: NAME (date)" shape
// saveMeetingToCase/App.jsx already writes) rather than storing anything
// new.
const WITNESS_NAME = /^Witness:\s*(.+?)\s*\(/;

export function derivePeopleForCase(cs) {
  const people = new Map(); // name -> { name, roles: Set<string> }
  const add = (name, role) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    if (!people.has(trimmed)) people.set(trimmed, { name: trimmed, roles: new Set() });
    if (role) people.get(trimmed).roles.add(role);
  };

  add(cs.employeeName, "Employee");
  (cs.meetings || []).forEach(m => {
    add(m.manager, "Chair");
    (m.participants || []).forEach(p => add(p.name, p.role || "Participant"));
  });
  (cs.evidence || []).forEach(ev => {
    if (ev.type !== "Witness statement") return;
    const match = WITNESS_NAME.exec(ev.name || "");
    if (match) add(match[1], "Witness");
  });

  return [...people.values()]
    .map(p => ({ name: p.name, roles: [...p.roles] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
