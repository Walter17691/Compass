import { useState, useEffect } from 'react';

// Phase 6.5 hardening (closes Prompt 11 audit finding 10.3, MEDIUM) —
// generic value debounce. First real use: SearchScreen's global search,
// which used to re-run its full in-memory scan across every case's
// meetings/records/letters on every single keystroke, with no cap — real
// lag against a large org's real data volume (thousands of cases).
export function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
