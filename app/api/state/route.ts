import { buildState } from '@/lib/repo';
import { json, errorResponse } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Public, read-only. The big screens poll this every few seconds.
export async function GET() {
  try {
    return json(await buildState(false));
  } catch (e) {
    return errorResponse(e);
  }
}
