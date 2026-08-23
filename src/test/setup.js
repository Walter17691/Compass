import '@testing-library/jest-dom';
import { expect } from 'vitest';
import { toHaveNoViolations } from 'jest-axe';

// Phase 6.5 hardening (accessibility pass) — registers expect().toHaveNoViolations()
// globally so any test file can run axe against a rendered component
// without its own per-file setup. See src/test/axeSmoke.test.jsx for the
// actual coverage this enables.
expect.extend(toHaveNoViolations);
