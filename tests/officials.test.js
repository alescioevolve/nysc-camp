process.env.SUPABASE_URL='https://x.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY='k';
const log=[]; let who='dep';
const ME={ dep:{id:'o-dep',camp_id:'c2',name:'Musa',role:'deputy',unit_id:null,camps:{id:'c2',active:true,ends_on:'2026-11-24'}},
  head:{id:'o-h',camp_id:'c2',name:'Sports Head',role:'unit_head',unit_id:'u-s',camps:{id:'c2',active:true,ends_on:'2026-11-24'}},
  po:{id:'o-p',camp_id:'c2',name:'PO',role:'platoon_officer',unit_id:null,camps:{id:'c2',active:true,ends_on:'2026-11-24'}} };
global.fetch=async(u,o={})=>{ const j=(b,s=200)=>({ok:s<300,status:s,text:async()=>JSON.stringify(b)}); log.push((o.method||'GET')+' '+u.replace('https://x.supabase.co',''));
  if(u.endsWith('/auth/v1/user')) return o.headers.Authorization==='Bearer good'?j({id:'uid'}):j({},401);
  if(u.includes('/rest/v1/officials?user_id')) return j([ME[who]]);
  if(u.includes('/rest/v1/units')) return j([{id:'u-s',name:'Sports'},{id:'u-k',name:'Kitchen'}]);
  if(u.includes('/rest/v1/officials?camp_id=eq.c2&select=email')) return j([{email:'taken@x.ng'}]);
  if(u.includes('/rest/v1/officials?id=eq.')) return j([u.includes('o-s1')?{id:'o-s1',name:'Ada',email:'ada@x.ng',unit_id:'u-s',active:true,phone:'0801'}:{id:'o-k1',name:'Kay',email:'k@x.ng',unit_id:'u-k',active:true}]);
  if(u.endsWith('/auth/v1/admin/users')) return JSON.parse(o.body).email==='exists@x.ng'?j({},422):j({id:'new-'+JSON.parse(o.body).email});
  if(u.endsWith('/rest/v1/officials')) return j([{id:'oid-'+JSON.parse(o.body).email}],201);
  if(u.endsWith('/rest/v1/audit')) { log.push('AUDIT '+o.body); return j(null,201); }
  if(u.endsWith('/admin/generate_link')) return j({email_otp:'482913'});
  return j({},404); };
const h=require('../api/officials.js');
const run=async(body,tok='good')=>{const r={h:{},setHeader(){},status(s){this.s=s;return this},json(b){this.b=b;return this}};await h({method:'POST',headers:{authorization:'Bearer '+tok},body},r);return r;};
const people=[{name:'Ada',email:'Ada@X.ng',role:'Unit Member',unit:'sports'},{name:'Bayo',phone:'08031234567',role:'platoon officer',platoon:'4'},
 {name:'',email:'a@b.c',role:'deputy'},{name:'Chi',email:'taken@x.ng',role:'deputy'},{name:'Dan',email:'bad@',role:'deputy'},
 {name:'Eze',email:'e@x.ng',role:'director'},{name:'Fola',email:'f@x.ng',role:'unit_head'},{name:'Gbe',email:'g@x.ng',role:'delegate',scopes:['standings']},
 {name:'Ada2',email:'ada@x.ng',role:'deputy'},{name:'Ex',email:'exists@x.ng',role:'coordinator'}];
(async()=>{
  let r=await run({action:'invite',people,dry:true},'bad'); console.log('bad token →',r.s);
  r=await run({action:'invite',people,dry:true}); console.log('dry run:'); r.b.results.forEach(x=>console.log('  ',x.i,x.ok?'OK '+x.preview.email+' '+x.preview.role:'✗ '+x.error));
  console.log('writes during dry run:',log.filter(l=>l.startsWith('POST')).length);
  log.length=0; r=await run({action:'invite',people}); console.log('real:',r.b.results.filter(x=>x.ok).map(x=>x.name).join(', ')); console.log(log.find(l=>l.startsWith('AUDIT')));
  who='head'; r=await run({action:'invite',people:[{name:'H1',email:'h1@x.ng',role:'unit_member',unit:'Sports'},{name:'H2',email:'h2@x.ng',role:'unit_member',unit:'Kitchen'},{name:'H3',email:'h3@x.ng',role:'deputy'}],dry:true});
  console.log('unit head:',r.b.results.map(x=>x.ok?'OK':x.error).join(' | '));
  r=await run({action:'code',id:'o-s1'}); console.log('head code own unit →',r.s,r.b.code);
  r=await run({action:'code',id:'o-k1'}); console.log('head code other unit →',r.s);
  who='po'; r=await run({action:'code',id:'o-s1'}); console.log('platoon officer code →',r.s);
  console.log('expires', h._test.endsAt({ends_on:'2026-11-24'}));
})();
