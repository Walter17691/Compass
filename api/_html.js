// Shared by every api/ handler that builds an HTML email body. Values
// interpolated into these templates (names, org names, letter text, case
// types) all originate from user input somewhere upstream, and most email
// clients render HTML by default — unescaped, that's a real injection
// vector into mail sent to real people (employees, new team members),
// not just a cosmetic issue.
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
