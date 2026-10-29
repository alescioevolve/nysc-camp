process.env.SUPABASE_URL='https://x.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY='k';
let mode='ok';
global.fetch = async (u) => {
  const j = b => ({ ok: true, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.includes('githubusercontent')) return j({ schema:1, updatedAt:'2026-10-19T04:31:29.000Z', days:{}, menu:[], fixtures:[], announcements:[], bestLosers:{} });
  if (mode==='down') return { ok:false, status:503 };
  if (u.includes('/camps')) return j(mode==='nocamp'?[]:[{ id:'c2', name:'Stream II', starts_on:'2026-11-04', ends_on:'2026-11-24', platoons:10 }]);
  if (u.includes('/sections')) return j(mode==='empty'?[]:[
    { key:'days/2026-11-04', data:[['05:20','05:30','Reveille']], updated_at:'2026-11-02T10:00:00+00:00', officials:{name:'Musa'} },
    { key:'menu', data:[['Bread','Rice','Yam']], updated_at:'2026-11-02T09:00:00+00:00', officials:{name:'Kitchen'} }]);
  if (u.includes('/announcements')) return j([{ id:'a1', title:'Parade', body:'', urgent:true, platoon:'4', from_at:'2026-11-04T23:30:00+00:00', to_at:'2026-11-05T07:00:00+00:00', created_at:'2026-11-02T11:00:00+00:00', officials:{name:'Daniel'} }]);
};
const h = require('../api/live.js');
const run = async m => { mode=m; const res={ h:{}, setHeader(k,v){this.h[k]=v}, status(s){this.s=s;return this}, send(b){this.b=b}, json(b){this.b=JSON.stringify(b)} }; await h({}, res); return res; };
(async()=>{
  let r = await run('ok'); const c = JSON.parse(r.b);
  console.log(r.s, r.h['X-Camp-Source'], c.updatedBy, c.updatedAt, Object.keys(c.days), JSON.stringify(c.announcements[0]));
  for (const m of ['down','nocamp','empty']) { r = await run(m); console.log(m, r.s, r.h['X-Camp-Source']); }
})();
