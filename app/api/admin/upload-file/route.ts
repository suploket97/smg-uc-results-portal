import { getUploadFile } from '@/lib/repo';
import { json } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Downloads an original uploaded file again: /api/admin/upload-file?id=3
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get('id'));
  const f = id ? await getUploadFile(id) : null;
  if (!f) return json({ ok: false, error: 'File not found' }, 404);
  return new Response(new Uint8Array(f.data), {
    headers: {
      'Content-Type': f.content_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
