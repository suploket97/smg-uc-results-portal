import { saveMatch, clearMatch } from '@/lib/repo';
import { adminAction, requireAdmin } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// { code, scoreA, scoreB, suddenDeath, walkover, winnerId, confirm? }  or  { action: 'clear', code, confirm? }
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  return adminAction(() => (body?.action === 'clear' ? clearMatch(body) : saveMatch(body)));
}
