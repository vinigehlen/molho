import '@testing-library/jest-dom/vitest';
import { toHaveNoViolations } from 'jest-axe';
import { expect } from 'vitest';

// Acessibilidade é bloqueante no code review (doc de marca §6.1) — todo
// componente do Tempero tem um teste axe.
expect.extend(toHaveNoViolations);
