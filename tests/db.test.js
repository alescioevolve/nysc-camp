// Tests the Supabase migration's role rules in a local Postgres (PGlite).
const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs'), path = require('path');
const MIG = require('path').join(__dirname, '../supabase/migrations');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

(async () => {
  const db = new PGlite();
  // Supabase stand-ins
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
    grant select on auth.users to authenticated;`);
  for (const f of fs.readdirSync(MIG).sort()) { try { await db.exec(fs.readFileSync(path.join(MIG, f), "utf8")); } catch (e) { console.log("MIGRATION", f, e.message, e.position); process.exit(1); } }

  const U = { dir: '11111111-0000-0000-0000-000000000001', dep: '11111111-0000-0000-0000-000000000002',
              sporthead: '11111111-0000-0000-0000-000000000003', sportmem: '11111111-0000-0000-0000-000000000004',
              po4: '11111111-0000-0000-0000-000000000005', del: '11111111-0000-0000-0000-000000000006',
              old: '11111111-0000-0000-0000-000000000007', stranger: '11111111-0000-0000-0000-000000000008' };
  await db.exec(`
    insert into camps (id,name,starts_on,ends_on,active) values ('c2','Stream II','2026-11-04','2026-11-24',true), ('c1','Stream I','2026-09-30','2026-10-20',false);
    insert into units (id,camp_id,name,kind,sections) values
      ('22222222-0000-0000-0000-000000000001','c2','Sports','sports','{fixtures,bestLosers,standings}'),
      ('22222222-0000-0000-0000-000000000002','c2','Kitchen','kitchen','{menu}');
    insert into auth.users values ${Object.entries(U).map(([k, v]) => `('${v}','${k.toUpperCase()}@x.ng')`).join(',')};
    insert into officials (camp_id,name,email,role,unit_id,platoon,scopes,expires_at) values
      ('c2','Dir','dir@x.ng','director',null,null,'{}', now()+interval '20 days'),
      ('c2','Dep','dep@x.ng','deputy',null,null,'{}', now()+interval '20 days'),
      ('c2','SportHead','sporthead@x.ng','unit_head','22222222-0000-0000-0000-000000000001',null,'{}', now()+interval '20 days'),
      ('c2','SportMem','sportmem@x.ng','unit_member','22222222-0000-0000-0000-000000000001',null,'{}', now()+interval '20 days'),
      ('c2','PO4','po4@x.ng','platoon_officer',null,'4','{}', now()+interval '20 days'),
      ('c2','Del','del@x.ng','delegate',null,null,'{standings}', now()+interval '20 days'),
      ('c2','Old','old@x.ng','director',null,null,'{}', now()-interval '1 day');`);

  const as = async (who, sql, params) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who ? U[who] : ''}', false); set role ${who ? 'authenticated' : 'anon'};`);
    try { return { rows: (await db.query(sql, params)).rows }; } catch (e) { return { err: e.message, detail: e.detail }; }
    finally { await db.exec('reset role'); }
  };

  console.log('sign-in links by email');
  for (const w of Object.keys(U)) await as(w, 'select claim()');
  ok((await db.query(`select count(*)::int n from officials where user_id is not null`)).rows[0].n === 7, 'all 7 invited officials linked; stranger not');
  ok((await as('stranger', 'select (me()).id')).rows[0].id === null, 'stranger has no access');
  ok((await as('old', `select save_section('menu','[]'::jsonb,0)`)).err === 'not_signed_in', 'expired official is locked out');

  console.log('content sections');
  let r = await as('dir', `select save_section('days/2026-11-04','[["05:20","05:30","Reveille"]]'::jsonb,0, array['added Reveille']) v`);
  ok(r.rows && r.rows[0].v === 1, 'director creates a day');
  r = await as('dep', `select save_section('days/2026-11-04','[["05:20","05:40","Reveille"]]'::jsonb,0)`);
  ok(r.err === 'conflict' && r.detail === '1', 'stale save is refused with the current version');
  r = await as('dep', `select save_section('days/2026-11-04','[["05:20","05:40","Reveille"]]'::jsonb,1) v`);
  ok(r.rows && r.rows[0].v === 2, 'deputy saves with the right version');
  ok((await as('sporthead', `select save_section('fixtures','[]'::jsonb,0) v`)).rows, 'sports head edits fixtures');
  ok((await as('sportmem', `select save_section('standings','{}'::jsonb,0) v`)).rows, 'sports member edits standings');
  ok((await as('sporthead', `select save_section('menu','[]'::jsonb,0)`)).err === 'not_allowed', 'sports head cannot touch the menu');
  ok((await as('sporthead', `select save_section('days/2026-11-05','[]'::jsonb,0)`)).err === 'not_allowed', 'sports head cannot touch the timetable');
  ok((await as('del', `select save_section('standings','{"a":1}'::jsonb,1) v`)).rows, 'delegate edits standings (their scope)');
  ok((await as('del', `select save_section('fixtures','[]'::jsonb,1)`)).err === 'not_allowed', 'delegate cannot edit outside scope');
  ok((await as('po4', `select save_section('menu','[]'::jsonb,0)`)).err === 'not_allowed', 'platoon officer cannot edit content');
  ok((await as('dir', `select save_section('../evil','[]'::jsonb,0)`)).err === 'bad_section', 'unknown section key refused');
  ok((await as(null, `select key from sections`)).rows.length === 3, 'anyone can read published sections');
  ok((await as('dir', `update sections set data='[]'`)).err?.includes('permission'), 'direct table writes are blocked');

  console.log('announcements');
  r = await as('po4', `select post_announcement(null,'Platoon 4 meet at 6','',false,'4',null,null) id`);
  ok(r.rows, 'platoon officer posts to own platoon');
  ok((await as('po4', `select post_announcement(null,'Everyone','',false,null,null,null)`)).err === 'not_allowed', 'platoon officer cannot post to everyone');
  ok((await as('po4', `select post_announcement(null,'P5','',false,'5',null,null)`)).err === 'not_allowed', 'platoon officer cannot post to another platoon');
  const aid = r.rows[0].id;
  ok((await as('sporthead', `select post_announcement($1,'x','',false,null,null,null)`, [aid])).err === 'not_allowed', "unit head cannot edit someone else's notice");
  ok((await as('dep', `select post_announcement($1,'x','',false,null,null,null,true)`, [aid])).rows, 'deputy removes any notice');
  ok((await as(null, `select id from announcements`)).rows.length === 0, 'removed notices are hidden from the public');
  ok((await as('dir', `select post_announcement(null,'Bad','',false,null,'2026-11-05T10:00Z','2026-11-05T09:00Z')`)).err === 'bad_times', 'end before start refused');

  console.log('people and roles');
  const id = async n => (await db.query(`select id from officials where name=$1`, [n])).rows[0].id;
  const units = (await db.query(`select id,name from units`)).rows; const sports = units.find(u => u.name === 'Sports').id, kitchen = units.find(u => u.name === 'Kitchen').id;
  ok((await as('dep', `select * from officials`)).rows.length === 7, 'deputy sees everyone');
  const seen = (await as('sporthead', `select name, phone from officials`)).rows.map(x => x.name).sort();
  ok(JSON.stringify(seen) === '["SportHead","SportMem"]', 'unit head sees only their unit');
  ok((await as('po4', `select * from officials`)).rows.length === 1, 'platoon officer sees only themself');
  ok((await as(null, `select * from officials`)).rows.length === 0, 'public sees no officials');
  r = await as('sporthead', `select (set_official($1,'delegate',$2,null,'{standings}',null,true)).role`, [await id('SportMem'), sports]);
  ok(r.rows && r.rows[0].role === 'delegate', 'unit head turns own member into a delegate');
  ok((await as('sporthead', `select set_official($1,'unit_member',$2,null,null,null,true)`, [await id('SportMem'), kitchen])).err === 'not_allowed', 'unit head cannot move people to another unit');
  ok((await as('sporthead', `select set_official($1,'deputy',null,null,null,null,true)`, [await id('PO4')])).err === 'not_allowed', 'unit head cannot change people outside their unit');
  ok((await as('dep', `select set_official($1,'deputy',null,null,null,null,true)`, [await id('Dir')])).err === 'not_allowed', 'deputy cannot change the director');
  ok((await as('dep', `select set_official($1,'director',null,null,null,null,true)`, [await id('PO4')])).err === 'not_allowed', 'deputy cannot make a director');
  ok((await as('dir', `select set_official($1,'director',null,null,null,null,false)`, [await id('Dir')])).err === 'cannot_change_self', 'director cannot lock themself out');
  ok((await as('dep', `select (set_official($1,'platoon_officer',null,'4',null,null,false)).active`, [await id('PO4')])).rows, 'deputy removes access');
  ok((await as('po4', `select post_announcement(null,'hi','',false,'4',null,null)`)).err === 'not_signed_in', 'removed official is locked out at once');
  ok((await as('sporthead', `select save_unit(null,'Hack','general','{menu}')`)).err === 'not_allowed', 'only leads manage units');
  ok((await as('dir', `select save_unit(null,'Medical','medical','{}') id`)).rows, 'director adds a unit');

  console.log('audit log');
  const log = (await as('dir', `select action, actor_name, target, lines from audit order by id`)).rows;
  ok(log.length >= 9, `${log.length} actions logged`);
  ok(log.some(l => l.action === 'remove' && l.actor_name === 'Dep' && l.lines.includes('Access removed')), 'access removal logged with who did it');
  ok(log.some(l => l.target === 'days/2026-11-04' && l.lines[0] === 'added Reveille'), 'content save keeps the summary lines');
  ok((await as('sportmem', `select * from audit`)).rows.every(l => l.actor_name === 'SportMem'), 'members only see their own log lines');
  ok((await as(null, `select * from audit`)).rows.length === 0, 'public sees no log');
  ok((await as('dir', `select log(null,'x','x','{}',null,null)`)).err?.includes('permission'), 'nobody can write the log directly');

  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
