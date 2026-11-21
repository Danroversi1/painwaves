// Developer notes pinned on the Creative board viewer.
// Every request must carry the developer key in the x-dev-key header (env NOTES_DEV_KEY).
// Notes live in one private Vercel Blob file: notes/notes.json.
import { put, get } from '@vercel/blob';
import { timingSafeEqual, randomUUID } from 'node:crypto';

const PATH = 'notes/notes.json';
const MAX_NOTES = 500;
const MAX_TEXT = 2000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const authorized = (request) => {
  const expected = process.env.NOTES_DEV_KEY || '';
  const given = request.headers.get('x-dev-key') || '';
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
};

const load = async () => {
  try {
    const result = await get(PATH, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) return [];
    const parsed = JSON.parse(await new Response(result.stream).text());
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && /not.?found/i.test(error.name + ' ' + error.message)) return [];
    throw error;
  }
};

const save = (notes) =>
  put(PATH, JSON.stringify(notes), {
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
  });

const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const cleanView = (v = {}) => ({
  yaw: num(v.yaw, -Math.PI, Math.PI) ?? 0,
  pitch: num(v.pitch, -Math.PI, Math.PI) ?? 0,
  tx: num(v.tx, -4, 4) ?? 0,
  ty: num(v.ty, -4, 4) ?? 0,
  tz: num(v.tz, -1, 1.6) ?? 0,
});

const cleanCtx = (c = {}) => ({
  persona: str(c.persona, 40),
  age: str(c.age, 20),
  profile: num(c.profile, 0, 20),
  relief: str(c.relief, 60),
  t: num(c.t, 0, 1e6),
  phase: str(c.phase, 120),
});

const readBody = async (request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

export async function GET(request) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  return json({ notes: await load() });
}

export async function POST(request) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  const body = await readBody(request);
  const text = str(body?.text, MAX_TEXT);
  const scene = str(body?.scene, 40);
  const x = num(body?.x, 0, 1);
  const y = num(body?.y, 0, 1);
  if (!text || !scene || x === null || y === null) return json({ error: 'text, scene, x and y are required' }, 400);
  const notes = await load();
  if (notes.length >= MAX_NOTES) return json({ error: 'note limit reached' }, 409);
  const now = new Date().toISOString();
  const note = { id: randomUUID(), scene, x, y, view: cleanView(body.view), ctx: cleanCtx(body.ctx), text, created: now, updated: now };
  notes.push(note);
  await save(notes);
  return json({ note }, 201);
}

export async function PATCH(request) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  const body = await readBody(request);
  const text = str(body?.text, MAX_TEXT);
  if (!body?.id || !text) return json({ error: 'id and text are required' }, 400);
  const notes = await load();
  const note = notes.find((n) => n.id === body.id);
  if (!note) return json({ error: 'not found' }, 404);
  note.text = text;
  note.updated = new Date().toISOString();
  await save(notes);
  return json({ note });
}

export async function DELETE(request) {
  if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
  const id = new URL(request.url).searchParams.get('id');
  const notes = await load();
  const next = notes.filter((n) => n.id !== id);
  if (next.length === notes.length) return json({ error: 'not found' }, 404);
  await save(next);
  return json({ ok: true });
}
