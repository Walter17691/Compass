import { useEffect } from "react";

export function useFonts() {
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    // Kept in sync with src/index.css's own @import (same URL) rather than
    // removed — this hook is separate app-lifecycle infrastructure (see
    // its App.jsx call site) and the Visual Identity pass was told not to
    // delete it merely because index.css's @import already covers the
    // same fonts. Using the identical URL means the browser treats this
    // as the same cached request, so it doesn't cost a second real fetch.
    l.href = "https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,100..900;1,100..900&family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap";
    document.head.appendChild(l);
  }, []);
}
