import { importStandings } from '@/lib/repo';
import { parseStandings, suggestF1 } from '@/lib/importer';
import { adminAction, json, errorResponse } from '@/lib/api';
import { UserError } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB

// multipart form: file=<.xlsx|.csv>, preview=1 to only parse
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: 'Upload a file' }, 400);
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ ok: false, error: 'Choose a file' }, 400);
  if (file.size > MAX_BYTES) return json({ ok: false, error: 'File is larger than 4 MB' }, 400);
  const data = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parseStandings(data, file.name);
  } catch (e) {
    return errorResponse(new UserError(e instanceof Error ? e.message : String(e)));
  }
  if (form.get('preview') === '1') return json({ ok: true, preview: parsed, f1: suggestF1(parsed, file.name) });
  return adminAction(async () => {
    await importStandings({ name: file.name, type: file.type, data }, parsed);
    return { warnings: parsed.warnings, count: parsed.rows.length };
  });
}
