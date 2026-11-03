/* Supabase adapter for the officials' admin: sign-in by code, loading, saving and people.
   The admin page keeps working on its own content shape (the same as camp.json);
   this file maps it to the database and back. */
window.SB = (() => {
  const CFG = window.CAMP_CFG || {};
  const on = !!(CFG.supabaseUrl && CFG.supabaseAnon && window.supabase && window.supabase.createClient);
  const db = on ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnon,
    { auth: { persistSession: true, autoRefreshToken: true, storageKey: "camp-sb-auth" } }) : null;
  const SECTIONS = ["days", "menu", "fixtures", "bestLosers", "standings"];
  const LEAD = ["director", "deputy"];
  const ROLE_NAME = { director: "Camp Director", deputy: "Deputy Camp Director", coordinator: "State Coordinator",
    unit_head: "Unit head", unit_member: "Unit member", platoon_officer: "Platoon officer", delegate: "Delegate" };
  let me = null, camp = null, unit = null, ver = {};

  const pad = n => String(n).padStart(2, "0");
  const digits = p => String(p || "").replace(/\D/g, "").replace(/^0/, "234");
  const waEmail = p => `wa${digits(p)}@officials.invalid`;
  const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
  const ident = s => isEmail(s) ? String(s).trim().toLowerCase() : waEmail(s);

  /* Lagos is UTC+1 all year */
  function toTs(d, t) {
    const [y, m, dd] = d.split("-").map(Number), [h, mi] = (t || "00:00").split(":").map(Number);
    return new Date(Date.UTC(y, m - 1, dd, h - 1, mi)).toISOString();
  }
  function local(ts) {
    const x = new Date(new Date(ts).getTime() + 3600000);
    return { d: `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`, t: `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}` };
  }
  const err = e => { const m = (e && (e.message || e.error_description)) || String(e || ""); const x = new Error(m); x.code = e && e.code; return x; };

  /* ── Sign-in ── */
  async function hasSession() { if (!on) return false; const { data } = await db.auth.getSession(); return !!data.session; }
  async function token() { const { data } = await db.auth.getSession(); return data.session ? data.session.access_token : ""; }
  /* Email: send a 6-digit code. Phone: the code comes from the Deputy or a unit head on WhatsApp. */
  async function sendCode(id) {
    if (!isEmail(id)) return { whatsapp: true };
    const { error } = await db.auth.signInWithOtp({ email: ident(id), options: { shouldCreateUser: false } });
    if (error) throw err(error);
    return { sent: true };
  }
  async function verify(id, code) {
    const email = ident(id), token = String(code).replace(/\D/g, "");
    let r = await db.auth.verifyOtp({ email, token, type: "email" });
    if (r.error) r = await db.auth.verifyOtp({ email, token, type: "magiclink" });
    if (r.error) throw err(r.error);
    return claim();
  }
  async function claim() {
    const { data, error } = await db.rpc("claim");
    if (error) throw err(error);
    me = data && data.id ? data : null;
    if (!me) return null;
    const [c, u] = await Promise.all([
      db.from("camps").select("*").eq("id", me.camp_id).single(),
      me.unit_id ? db.from("units").select("*").eq("id", me.unit_id).single() : Promise.resolve({ data: null })]);
    camp = c.data; unit = u.data;
    try { localStorage.setItem("camp-sb-me", JSON.stringify({ me, camp, unit })); } catch (e) {}
    return me;
  }
  /* Offline start: use who we were last time (the database still checks every save) */
  function restore() {
    try { const c = JSON.parse(localStorage.getItem("camp-sb-me") || "null"); if (c && c.me) { ({ me, camp, unit } = c); return me; } } catch (e) {}
    return null;
  }
  function forget() { try { localStorage.removeItem("camp-sb-me"); } catch (e) {} }
  async function signOut() { if (on) await db.auth.signOut(); me = camp = unit = null; }

  /* ── What this official can do (the database enforces the same rules) ── */
  const lead = () => !!me && LEAD.includes(me.role);
  function canEdit(sec) {
    if (!me) return false;
    if (lead()) return true;
    if (me.role === "delegate") return (me.scopes || []).includes(sec);
    if (["unit_head", "unit_member"].includes(me.role)) return !!unit && (unit.sections || []).includes(sec);
    return false;
  }
  const canAnnounce = () => !!me && (lead() || me.role === "unit_head" || me.role === "platoon_officer");
  const canPeople = () => !!me && (lead() || me.role === "unit_head" || me.role === "coordinator");
  const roleLabel = o => {
    o = o || me; if (!o) return "";
    const r = ROLE_NAME[o.role] || o.role;
    return o.role === "platoon_officer" ? `${r} · Platoon ${o.platoon}` : r;
  };

  /* ── Dates of the active camp ── */
  function dates() {
    if (!camp) return [];
    const out = [], d = new Date(String(camp.starts_on).slice(0, 10) + "T12:00:00Z"), end = new Date(String(camp.ends_on).slice(0, 10) + "T12:00:00Z");
    for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
    return out;
  }

  /* ── Load everything into the admin's content shape ── */
  async function load() {
    if (!me) await claim();
    if (!me) throw err({ message: "not_signed_in" });
    const [s, a] = await Promise.all([
      db.from("sections").select("key,data,version,updated_at").eq("camp_id", me.camp_id),
      db.from("announcements").select("*").eq("camp_id", me.camp_id).order("created_at", { ascending: false }).limit(300)]);
    if (s.error) throw err(s.error); if (a.error) throw err(a.error);
    ver = {};
    const c = { schema: 1, updatedAt: "", updatedBy: "", days: {}, menu: [], fixtures: [], announcements: [], bestLosers: {}, standings: null };
    dates().forEach(k => { c.days[k] = []; });
    let newest = "";
    for (const r of s.data) {
      ver[r.key] = r.version;
      if (r.key.startsWith("days/")) c.days[r.key.slice(5)] = r.data; else c[r.key] = r.data;
      if (r.updated_at > newest) newest = r.updated_at;
    }
    if (!c.menu.length) c.menu = (window.CAMP && CAMP.BUILT_IN.menu) || [[], [], [], [], [], [], []];
    for (const r of a.data) {
      const f = local(r.from_at), t = r.to_at ? local(r.to_at) : null;
      c.announcements.push({ id: r.id, title: r.title, body: r.body, urgent: r.urgent, platoon: r.platoon || "",
        from: f.d, fromT: f.t === "00:00" ? "" : f.t, to: t ? (t.t === "00:00" ? prevDay(t.d) : t.d) : f.d, toT: t && t.t !== "00:00" ? t.t : "",
        postedAt: r.created_at, by: "", own: r.created_by === me.id });
      if (r.updated_at > newest) newest = r.updated_at;
    }
    c.updatedAt = newest;
    return c;
  }
  function prevDay(k) { const d = new Date(k + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
  const signature = () => JSON.stringify(ver);

  /* ── Save what changed. linesFor(key) gives the plain-language summary for the audit log. ── */
  async function publish(base, work, linesFor) {
    const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    const keys = [];
    new Set([...Object.keys(base.days), ...Object.keys(work.days)]).forEach(k => { if (!same(base.days[k] || [], work.days[k] || [])) keys.push("days/" + k); });
    ["menu", "fixtures", "bestLosers", "standings"].forEach(k => { if (!same(base[k], work[k])) keys.push(k); });
    for (const k of keys) {
      const data = k.startsWith("days/") ? work.days[k.slice(5)] : work[k];
      const { data: v, error } = await db.rpc("save_section", { k, d: data, expected: ver[k] || 0, lines: linesFor(k).slice(0, 80) });
      if (error) {
        if (error.code === "40001" || /conflict/.test(error.message)) return { conflict: true };
        throw err(error);
      }
      ver[k] = v;
    }
    const B = Object.fromEntries(base.announcements.map(a => [a.id, a])), W = Object.fromEntries(work.announcements.map(a => [a.id, a]));
    const created = [];
    for (const a of work.announcements) {
      const o = B[a.id];
      if (o && same(o, a)) continue;
      const args = { a_id: o ? a.id : null, a_title: String(a.title || "").trim(), a_body: a.body || "", a_urgent: !!a.urgent,
        a_platoon: a.platoon || null, a_from: toTs(a.from, a.fromT || "00:00"), a_to: toTs(a.to || a.from, a.toT || "24:00"), a_remove: false };
      const { data: id, error } = await db.rpc("post_announcement", args);
      if (error) throw err(error);
      if (!o) created.push({ ...a, id });
    }
    for (const o of base.announcements) if (!W[o.id]) {
      const { error } = await db.rpc("post_announcement", { a_id: o.id, a_title: o.title, a_body: o.body || "", a_urgent: !!o.urgent,
        a_platoon: o.platoon || null, a_from: null, a_to: null, a_remove: true });
      if (error) throw err(error);
    }
    return { ok: true, created };
  }

  /* ── Activity log ── */
  async function activity() {
    const { data, error } = await db.from("audit").select("at,actor_name,action,target,lines").eq("camp_id", me.camp_id).order("at", { ascending: false }).limit(100);
    if (error) throw err(error);
    return data;
  }

  /* ── People and units ── */
  async function people() {
    const [o, u] = await Promise.all([
      db.from("officials").select("id,name,email,email_real,phone,role,unit_id,platoon,scopes,expires_at,active,user_id,created_at").eq("camp_id", me.camp_id).order("name"),
      db.from("units").select("*").eq("camp_id", me.camp_id).order("name")]);
    if (o.error) throw err(o.error); if (u.error) throw err(u.error);
    return { officials: o.data, units: u.data };
  }
  async function api(body) {
    const r = await fetch("../api/officials", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + await token() }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw err({ message: j.error || "Something went wrong" });
    return j;
  }
  const invite = (list, dry) => api({ action: "invite", people: list, dry: !!dry });
  const code = id => api({ action: "code", id });
  async function setOfficial(o) {
    const { data, error } = await db.rpc("set_official", { t_id: o.id, t_role: o.role, t_unit: o.unit_id || null, t_platoon: o.platoon || null,
      t_scopes: o.scopes || [], t_expires: null, t_active: o.active !== false });
    if (error) throw err(error); return data;
  }
  async function saveUnit(u, del) {
    const { data, error } = await db.rpc("save_unit", { u_id: u.id || null, u_name: u.name, u_kind: u.kind || "general", u_sections: u.sections || [], u_delete: !!del });
    if (error) throw err(error); return data;
  }

  return { on, db, get me() { return me; }, get camp() { return camp; }, get unit() { return unit; },
    hasSession, token, sendCode, verify, claim, restore, forget, signOut, isEmail, waEmail, ident,
    lead, canEdit, canAnnounce, canPeople, roleLabel, ROLE_NAME, SECTIONS,
    dates, load, signature, publish, activity, people, invite, code, setOfficial, saveUnit, toTs, local };
})();
