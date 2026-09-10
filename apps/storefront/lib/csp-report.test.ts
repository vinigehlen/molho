import { describe, expect, it, vi } from 'vitest';
import { handleCspReport } from '../../csp-report';

describe('coletor de CSP', () => {
  it('remove paths, queries e amostras antes de enviar à telemetria', async () => {
    const capture = vi.fn();
    const response = await handleCspReport(
      new Request('https://cabanhas-bbq.molho.live/api/csp-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/csp-report' },
        body: JSON.stringify({
          'csp-report': {
            'effective-directive': 'connect-src',
            'blocked-uri': 'https://evil.test/collect?phone=51999999999',
            'document-uri': 'https://cabanhas-bbq.molho.live/acompanhar/secret-token',
            'script-sample': 'telefone=51999999999',
          },
        }),
      }),
      capture,
    );

    expect(response.status).toBe(204);
    expect(capture).toHaveBeenCalledWith({
      directive: 'connect-src',
      blockedOrigin: 'https://evil.test',
      documentOrigin: 'https://cabanhas-bbq.molho.live',
    });
    expect(JSON.stringify(capture.mock.calls)).not.toContain('51999999999');
    expect(JSON.stringify(capture.mock.calls)).not.toContain('secret-token');
  });
});
