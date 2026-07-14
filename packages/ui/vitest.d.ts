/**
 * O jest-axe declara o matcher só para o namespace do Jest. Como a suíte é
 * Vitest, ensinamos o tipo aqui — sem isto, `expect(...).toHaveNoViolations()`
 * compila como erro mesmo passando em runtime.
 */
import 'vitest';

interface AxeMatchers {
  toHaveNoViolations(): void;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
