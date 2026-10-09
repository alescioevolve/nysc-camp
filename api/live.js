/* One shared copy of the camp data for every phone.
   Vercel's edge keeps the answer for 30 s, so GitHub is asked at most a few times a minute
   no matter how many corps members have the app open. */
const SRC = "https://raw.githubusercontent.com/alescioevolve/camp-companion-data/main/camp.json";

module.exports = async (req, res) => {
  try {
    const r = await fetch(SRC + "?t=" + Date.now(), { headers: { "Cache-Control": "no-cache" } });
    if (!r.ok) throw new Error("upstream " + r.status);
    const body = await r.text();
    JSON.parse(body); // never cache a broken copy
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.setHeader("CDN-Cache-Control", "public, s-maxage=30, stale-while-revalidate=60, stale-if-error=86400");
    res.setHeader("X-Camp-Fetched", new Date().toISOString());
    res.status(200).send(body);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Couldn't reach the camp data right now." });
  }
};
