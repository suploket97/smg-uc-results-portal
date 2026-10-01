import { buildState } from '@/lib/repo';
import { json, errorResponse, viewParam } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Public, read-only. The big screens poll this every few seconds.
export async function GET(req: Request) {
  try {
    return json(await buildState(false, viewParam(req)));
  } catch (e) {
    return errorResponse(e);
  }
}
