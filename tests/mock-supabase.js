/* A small stand-in for Supabase (auth + REST + RPC) on a local Postgres (PGlite),
   running the real migration so the browser tests hit the real role rules. Test use only. */
const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs'), path = require('path');
const MIG = path.join(__dirname, '../supabase/migrations');

async function create() {
  const db = new PGlite({ parsers: { 1082: v => v } });   // dates stay 'YYYY-MM-DD', like PostgREST
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant usage on schema public to anon, authenticated; grant select on auth.users to authenticated;`);
  for (const f of fs.readdirSync(MIG).sort()) await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));

  let q = Promise.resolve();
  const serial = fn => (q = q.then(fn, fn));
  const codes = {};                    // email -> code
  const sent = [];                     // emails "sent"
  const as = (who, fn) => serial(async () => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who.uid || ''}', false); ${who.role === 'service' ? '' : `set role ${who.role};`}`);
    try { return await fn(); } finally { await db.exec('reset role'); }
  });
  const ident = s => '"' + String(s).replace(/"/g, '') + '"';
  const lit = v => v === 'null' ? 'null' : `'${String(v).replace(/'/g, "''")}'`;

  function who(h) {
    const a = (h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '');
    if (a === 'service') return { role: 'service' };
    if (a.startsWith('tok-')) return { role: 'authenticated', uid: a.slice(4) };
    return { role: 'anon' };
  }
  const json = (status, body, extra = {}) => ({ status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', ...extra }, body: body === undefined ? '' : JSON.stringify(body) });
  const pgErr = e => json(400, { code: e.code || 'P0001', message: e.message, details: e.detail || null, hint: null });

  async function session(email) {
    const u = (await db.query('select id, email from auth.users where lower(email)=lower($1)', [email])).rows[0];
    return { access_token: 'tok-' + u.id, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + u.id,
      user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
  }

  async function handle(method, url, headers, raw) {
    const u = new URL(url), p = u.pathname, body = raw ? JSON.parse(raw) : {};
    if (method === 'OPTIONS') return json(200, {});
    const w = who(headers);
    /* ── auth ── */
    if (p === '/auth/v1/otp') {
      const ex = (await db.query('select 1 from auth.users where lower(email)=lower($1)', [body.email])).rows.length;
      if (!ex && body.create_user === false) return json(422, { code: 'otp_disabled', msg: 'Signups not allowed for otp', error_code: 'otp_disabled' });
      codes[body.email.toLowerCase()] = '123456'; sent.push(body.email.toLowerCase()); return json(200, {});
    }
    if (p === '/auth/v1/verify') {
      const e = String(body.email || '').toLowerCase();
      if (!codes[e] || codes[e] !== body.token) return json(403, { code: 'otp_expired', error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      delete codes[e]; return json(200, await session(e));
    }
    if (p === '/auth/v1/user') {
      if (!w.uid) return json(401, { msg: 'invalid JWT' });
      const r = (await db.query('select id, email from auth.users where id=$1', [w.uid])).rows[0];
      return r ? json(200, { id: r.id, email: r.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }) : json(401, { msg: 'no user' });
    }
    if (p === '/auth/v1/logout') return json(204);
    if (p === '/auth/v1/admin/users' && w.role === 'service') {
      try { const r = (await db.query('insert into auth.users (email) values (lower($1)) returning id, email', [body.email])).rows[0]; return json(200, r); }
      catch (e) { return json(422, { msg: 'already registered' }); }
    }
    if (p === '/auth/v1/admin/generate_link' && w.role === 'service') {
      const c = String(Math.floor(100000 + Math.random() * 899999)); codes[body.email.toLowerCase()] = c;
      return json(200, { email_otp: c, action_link: 'x' });
    }
    /* ── rpc ── */
    let m = p.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (m) {
      const args = Object.entries(body).map(([k, v]) => `${ident(k)} => ${v === null ? 'null' : typeof v === 'object' ? (Array.isArray(v) && !v.some(x => typeof x === 'object') && k !== 'd' ? `array[${v.map(lit).join(',') || ''}]::text[]` : `${lit(JSON.stringify(v))}::jsonb`) : typeof v === 'boolean' || typeof v === 'number' ? v : lit(v)}`).join(', ');
      try {
        const r = await as(w, () => db.query(`select to_jsonb(${ident(m[1])}(${args})) as r`));
        let v = r.rows[0].r; if (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(x => x === null)) v = null;
        return json(200, v);
      } catch (e) { return pgErr(e); }
    }
    /* ── tables ── */
    m = p.match(/^\/rest\/v1\/(\w+)$/);
    if (m) {
      const table = m[1];
      if (method === 'POST') {
        const rows = Array.isArray(body) ? body : [body];
        try {
          const out = [];
          for (const r of rows) {
            const cols = Object.keys(r);
            const vals = cols.map(c => r[c] === null ? 'null' : Array.isArray(r[c]) ? `array[${r[c].map(lit).join(',')}]::text[]` : typeof r[c] === 'object' ? `${lit(JSON.stringify(r[c]))}::jsonb` : typeof r[c] === 'boolean' ? r[c] : lit(r[c]));
            out.push((await as(w, () => db.query(`insert into ${ident(table)} (${cols.map(ident).join(',')}) values (${vals.join(',')}) returning *`))).rows[0]);
          }
          return json(201, /return=minimal/.test(headers.prefer || headers.Prefer || '') ? undefined : out);
        } catch (e) { return pgErr(e); }
      }
      // GET with PostgREST-style filters
      let sel = u.searchParams.get('select') || '*';
      const embeds = []; sel = sel.replace(/(\w+)(!inner)?\(([^)]*)\)/g, (_, name, inner, cols) => { embeds.push({ name, inner: !!inner, cols }); return ''; }).replace(/,+/g, ',').replace(/^,|,$/g, '') || '*';
      const where = [], post = [];
      for (const [k, v] of u.searchParams) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        const [op, ...rest] = v.split('.'); const val = rest.join('.');
        const sqlop = { eq: '=', neq: '<>', gt: '>', lt: '<', gte: '>=', lte: '<=' }[op];
        if (k.includes('.')) { post.push([k, op, val]); continue; }
        if (op === 'is') where.push(`${ident(k)} is ${val === 'null' ? 'null' : val}`);
        else if (sqlop) where.push(`${ident(k)} ${sqlop} ${lit(val)}`);
      }
      const order = u.searchParams.get('order'), limit = u.searchParams.get('limit');
      const cols = embeds.length || sel === '*' ? '*' : sel.split(',').map(c => ident(c.trim())).join(',');
      const sql = `select ${cols} from ${ident(table)}${where.length ? ' where ' + where.join(' and ') : ''}${order ? ` order by ${ident(order.split('.')[0])} ${order.split('.')[1] === 'desc' ? 'desc' : 'asc'}` : ''}${limit ? ` limit ${+limit}` : ''}`;
      try {
        let rows = (await as(w, () => db.query(sql))).rows;
        for (const e of embeds) {
          for (const r of rows) {
            if (e.name === 'camps') r.camps = (await db.query('select * from camps where id=$1', [r.camp_id])).rows[0] || null;
            if (e.name === 'officials') r.officials = (await db.query('select name from officials where id=$1', [r.updated_by || r.created_by])).rows[0] || null;
          }
        }
        for (const [k, op, val] of post) { const [a, b] = k.split('.'); rows = rows.filter(r => r[a] && String(r[a][b]) === val); }
        if (/vnd\.pgrst\.object/.test(headers.accept || headers.Accept || '')) return rows.length === 1 ? json(200, rows[0]) : json(406, { code: 'PGRST116', message: 'not one row' });
        return json(200, rows);
      } catch (e) { return pgErr(e); }
    }
    return json(404, { message: 'mock: unknown ' + p });
  }

  return { db, handle, codes, sent };
}
module.exports = { create };
