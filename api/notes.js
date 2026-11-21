// Notes and team comments pinned on the Creative board viewer.
//
// Two roles, each identified by a key sent in the x-dev-key header:
//   developer (NOTES_DEV_KEY)  - private notes, sees everything, approves or declines team comments, deletes.
//   team      (NOTES_TEAM_KEY) - carried in the share link (?team=); can post comments but never read any back.
// Everything lives in one private Vercel Blob file: notes/notes.json.
import { put, get } from '@vercel/blob';
import { timingSafeEqual, randomUUID } from 'node:crypto';

const PATH = 'notes/notes.json';
const MAX_NOTES = 800;
const MAX_TEAM_PENDING = 300;
const MAX_TEXT = 2000;
const STATUSES = ['pending', 'approved', 'declined'];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const same = (given, expected) =>
  !!expected && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

const roleOf = (request) => {
  const given = request.headers.get('x-dev-key') || '';
  if (same(given, process.env.NOTES_DEV_KEY || '')) return 'dev';
  if (same(given, process.env.NOTES_TEAM_KEY || '')) return 'team';
  return null;
};

const load = async () => {
  try {
    const result = await get(PATH, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) return [];
    const parsed = JSON.parse(await new Response(result.stream).text());
    return Array.isArray(parsed) ? parsed.map((n) => ({ kind: 'dev', ...n })) : [];
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
  const role = roleOf(request);
  if (!role) return json({ error: 'unauthorized' }, 401);
  // Comments are visible to the developer only; the team gets an empty list.
  return json({ role, notes: role === 'dev' ? await load() : [] });
}

export async function POST(request) {
  const role = roleOf(request);
  if (!role) return json({ error: 'unauthorized' }, 401);
  const body = await readBody(request);
  const text = str(body?.text, MAX_TEXT);
  const scene = str(body?.scene, 40);
  const x = num(body?.x, 0, 1);
  const y = num(body?.y, 0, 1);
  const author = str(body?.author, 60);
  if (!text || !scene || x === null || y === null) return json({ error: 'text, scene, x and y are required' }, 400);
  if (role === 'team' && !author) return json({ error: 'name is required' }, 400);
  const notes = await load();
  if (notes.length >= MAX_NOTES) return json({ error: 'note limit reached' }, 409);
  if (role === 'team' && notes.filter((n) => n.kind === 'team' && n.status === 'pending').length >= MAX_TEAM_PENDING)
    return json({ error: 'too many comments waiting for review' }, 409);
  const now = new Date().toISOString();
  const note = {
    id: randomUUID(),
    kind: role === 'team' ? 'team' : 'dev',
    scene,
    x,
    y,
    view: cleanView(body.view),
    ctx: cleanCtx(body.ctx),
    text,
    created: now,
    updated: now,
    ...(role === 'team' ? { author, status: 'pending', reply: '', decided: null } : {}),
  };
  notes.push(note);
  await save(notes);
  return json(role === 'dev' ? { note } : { ok: true }, 201);
}

// Developer only: edit a private note's text, or decide on a team comment ({ id, status, reply }).
export async function PATCH(request) {
  if (roleOf(request) !== 'dev') return json({ error: 'unauthorized' }, 401);
  const body = await readBody(request);
  if (!body?.id) return json({ error: 'id is required' }, 400);
  const notes = await load();
  const note = notes.find((n) => n.id === body.id);
  if (!note) return json({ error: 'not found' }, 404);
  const now = new Date().toISOString();
  if (note.kind === 'team') {
    if (!STATUSES.includes(body.status)) return json({ error: 'status must be pending, approved or declined' }, 400);
    note.status = body.status;
    note.reply = str(body.reply, MAX_TEXT);
    note.decided = body.status === 'pending' ? null : now;
  } else {
    const text = str(body.text, MAX_TEXT);
    if (!text) return json({ error: 'text is required' }, 400);
    note.text = text;
  }
  note.updated = now;
  await save(notes);
  return json({ note });
}

export async function DELETE(request) {
  if (roleOf(request) !== 'dev') return json({ error: 'unauthorized' }, 401);
  const id = new URL(request.url).searchParams.get('id');
  const notes = await load();
  const next = notes.filter((n) => n.id !== id);
  if (next.length === notes.length) return json({ error: 'not found' }, 404);
  await save(next);
  return json({ ok: true });
}
