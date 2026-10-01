import { buildState } from '@/lib/repo';
import { json, errorResponse, requireAdmin } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    return json(await buildState(true));
  } catch (e) {
    return errorResponse(e);
  }
}
