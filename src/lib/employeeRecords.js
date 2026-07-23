// Never match a blank/missing name against a record — a stray record with
// an empty name (e.g. saved mid-entry) must not silently supply its data
// whenever the name field happens to be empty.
export function findEmployeeByName(records, name) {
  if(!name) return null;
  return (records||[]).find(e=>e.name===name) || null;
}
