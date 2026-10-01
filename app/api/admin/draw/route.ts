import { drawAction } from '@/lib/repo';
import { adminAction } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return adminAction(() => drawAction(body));
}
