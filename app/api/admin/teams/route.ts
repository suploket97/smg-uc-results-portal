import { teamAction } from '@/lib/repo';
import { adminAction, requireAdmin } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  return adminAction(() => teamAction(body));
}
