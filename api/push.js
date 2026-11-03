/* Sends phone notifications.
   { announcement: id } → every subscribed phone, or one platoon's phones if the notice is for a platoon.
   { duty: id }         → the phones of the official the duty is assigned to.
   Only the official who created it (or the Director / Deputy) can send. */
const webpush = require("web-push");
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUB = process.env.VAPID_PUBLIC_KEY, PRIV = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "https://camp-companion-nysc.vercel.app";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function call(path, opt = {}) {
  const r = await fetch(`${URL_}${path}`, { ...opt, headers: { ...H, ...(opt.headers || {}) } });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch {}
  return { ok: r.ok, status: r.status, body: j };
}
const rest = (p, o) => call(`/rest/v1/${p}`, o);
const q = encodeURIComponent;

async function caller(req) {
  const tok = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!tok) return null;
  const u = await call("/auth/v1/user", { headers: { Authorization: `Bearer ${tok}` } });
  if (!u.ok || !u.body?.id) return null;
  const r = await rest(`officials?user_id=eq.${u.body.id}&active=eq.true&expires_at=gt.${new Date().toISOString()}&select=*,camps!inner(id,active)&camps.active=eq.true&limit=1`);
  return r.ok && r.body?.[0] ? r.body[0] : null;
}
const lead = me => ["director", "deputy"].includes(me.role);

const fmt = ts => new Date(ts).toLocaleString("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

async function send(subs, payload, urgent) {
  let sent = 0, gone = [];
  const body = JSON.stringify(payload);
  for (let i = 0; i < subs.length; i += 50) {
    await Promise.all(subs.slice(i, i + 50).map(async s => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body,
          { TTL: 6 * 3600, urgency: urgent ? "high" : "normal", topic: String(payload.tag || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined });
        sent++;
      } catch (e) { if (e.statusCode === 404 || e.statusCode === 410) gone.push(s.endpoint); }
    }));
  }
  for (const ep of gone) await rest(`push_subs?endpoint=eq.${q(ep)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  return { sent, failed: subs.length - sent, removed: gone.length };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!URL_ || !KEY || !PUB || !PRIV) return res.status(503).json({ error: "Notifications aren't set up yet" });
  try {
    webpush.setVapidDetails(SUBJECT, PUB, PRIV);
    const me = await caller(req);
    if (!me) return res.status(401).json({ error: "Sign in again" });
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const camp = q(me.camp_id);
    let subs, payload, urgent = false, what;
    if (b.announcement) {
      const a = (await rest(`announcements?id=eq.${q(b.announcement)}&camp_id=eq.${camp}&removed=eq.false&select=*`)).body?.[0];
      if (!a) return res.status(404).json({ error: "Not found" });
      if (!(lead(me) || a.created_by === me.id)) return res.status(403).json({ error: "Not allowed" });
      subs = (await rest(`push_subs?camp_id=eq.${camp}${a.platoon ? `&platoon=eq.${q(a.platoon)}` : ""}&select=endpoint,p256dh,auth`)).body || [];
      urgent = !!a.urgent;
      payload = { title: (a.urgent ? "Urgent: " : "") + a.title, body: a.body || (a.platoon ? `For Platoon ${a.platoon}` : "Camp announcement"), url: "/app/", tag: "a" + a.id.replace(/-/g, "").slice(0, 20), urgent };
      what = `Sent "${a.title}" to ${a.platoon ? `Platoon ${a.platoon}` : "everyone"}`;
    } else if (b.duty) {
      const d = (await rest(`duties?id=eq.${q(b.duty)}&camp_id=eq.${camp}&select=*`)).body?.[0];
      if (!d) return res.status(404).json({ error: "Not found" });
      if (!(lead(me) || d.created_by === me.id)) return res.status(403).json({ error: "Not allowed" });
      subs = (await rest(`push_subs?official_id=eq.${q(d.assignee)}&select=endpoint,p256dh,auth`)).body || [];
      urgent = true;
      payload = { title: `New duty: ${d.title}`, body: [d.due_at ? `Due ${fmt(d.due_at)}` : "", d.details].filter(Boolean).join(" · ") || `From ${me.name}`, url: "/private-admin/#dashboard", tag: "d" + d.id.replace(/-/g, "").slice(0, 20), urgent };
      what = `Sent duty alert "${d.title}"`;
    } else return res.status(400).json({ error: "Nothing to send" });
    const r = await send(subs, payload, urgent);
    await rest("audit", { method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ camp_id: me.camp_id, actor: me.id, actor_name: me.name, action: "push", target: payload.tag, lines: [`${what}: ${r.sent} phone${r.sent === 1 ? "" : "s"}`] }) });
    return res.status(200).json(r);
  } catch (e) {
    console.error(e); return res.status(500).json({ error: "Couldn't send" });
  }
};
