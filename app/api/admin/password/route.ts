import { changePassword } from '@/lib/auth';
import { json, errorResponse, requireAdmin } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const err = await changePassword(String(body?.current ?? ''), String(body?.next ?? ''));
    return err ? json({ ok: false, error: err }, 400) : json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
