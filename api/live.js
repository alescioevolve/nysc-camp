/* One shared copy of the camp data for every phone.
   Source of truth is Supabase when it's set up and the active camp has content;
   otherwise the old GitHub copy. Vercel's edge keeps the answer for 30 s, so the
   database is asked at most a few times a minute however many phones are open. */
const GH = "https://raw.githubusercontent.com/alescioevolve/camp-companion-data/main/camp.json";
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LAGOS = 60 * 60 * 1000; // UTC+1, no daylight saving

const pad = n => String(n).padStart(2, "0");
function local(ts) { // timestamptz → { d: "YYYY-MM-DD", t: "HH:MM" } in Lagos time
  const x = new Date(new Date(ts).getTime() + LAGOS);
  return { d: `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`, t: `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}` };
}

async function rest(path) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`supabase ${r.status}`);
  return r.json();
}

async function fromSupabase() {
  const [camp] = await rest("camps?active=eq.true&select=id,name,starts_on,ends_on,platoons&limit=1");
  if (!camp) return null;
  const id = encodeURIComponent(camp.id);
  const [secs, anns] = await Promise.all([
    rest(`sections?camp_id=eq.${id}&select=key,data,updated_at,officials(name)`),
    rest(`announcements?camp_id=eq.${id}&removed=eq.false&select=id,title,body,urgent,platoon,from_at,to_at,created_at,officials(name)&order=created_at.desc&limit=200`)
  ]);
  if (!secs.length) return null; // camp not loaded yet: keep serving the old copy
  const out = { schema: 1, updatedAt: "", updatedBy: "", camp: { id: camp.id, name: camp.name, startsOn: camp.starts_on, endsOn: camp.ends_on, platoons: camp.platoons },
    days: {}, menu: [], fixtures: [], announcements: [], bestLosers: {} };
  let newest = "";
  for (const s of secs) {
    if (s.key.startsWith("days/")) out.days[s.key.slice(5)] = s.data;
    else out[s.key] = s.data;
    if (s.updated_at > newest) { newest = s.updated_at; out.updatedBy = s.officials?.name || ""; }
  }
  for (const a of anns) {
    const f = local(a.from_at), t = a.to_at ? local(a.to_at) : null;
    out.announcements.push({ id: a.id, title: a.title, body: a.body, urgent: a.urgent, platoon: a.platoon || "",
      from: f.d, fromT: f.t, to: t ? t.d : f.d, toT: t ? t.t : "", postedAt: a.created_at, by: a.officials?.name || "" });
    if (a.created_at > newest) { newest = a.created_at; out.updatedBy = a.officials?.name || ""; }
  }
  // An announcement with no end shows until its start day is over, as before; one that runs past midnight needs an end.
  out.updatedAt = newest ? new Date(newest).toISOString() : new Date().toISOString();
  return JSON.stringify(out);
}

async function fromGitHub() {
  const r = await fetch(GH + "?t=" + Date.now(), { headers: { "Cache-Control": "no-cache" } });
  if (!r.ok) throw new Error("upstream " + r.status);
  return r.text();
}

module.exports = async (req, res) => {
  let body = null, source = "github";
  try {
    if (URL_ && KEY) { body = await fromSupabase(); if (body) source = "supabase"; }
  } catch (e) { console.error("supabase feed failed, falling back:", e.message); }
  try {
    if (!body) body = await fromGitHub();
    JSON.parse(body); // never cache a broken copy
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.setHeader("CDN-Cache-Control", "public, s-maxage=30, stale-while-revalidate=60, stale-if-error=86400");
    res.setHeader("X-Camp-Source", source);
    res.setHeader("X-Camp-Fetched", new Date().toISOString());
    res.status(200).send(body);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Couldn't reach the camp data right now." });
  }
};
