/* Officials management that needs the service key: bulk invites and one-time sign-in codes.
   The caller sends their own Supabase session token; we check who they are and what
   their role allows before doing anything. Every action lands in the audit log. */
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROLES = ["director", "deputy", "coordinator", "unit_head", "unit_member", "platoon_officer", "delegate"];
const SECTIONS = ["days", "menu", "fixtures", "bestLosers", "standings"];
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function call(path, opt = {}) {
  const r = await fetch(`${URL_}${path}`, { ...opt, headers: { ...H, ...(opt.headers || {}) } });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch {}
  return { ok: r.ok, status: r.status, body: j };
}
const rest = (p, o) => call(`/rest/v1/${p}`, o);

// Phone → synthetic address for officials who only use WhatsApp codes
const phoneDigits = p => String(p || "").replace(/\D/g, "").replace(/^0/, "234");
const waEmail = p => `wa${phoneDigits(p)}@officials.invalid`;
const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");

async function caller(req) {
  const tok = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!tok) return null;
  const u = await call("/auth/v1/user", { headers: { Authorization: `Bearer ${tok}` } });
  if (!u.ok || !u.body?.id) return null;
  const nowIso = new Date().toISOString();
  const r = await rest(`officials?user_id=eq.${u.body.id}&active=eq.true&expires_at=gt.${nowIso}&select=*,camps!inner(id,active,ends_on)&camps.active=eq.true&limit=1`);
  return r.ok && r.body?.[0] ? r.body[0] : null;
}

const audit = (me, action, target, lines) => rest("audit", { method: "POST", headers: { Prefer: "return=minimal" },
  body: JSON.stringify({ camp_id: me.camp_id, actor: me.id, actor_name: me.name, action, target, lines }) });

// Validate one row of a bulk invite against what the caller may grant
function check(p, me, units) {
  const name = String(p.name || "").trim(), email = String(p.email || "").trim().toLowerCase(), phone = String(p.phone || "").trim();
  const role = String(p.role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!name) return { error: "Name missing" };
  if (!ROLES.includes(role)) return { error: `Unknown role "${p.role || ""}"` };
  if (email && !isEmail(email)) return { error: "Email looks wrong" };
  if (!email && phoneDigits(phone).length < 10) return { error: "Needs an email or a phone number" };
  let unit = null;
  if (p.unit) { unit = units.find(u => u.name.toLowerCase() === String(p.unit).trim().toLowerCase()); if (!unit) return { error: `No unit called "${p.unit}"` }; }
  if (["unit_head", "unit_member"].includes(role) && !unit) return { error: "Unit heads and members need a unit" };
  if (role === "platoon_officer" && !p.platoon) return { error: "Platoon officers need a platoon" };
  const scopes = (p.scopes || []).filter(s => SECTIONS.includes(s));
  if (role === "delegate" && !scopes.length) return { error: "Delegates need at least one thing they can edit" };
  const lead = ["director", "deputy"].includes(me.role);
  if (!lead) {
    if (me.role !== "unit_head") return { error: "Not allowed" };
    if (!["unit_member", "delegate"].includes(role) || !unit || unit.id !== me.unit_id) return { error: "You can only add members or delegates to your own unit" };
  }
  if (role === "director" && me.role !== "director") return { error: "Only a director can add a director" };
  return { row: { name, email: email || waEmail(phone), email_real: !!email, phone: phone || null, role,
    unit_id: unit ? unit.id : null, platoon: p.platoon ? String(p.platoon) : null, scopes: role === "delegate" ? scopes : [] } };
}

function endsAt(camp) { // the day after camp closes, 23:59 Lagos time
  const d = new Date(camp.ends_on + "T22:59:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString();
}

async function invite(me, people, dry) {
  const units = (await rest(`units?camp_id=eq.${encodeURIComponent(me.camp_id)}&select=id,name`)).body || [];
  const existing = new Set(((await rest(`officials?camp_id=eq.${encodeURIComponent(me.camp_id)}&select=email`)).body || []).map(o => o.email));
  const seen = new Set(), results = [];
  for (const [i, p] of people.entries()) {
    const c = check(p, me, units);
    if (c.error) { results.push({ i, ok: false, error: c.error }); continue; }
    if (existing.has(c.row.email) || seen.has(c.row.email)) { results.push({ i, ok: false, error: "Already on the list" }); continue; }
    seen.add(c.row.email);
    if (dry) { results.push({ i, ok: true, preview: c.row }); continue; }
    const u = await call("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: c.row.email, email_confirm: true, user_metadata: { name: c.row.name } }) });
    if (!u.ok && u.status !== 422) { results.push({ i, ok: false, error: "Couldn't create the sign-in" }); continue; }
    const ins = await rest("officials", { method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...c.row, camp_id: me.camp_id, expires_at: endsAt(me.camps), invited_by: me.id, user_id: u.ok ? u.body.id : null }) });
    if (!ins.ok) { results.push({ i, ok: false, error: "Couldn't save" }); continue; }
    results.push({ i, ok: true, id: ins.body[0].id, name: c.row.name, role: c.row.role });
  }
  const added = results.filter(r => r.ok && r.id);
  if (added.length) await audit(me, "invite", `${added.length} officials`, added.map(r => `Added ${r.name} as ${r.role.replace(/_/g, " ")}`));
  return results;
}

async function code(me, id) {
  const t = (await rest(`officials?id=eq.${encodeURIComponent(id)}&camp_id=eq.${encodeURIComponent(me.camp_id)}&select=*`)).body?.[0];
  if (!t || !t.active) return { status: 404, body: { error: "Not found" } };
  const lead = ["director", "deputy"].includes(me.role);
  if (!lead && !(me.role === "unit_head" && t.unit_id === me.unit_id)) return { status: 403, body: { error: "Not allowed" } };
  const g = await call("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email: t.email }) });
  const otp = g.body?.email_otp || g.body?.properties?.email_otp;
  if (!g.ok || !otp) return { status: 502, body: { error: "Couldn't make a code" } };
  await audit(me, "code", t.name, [`Made a one-time sign-in code for ${t.name}`]);
  return { status: 200, body: { code: otp, email: t.email, name: t.name, phone: t.phone } };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!URL_ || !KEY) return res.status(503).json({ error: "Not set up yet" });
  try {
    const me = await caller(req);
    if (!me) return res.status(401).json({ error: "Sign in again" });
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (b.action === "invite") {
      if (!Array.isArray(b.people) || !b.people.length || b.people.length > 300) return res.status(400).json({ error: "Send 1 to 300 people" });
      return res.status(200).json({ results: await invite(me, b.people, !!b.dry) });
    }
    if (b.action === "code") { const r = await code(me, b.id); return res.status(r.status).json(r.body); }
    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    console.error(e); return res.status(500).json({ error: "Something went wrong" });
  }
};
module.exports._test = { check, waEmail, endsAt };
