import { proxyStorefrontRequest } from '../../../../lib/store-bff';

interface RouteContext {
  params: Promise<{ segments: string[] }>;
}

async function handle(request: Request, context: RouteContext): Promise<Response> {
  const { segments } = await context.params;
  return proxyStorefrontRequest(request, segments);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
