import { buildExport, type ExportForm } from '@/lib/exporter';
import { errorResponse, requireAdmin, viewParam } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    // ?form=f1 | f2 | f3 (optionally &match=QF1) | all (default)
    const sp = new URL(req.url).searchParams;
    const f = sp.get('form');
    const form: ExportForm = f === 'f1' || f === 'f2' || f === 'f3' ? f : 'all';
    const match = sp.get('match')?.toUpperCase().replace(/[^A-Z0-9-]/g, '') || undefined;
    const { buffer, filename } = await buildExport(form, match, viewParam(req));
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
