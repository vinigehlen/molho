const MAX_CSP_REPORT_BYTES = 16 * 1024;
const CSP_REPORT_TYPES = new Set(['application/csp-report', 'application/reports+json', 'application/json']);

export interface SanitizedCspReport {
  directive: string;
  blockedOrigin: string;
  documentOrigin: string;
}

function safeOrigin(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'unknown';
  if (['inline', 'eval', 'data', 'blob', 'self'].includes(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : url.protocol;
  } catch {
    return 'invalid';
  }
}

function sanitizeEntry(value: unknown): SanitizedCspReport | null {
  if (!value || typeof value !== 'object') return null;
  const envelope = value as Record<string, unknown>;
  const body = (envelope['csp-report'] ?? envelope.body ?? envelope) as Record<string, unknown>;
  if (!body || typeof body !== 'object') return null;
  const directive = body['effective-directive'] ?? body.effectiveDirective ?? body['violated-directive'];
  return {
    directive: typeof directive === 'string' ? directive.slice(0, 120) : 'unknown',
    blockedOrigin: safeOrigin(body['blocked-uri'] ?? body.blockedURL),
    documentOrigin: safeOrigin(body['document-uri'] ?? body.documentURL),
  };
}

export async function handleCspReport(
  request: Request,
  capture: (report: SanitizedCspReport) => void,
): Promise<Response> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!CSP_REPORT_TYPES.has(contentType)) return new Response(null, { status: 415 });
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CSP_REPORT_BYTES) {
    return new Response(null, { status: 413 });
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_CSP_REPORT_BYTES) return new Response(null, { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  const entries = Array.isArray(parsed) ? parsed : [parsed];
  for (const entry of entries.slice(0, 20)) {
    const report = sanitizeEntry(entry);
    if (report) capture(report);
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
