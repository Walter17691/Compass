export function addWorkingDays(date, days) {
  if(days === 0) return null;
  const d = new Date(date);
  let added = 0;
  while(added < days) {
    d.setDate(d.getDate() + 1);
    if(d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d.toLocaleDateString("en-GB");
}

// UK GDPR/DPA 2018 DSAR deadline: "one calendar month" from receipt (ICO
// guidance) — the corresponding date in the next month, or the last day
// of that month if the original date doesn't exist there (e.g. 31 Jan ->
// 28/29 Feb, not a rolled-over 2/3 March). Returns a Date, not a
// formatted string, since callers need both ISO (DB storage) and en-GB
// (display) forms.
export function addCalendarMonth(date) {
  const d = new Date(date);
  if(isNaN(d)) return null;
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth()+1, 1);
  const daysInTargetMonth = new Date(target.getFullYear(), target.getMonth()+1, 0).getDate();
  target.setDate(Math.min(day, daysInTargetMonth));
  return target;
}
