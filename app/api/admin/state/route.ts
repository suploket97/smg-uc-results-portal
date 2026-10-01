import { buildState } from '@/lib/repo';
import { json, errorResponse } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    return json(await buildState(true));
  } catch (e) {
    return errorResponse(e);
  }
}
