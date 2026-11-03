/* End-to-end: the admin in a real browser against the Supabase stand-in.
   Needs the site served on :8791 (python3 -m http.server 8791 from the repo root). */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { create } = require('./mock-supabase');
const SITE = 'http://localhost:8791';
const MOCK = 'https://mock.supabase.co';
let pass = 0, fail = 0;
const SHOT = async (p, n) => { if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/${n}.png` }); };
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };

(async () => {
  const sb = await create(), db = sb.db;
  const camp = JSON.parse(fs.readFileSync(process.env.CAMP_JSON || '/home/claude/camp-companion-data/camp.json', 'utf8'));
  await db.exec(`delete from camps;  -- drop the seeded Stream II camp; tests make their own
    insert into camps (id,name,starts_on,ends_on,active,platoons) values ('c2','Batch C Stream II','2026-11-04','2026-11-24',true,10);
    insert into units (id,camp_id,name,kind,sections) values ('22222222-0000-0000-0000-000000000001','c2','Sports','sports','{fixtures,bestLosers,standings}'),
      ('22222222-0000-0000-0000-000000000002','c2','Kitchen','kitchen','{menu,roster}');
    insert into auth.users (email) values ('musa@x.ng'),('ada@x.ng');
    insert into officials (camp_id,name,email,role,unit_id,expires_at) values
      ('c2','Musa Adamu','musa@x.ng','deputy',null, now()+interval '30 days'),
      ('c2','Ada Obi','ada@x.ng','unit_head','22222222-0000-0000-0000-000000000001', now()+interval '30 days');`);
  for (const [k, v] of Object.entries(camp.days)) await db.query(`insert into sections (camp_id,key,data) values ('c2',$1,$2)`, ['days/' + k, JSON.stringify(v)]);
  for (const k of ['menu', 'fixtures', 'bestLosers', 'standings']) await db.query(`insert into sections (camp_id,key,data) values ('c2',$1,$2)`, [k, JSON.stringify(camp[k])]);

  // Server functions run here with their fetch pointed at the stand-in
  process.env.SUPABASE_URL = MOCK; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  const realFetch = global.fetch;
  global.fetch = async (u, o = {}) => {
    if (String(u).startsWith(MOCK)) { const r = await sb.handle(o.method || 'GET', String(u), Object.fromEntries(Object.entries(o.headers || {}).map(([k, v]) => [k.toLowerCase(), v])), o.body);
      return new Response(r.body || null, { status: r.status, headers: r.headers }); }
    return realFetch(u, o);
  };
  const V = require('web-push').generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = V.publicKey; process.env.VAPID_PRIVATE_KEY = V.privateKey;
  const pushSent = []; require('web-push').sendNotification = async (sub, body, opt) => { pushSent.push({ endpoint: sub.endpoint, payload: JSON.parse(body), urgency: opt.urgency }); return { statusCode: 201 }; };
  const officials = require('../api/officials.js'), live = require('../api/live.js'), push = require('../api/push.js');
  const runFn = async (fn, req) => { const res = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(s) { this.s = s; return this; }, json(b) { this.b = JSON.stringify(b); return this; }, send(b) { this.b = b; return this; } };
    await fn(req, res); return res; };

  const b = await chromium.launch();
  async function ctxFor(cfg, phone) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    /* A pretend phone: notifications allowed, and the browser's push service returns a fixed address */
    await ctx.addInitScript(ep => {
      const fake = { endpoint: 'https://push.example/' + ep, toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BPk', auth: 'au' } }; }, unsubscribe: async () => true };
      try { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }); Notification.requestPermission = async () => 'granted'; } catch (e) {}
      if (window.PushManager) { PushManager.prototype.subscribe = async () => fake; PushManager.prototype.getSubscription = async () => (localStorage.getItem('camp-push') || localStorage.getItem('camp-push-off')) ? fake : null; }
    }, phone || 'phone-' + Math.random().toString(36).slice(2));
    await ctx.route(/\/config\.js(\?|$)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: `window.CAMP_CFG=${JSON.stringify(cfg)};` }));
    await ctx.route(MOCK + '/**', async r => { const q = r.request(); const x = await sb.handle(q.method(), q.url(), q.headers(), q.postData());
      await r.fulfill({ status: x.status, headers: x.headers, body: x.body }); });
    await ctx.route(/\/api\/officials/, async r => { const q = r.request();
      const x = await runFn(officials, { method: q.method(), headers: q.headers(), body: q.postData() }); await r.fulfill({ status: x.s, contentType: 'application/json', body: x.b }); });
    await ctx.route(/\/api\/push/, async r => { const q = r.request();
      const x = await runFn(push, { method: q.method(), headers: q.headers(), body: q.postData() }); await r.fulfill({ status: x.s, contentType: 'application/json', body: x.b }); });
    await ctx.route(/live\/camp\.json|githubusercontent|jsdelivr/, async r => { const x = await runFn(live, {}); await r.fulfill({ status: x.s, contentType: 'application/json', body: x.b }); });
    await ctx.route(/api\/time/, r => r.fulfill({ status: 404, body: '' }));
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    p.on('dialog', d => d.dismiss());
    return { ctx, p };
  }
  const CFG = { supabaseUrl: MOCK, supabaseAnon: 'anon', vapidPublic: V.publicKey };
  const signIn = async (p, id, code) => {
    await p.goto(SITE + '/private-admin/'); await p.waitForSelector('#sb-id', { timeout: 8000 });
    await p.fill('#sb-id', id); await p.click('#sb-go'); await p.waitForSelector('#sb-code', { timeout: 8000 });
    await p.fill('#sb-code', code || sb.codes[id.includes('@') ? id : `wa${id.replace(/\D/g, '').replace(/^0/, '234')}@officials.invalid`] || '123456');
    await p.click('#sb-go');
    try { await p.waitForSelector('#dash:not([hidden])', { timeout: 8000 }); } catch (e) { console.log('    sign-in message:', await p.textContent('#smsg'), p.errs); throw e; }
    await p.waitForTimeout(800);
  };
  const tabs = p => p.$$eval('#tabs .tab', t => t.filter(x => !x.hidden).map(x => x.dataset.tab));
  const msg = p => p.textContent('#msg');
  const publish = async p => { await p.click('#publish'); await p.waitForFunction(() => document.querySelector('#publish').textContent === 'Publish', null, { timeout: 8000 }); await p.waitForTimeout(400); };

  console.log('access codes still work when Supabase is not set up');
  { const { ctx, p } = await ctxFor({ supabaseUrl: '', supabaseAnon: '' }); await p.goto(SITE + '/private-admin/'); await p.waitForTimeout(600);
    ok(await p.isVisible('#lgform') && !(await p.isVisible('#sbform')), 'old sign-in form shown'); ok(!p.errs.length, 'no page errors ' + p.errs.join(';')); await ctx.close(); }

  console.log('deputy signs in by email code');
  const A = await ctxFor(CFG), pa = A.p;
  await pa.goto(SITE + '/private-admin/'); await pa.waitForSelector('#sb-id'); await SHOT(pa, '1-signin');
  await pa.fill('#sb-id', 'stranger@x.ng'); await pa.click('#sb-go'); await pa.waitForTimeout(700);
  ok(/isn't on the list/.test(await pa.textContent('#smsg')), 'unknown email gets a clear message');
  await signIn(pa, 'musa@x.ng');
  ok(/Good (morning|afternoon|evening), Musa/.test(await pa.textContent('#main')), 'Today home greets by name');
  ok(/Deputy Camp Director/.test(await pa.textContent('#main')), 'role shown'); await SHOT(pa, '2-home');
  ok(JSON.stringify(await tabs(pa)) === JSON.stringify(['home', 'duties', 'time', 'notice', 'fix', 'st', 'menu', 'people', 'act', 'acct']), 'deputy sees every tab');

  console.log('timetable edit saves to the database with a log line');
  await pa.click('[data-tab="time"]'); await pa.click('[data-day="2026-11-05"]'); await pa.click('[data-edit="0"]');
  await pa.fill('#e2', 'Reveille (bugle at the hostel)'); await pa.click('#esave'); await publish(pa);
  ok(/Published/.test(await msg(pa)), 'published: ' + (await msg(pa)).slice(0, 60));
  let r = (await db.query(`select version, data->0->>2 as t from sections where key='days/2026-11-05'`)).rows[0];
  ok(r.version === 2 && r.t === 'Reveille (bugle at the hostel)', 'day saved, version 2');
  let a = (await db.query(`select actor_name, lines from audit where target='days/2026-11-05'`)).rows[0];
  ok(a && a.actor_name === 'Musa Adamu' && /Thu 5 Nov timetable: changed "Reveille"/.test(a.lines[0]), 'audit: ' + (a && a.lines[0]));

  console.log('announcement to one platoon');
  await pa.click('[data-tab="notice"]'); await pa.click('[data-add-notice]');
  await pa.fill('[data-p$="|title"]', 'Platoon 4: kit inspection at 4 PM'); await pa.selectOption('[data-p$="|platoon"]', '4'); await publish(pa);
  r = (await db.query(`select title, platoon, created_by is not null as c from announcements`)).rows[0];
  ok(r && r.platoon === '4' && r.c, 'announcement saved for Platoon 4');
  const feed = JSON.parse((await runFn(live, {})).b);
  ok(feed.announcements[0] && feed.announcements[0].platoon === '4' && feed.days['2026-11-05'][0][2].startsWith('Reveille (bugle'), 'corps feed carries both changes');

  console.log('bulk invite from a pasted list');
  await pa.click('[data-tab="people"]'); await pa.waitForSelector('#pp-add'); await pa.click('#pp-add');
  await pa.fill('#pp-txt', 'Chi Eze, chi@x.ng, Sports, member\nDan Bello 0803 111 2222 platoon officer platoon 7\nNobody here\nMusa Again, musa@x.ng, deputy');
  await pa.click('#pp-check'); await pa.waitForFunction(() => /Add \d/.test(document.querySelector('#pp-check').textContent), null, { timeout: 8000 });
  const prev = await pa.textContent('#pp-prev');
  ok(/Chi Eze/.test(prev) && /Dan Bello/.test(prev) && /Add a role|Needs an email/.test(prev) && /Already on the list/.test(prev), 'preview flags problems row by row');
  ok((await pa.textContent('#pp-check')) === 'Add 2', 'two ready to add'); await SHOT(pa, '3-paste');
  await pa.click('#pp-check'); await pa.waitForTimeout(1200);
  r = (await db.query(`select name, role, platoon, email_real from officials order by created_at`)).rows;
  ok(r.length === 4 && r.some(x => x.name === 'Dan Bello' && x.role === 'platoon_officer' && x.platoon === '7' && !x.email_real), 'Dan added as Platoon 7 officer with phone sign-in');
  ok((await db.query(`select lines from audit where action='invite'`)).rows[0].lines.length === 2, 'invite logged');

  console.log('add one person with the form');
  await pa.click('#pp-one'); await pa.waitForSelector('#pf-n');
  ok(!(await pa.$$eval('#pf-r option', o => o.map(x => x.value))).some(v => v === 'admin' || v === 'director'), 'deputy cannot pick App support or Camp Director');
  await pa.fill('#pf-n', 'Efe Okon'); await pa.fill('#pf-ph', '07012345678'); await pa.selectOption('#pf-r', 'unit_head');
  ok(await pa.isVisible('#pf-uw') && !(await pa.isVisible('#pf-pw')) && /Runs a unit/.test(await pa.textContent('#pf-rd')), 'only the unit dropdown shows, with a plain description');
  await pa.click('#pf-ok'); ok(/Choose a unit/.test(await pa.textContent('#pf-w')), 'asks for the unit');
  await pa.selectOption('#pf-u', { label: 'Kitchen' }); await SHOT(pa, '3b-addone'); await pa.click('#pf-ok');
  await pa.waitForSelector('#pe-codev', { timeout: 8000 }).catch(() => {});
  r = (await db.query(`select o.role, u.name unit from officials o join units u on u.id=o.unit_id where o.name='Efe Okon'`)).rows[0];
  ok(r && r.role === 'unit_head' && r.unit === 'Kitchen', 'Efe added as Kitchen unit head');
  ok(await pa.isVisible('#pe-codev'), 'phone-only person: their WhatsApp code opens straight away');
  await pa.click('#pe-c'); await pa.waitForTimeout(300);

  console.log('WhatsApp code for a phone-only official');
  await pa.waitForSelector('[data-pp]'); const danId = (await db.query(`select id from officials where name='Dan Bello'`)).rows[0].id;
  await pa.click(`[data-pp="${danId}"]`); await pa.click('#pe-code'); await pa.waitForSelector('#pe-copy', { timeout: 8000 });
  const shown = [(await pa.textContent('#pe-codev')).trim()];
  ok(shown && /wa\.me\/2348031112222/.test(await pa.innerHTML('.sheet')), 'code shown with a WhatsApp link: ' + (shown && shown[0]));
  await SHOT(pa, '5-code'); await pa.click('#pe-c'); await pa.waitForTimeout(300); await SHOT(pa, '4-people');

  console.log('platoon officer signs in with phone + code');
  const C = await ctxFor(CFG, 'dan-phone'), pc = C.p;
  await signIn(pc, '0803 111 2222', shown && shown[0]);
  ok(JSON.stringify(await tabs(pc)) === JSON.stringify(['home', 'duties', 'notice', 'act', 'acct']), 'platoon officer sees only their tabs: ' + (await tabs(pc)));
  await pc.click('[data-tab="notice"]');
  ok(await pc.$eval('.card fieldset', f => f.disabled), "the deputy's notice is read-only for them");
  await pc.click('[data-add-notice]');
  const opts = await pc.$$eval('[data-p$="|platoon"]:not([disabled]) option', o => o.map(x => x.textContent));
  ok(JSON.stringify(opts.slice(-1)) === '["Platoon 7 only"]', 'can only choose own platoon');
  await pc.fill('.card:not(:has(fieldset[disabled])) [data-p$="|title"]', 'Platoon 7 roll call 5:45'); await publish(pc);
  ok((await db.query(`select 1 from announcements where platoon='7'`)).rows.length === 1, 'their notice is saved'); await pc.click('[data-tab="home"]'); await SHOT(pc, '6-po-home');

  console.log('unit head is limited to their unit');
  const D = await ctxFor(CFG), pd = D.p;
  await signIn(pd, 'ada@x.ng');
  ok(JSON.stringify(await tabs(pd)) === JSON.stringify(['home', 'duties', 'notice', 'fix', 'st', 'people', 'act', 'acct']), 'sports head tabs: ' + (await tabs(pd)));
  await pd.evaluate(() => { work.menu[0][0] = 'Hacked tea'; }); await pd.evaluate(() => publish());
  await pd.waitForTimeout(1500);
  ok(/outside what your role can change/.test(await msg(pd)), 'menu change refused with a clear message');
  ok((await db.query(`select data->0->>0 as m from sections where key='menu'`)).rows[0].m !== 'Hacked tea', 'menu unchanged in the database');
  await pd.evaluate(() => { work = clone(base); store.del("camp-admin-draft"); render(); });
  await pd.click('[data-tab="people"]'); await pd.waitForTimeout(800);
  const seen = await pd.$$eval('[data-pp] .nm', n => n.map(x => x.textContent));
  ok(seen.length === 2 && seen.every(x => /Ada|Chi/.test(x)), 'sees only Sports people: ' + seen.join(', '));

  console.log('two officials publish at once');
  await pa.click('[data-tab="st"]'); await pd.click('[data-tab="st"]');
  await pa.evaluate(() => { work.standings.points = [12, 8, 6, 4]; render(); });
  await pd.evaluate(() => { work.standings.events[0].places = ['3', '1', '2', '']; render(); });
  await publish(pa); await publish(pd);
  r = JSON.parse((await db.query(`select data::text as d from sections where key='standings'`)).rows[0].d);
  ok(r.points.join() === '12,8,6,4' && r.events[0].places.join() === '3,1,2,', 'both changes kept after a clash on the same section');
  ok(/Published/.test(await msg(pd)), 'second official told it was published: ' + (await msg(pd)).slice(0, 50));

  console.log('kitchen duty');
  await pa.click('[data-tab="menu"]'); await pa.click('[data-rday="2026-11-05"]'); await pa.selectOption('[data-p="r|2026-11-05"]', '3'); await publish(pa);
  ok(JSON.parse((await db.query(`select data::text d from sections where key='roster'`)).rows[0].d)['2026-11-05'] === '3', 'Platoon 3 set on kitchen duty for Thu 5 Nov');
  ok((await db.query(`select lines from audit where target='roster'`)).rows[0].lines[0] === 'Kitchen duty, Thu 5 Nov: Platoon 3', 'logged in plain words');

  console.log('alerts on phones');
  const K = await ctxFor(CFG, 'corps-1'), pk = K.p;
  await pk.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('camp-platoon', '4'); } });
  await pk.goto(SITE + '/app/?t=2026-11-05T09:00'); await pk.waitForSelector('[data-alerts="on"]', { timeout: 8000 }); await SHOT(pk, '8-corps-alerts');
  await pk.click('[data-alerts="on"]'); await pk.waitForSelector('[data-alerts="off"]', { timeout: 8000 });
  r = (await db.query(`select platoon from push_subs where endpoint like '%corps-1'`)).rows[0];
  ok(r && r.platoon === '4', 'corps member turns on alerts for Platoon 4');
  await pk.goto(SITE + '/app/?t=2026-11-05T09:00#sports'); await pk.waitForSelector('[data-platoon]'); await pk.selectOption('[data-platoon]', '6'); await pk.waitForTimeout(800);
  ok((await db.query(`select platoon from push_subs where endpoint like '%corps-1'`)).rows[0].platoon === '6', 'changing platoon moves the alerts too');
  await pk.goto(SITE + '/app/?t=2026-11-04T10:00'); await pk.waitForTimeout(1500);
  ok(!/kit inspection/.test(await pk.textContent('body')), "Platoon 4's notice is hidden from Platoon 6");
  await pk.goto(SITE + '/app/?t=2026-11-05T09:00'); await pk.waitForFunction(() => /Kitchen duty/.test(document.body.textContent), null, { timeout: 6000 }).catch(() => {});
  ok(/Kitchen duty: Platoon 3/.test(await pk.textContent('body')), 'corps members see the kitchen duty platoon');
  await pk.evaluate(() => localStorage.setItem('camp-platoon', '4')); await pk.goto(SITE + '/app/?t=2026-11-04T10:00'); await pk.waitForTimeout(1500);
  await pk.waitForFunction(() => /kit inspection/.test(document.querySelector('body').textContent), null, { timeout: 6000 }).catch(() => {});
  const nv = await pk.textContent('body'); ok(/kit inspection/.test(nv) && /PLATOON 4/.test(nv) && /Until end of today/.test(nv), 'and shown, labelled, to Platoon 4, until end of day'); await SHOT(pk, '9-corps-notice');
  await pc.click('[data-tab="acct"]'); await pc.click('#acct-alerts'); await pc.waitForTimeout(900);
  ok((await db.query(`select official_id is not null o from push_subs where endpoint like '%dan-phone'`)).rows[0]?.o, "Dan turns on duty alerts on his phone");

  console.log('duties');
  await pa.click('[data-tab="duties"]'); await pa.waitForSelector('#duty-add'); await pa.click('#duty-add'); await pa.waitForSelector('#du-a');
  await pa.fill('#du-t', 'Gate duty for morning parade'); await pa.fill('#du-d', 'Report to the RSM at 5:30'); await pa.selectOption('#du-a', danId); await pa.fill('#du-dt', '06:00');
  await pa.click('#du-ok'); await pa.waitForTimeout(1200);
  r = (await db.query(`select title, assignee_name, creator_name, status from duties`)).rows[0];
  ok(r && r.assignee_name === 'Dan Bello' && r.creator_name === 'Musa Adamu' && r.status === 'open', 'deputy assigns a duty to Dan');
  ok(pushSent.some(x => x.payload.title === 'New duty: Gate duty for morning parade' && x.endpoint.includes('dan-phone')), 'alert sent to Dan\'s phone');
  await pc.click('[data-tab="duties"]'); await pc.evaluate(() => { DUTIES = null; render(); }); await pc.waitForSelector('[data-duty]');
  ok(/From Musa Adamu/.test(await pc.textContent('#main')), 'Dan sees who assigned it'); await SHOT(pc, '7-duties');
  await pc.click('[data-duty]'); await pc.fill('#dn-n', 'Done, 3 stewards on the gate'); await pc.click('#dn-ok'); await pc.waitForTimeout(900);
  r = (await db.query(`select status, note from duties`)).rows[0];
  ok(r.status === 'done' && /3 stewards/.test(r.note), 'Dan marks it done with a note');
  await pa.evaluate(() => { DUTIES = null; render(); }); await pa.waitForTimeout(800);
  ok(/Done, 3 stewards/.test(await pa.textContent('#main')), 'deputy sees it done with the note');

  console.log('notification for a new announcement');
  await pa.click('[data-tab="notice"]'); await pa.click('[data-add-notice]');
  await pa.fill('[data-p$="|title"]', 'Parade moved to 7 AM'); await pa.check('[data-p$="|urgent"]'); await pa.check('[data-p$="|notify"]'); await publish(pa);
  ok(/Notification sent to 2 phones/.test(await msg(pa)), 'sent to every subscribed phone: ' + (await msg(pa)).slice(-40));
  ok(pushSent.some(x => x.payload.title === 'Urgent: Parade moved to 7 AM' && x.urgency === 'high'), 'urgent alert sent with high priority');

  console.log('access removal');
  await pa.click('[data-tab="people"]'); await pa.waitForSelector(`[data-pp="${danId}"]`); await pa.click(`[data-pp="${danId}"]`);
  await pa.click('#pe-rm'); await pa.click('[data-yes]'); await pa.waitForTimeout(900);
  await pc.evaluate(() => { work = clone(base); work.announcements.push({ id: 'n1', title: 'After removal', body: '', urgent: false, platoon: '7', from: '2026-11-05', fromT: '', to: '2026-11-05', toT: '', postedAt: new Date().toISOString(), by: '', own: true }); });
  await pc.evaluate(() => publish()); await pc.waitForTimeout(1500);
  ok(/sign-in has ended|Couldn't publish|outside/.test(await msg(pc)), 'removed official can no longer publish: ' + (await msg(pc)).slice(0, 50));

  console.log('activity');
  await pa.click('[data-tab="act"]'); await pa.waitForSelector('.act', { timeout: 6000 });
  const acts = await pa.$$eval('.act b', n => n.map(x => x.textContent));
  ok(acts.includes('Dan Bello') && acts.includes('Ada Obi') && acts.includes('Musa Adamu'), 'deputy sees everyone\'s changes');

  const errs = [...pa.errs, ...pc.errs, ...pd.errs];
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
