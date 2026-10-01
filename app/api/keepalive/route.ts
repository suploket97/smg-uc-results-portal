import { keepAlive } from '@/lib/repo';
import { json, errorResponse } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Called once a day by Vercel Cron (see vercel.json) so the free Supabase project never idles for 7 days.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }
  try {
    return json({ ok: true, dbTime: await keepAlive() });
  } catch (e) {
    return errorResponse(e);
  }
}
