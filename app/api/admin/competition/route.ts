import { competitionAction } from '@/lib/repo';
import { adminAction, requireAdmin } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// { action: 'create', name?, date? } | { action: 'switch', id } | { action: 'delete', id, confirmName }
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  return adminAction(() => competitionAction(body));
}
