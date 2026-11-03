/* Officials' sign-in by code, the Today home, and People (invites, roles, WhatsApp codes, units).
   Loaded before the main admin script; it uses the main script's helpers ($, esc, openSheet,
   closeSheet, ask, toast, render, tab, work, DATES) only inside functions, at run time. */

/* ════════ Sign-in with a code ════════ */
const SIGNIN = { id: "", step: "id" };
function sbLoginHTML(){
  const s = SIGNIN;
  return s.step === "id" ? `
    <label class="f"><span>Email or phone number</span><input type="text" id="sb-id" autocomplete="username" inputmode="email" value="${esc(s.id)}" placeholder="Email or phone number" required></label>
    <button class="btn primary" type="submit" id="sb-go">Continue</button>`
  : `<p class="help" style="margin:0 0 10px">${SB.isEmail(s.id)
      ? `Enter the code we sent to <b>${esc(s.id)}</b>.`
      : `Enter the code the Deputy Camp Director or your unit head sent you.`}</p>
    <label class="f"><span>Code</span><input type="text" id="sb-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="Code" required></label>
    <button class="btn primary" type="submit" id="sb-go">Sign in</button>
    <div class="stack" style="margin-top:8px"><button class="btn ghost" type="button" id="sb-back">Change email or phone</button>
      ${SB.isEmail(s.id) ? `<button class="btn ghost" type="button" id="sb-resend">Send a new code</button>` : ""}</div>`;
}
function paintSbLogin(){ const f = $("#sbform-in"); if (f) { f.innerHTML = sbLoginHTML(); const i = f.querySelector("input"); if (i) setTimeout(() => i.focus(), 50); } }
async function sbSubmit(e){
  e.preventDefault();
  const btn = $("#sb-go"); btn.disabled = true; say("", "info", "#smsg");
  try {
    if (SIGNIN.step === "id") {
      SIGNIN.id = $("#sb-id").value.trim();
      if (!SB.isEmail(SIGNIN.id) && SIGNIN.id.replace(/\D/g, "").length < 10) { say("Enter your email, or your phone number with all 11 digits.", "err", "#smsg"); return; }
      btn.textContent = "Sending…";
      await SB.sendCode(SIGNIN.id);
      SIGNIN.step = "code"; paintSbLogin();
    } else {
      const code = $("#sb-code").value.replace(/\D/g, "");
      if (code.length < 6) { say("Enter the full code.", "err", "#smsg"); return; }
      btn.textContent = "Signing in…";
      const me = await SB.verify(SIGNIN.id, code);
      if (!me) { await SB.signOut(); say("You're signed in, but you're not on this camp's list of officials. Ask the Deputy Camp Director to add you.", "err", "#smsg"); SIGNIN.step = "id"; paintSbLogin(); return; }
      SIGNIN.step = "id"; await afterSbSignIn();
    }
  } catch (x) {
    const m = String(x.message || "");
    say(/expired|invalid|token/i.test(m) ? "That code didn't work or has expired. Check it, or ask for a new one."
      : /not allowed|signups not allowed|user not found/i.test(m) ? "That email isn't on the list of officials. Use the one you were added with, or ask the Deputy Camp Director."
      : /rate|seconds/i.test(m) ? "Please wait a minute before asking for another code."
      : "Can't reach the server. Check your network and try again.", "err", "#smsg");
  } finally { const b = $("#sb-go"); if (b) { b.disabled = false; b.textContent = SIGNIN.step === "id" ? "Continue" : "Sign in"; } }
}
document.addEventListener("click", async e => {
  if (e.target.closest("#sb-back")) { SIGNIN.step = "id"; say("", "info", "#smsg"); paintSbLogin(); }
  if (e.target.closest("#sb-resend")) { try { await SB.sendCode(SIGNIN.id); say("A new code is on its way.", "ok", "#smsg"); } catch (x) { say("Please wait a minute before asking for another code.", "err", "#smsg"); } }
  if (e.target.closest("#use-code")) { $("#sbform").hidden = true; $("#lgform").hidden = false; }
  if (e.target.closest("#use-sb")) { $("#sbform").hidden = false; $("#lgform").hidden = true; paintSbLogin(); }
});

/* ════════ Today (home) ════════ */
const SEC_TAB = { days: ["time", "Timetable"], menu: ["menu", "Menu"], roster: ["menu", "Kitchen duty"], fixtures: ["fix", "Fixtures and results"], standings: ["st", "Standings"] };
function homeTab(){
  const me = SB.me, today = lagosToday(), items = (work.days[today] || []), m = lagosMin();
  const now = items.find(x => toM(x[0]) <= m && m < endM(x)), next = items.find(x => toM(x[0]) > m);
  const first = (me.name || "").split(/\s+/)[0];
  const hr = +new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", hourCycle: "h23" }).format(new Date());
  const hi = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const can = SB.SECTIONS.filter(s => SEC_TAB[s] && SB.canEdit(s)).map(s => SEC_TAB[s]).filter((x, i, l) => l.findIndex(y => y[0] === x[0]) === i);
  if (SB.canAnnounce()) can.unshift(["notice", me.role === "platoon_officer" ? `Announcements for Platoon ${me.platoon}` : "Announcements"]);
  if (DUTIES === null && !DUTIES_ERR) loadDuties().then(() => { if (tab === "home") render(); });
  const myOpen = (DUTIES || []).filter(d => d.assignee === me.id && d.status === "open");
  can.unshift(["duties", myOpen.length ? `Your duties · ${myOpen.length} open` : canAssign() ? "Duties" : "Your duties"]);
  if (SB.canPeople()) can.push(["people", SB.lead() ? "People and roles" : me.role === "coordinator" ? "People (view only)" : "Your unit's people"]);
  const live = CAMP.notices ? work.announcements.filter(a => a.from <= today && today <= (a.to || a.from)).length : 0;
  const dayN = DATES.indexOf(today);
  const ann = me.role === "platoon_officer" ? work.announcements.filter(a => a.platoon === me.platoon) : null;
  return `<h2>${hi}, ${esc(first)}</h2>
    <p class="sub">${esc(SB.roleLabel())}${SB.unit ? ` · ${esc(SB.unit.name)}` : ""}${dayN >= 0 ? ` · Day ${dayN + 1} of ${DATES.length}` : ""}</p>
    <div class="card"><div class="meal-h">Right now</div>
      ${now ? `<p class="tip"><b style="color:var(--ink)">${esc(now[2])}</b> until ${fmt12(now[1])}</p>`
        : today < DATES[0] ? `<p class="tip">Camp starts ${nice(DATES[0])}. First up: ${esc(((work.days[DATES[0]] || [])[0] || [, , "the programme"])[2])}.</p>`
        : `<p class="tip">Nothing on the timetable right now.</p>`}
      ${next ? `<p class="tip" style="margin-top:4px">Next: ${esc(next[2])} at ${fmt12(next[0])}</p>` : ""}
      <p class="tip" style="margin-top:4px">${live} announcement${live === 1 ? "" : "s"} showing today${ann ? ` · ${ann.length} for Platoon ${esc(me.platoon)}` : ""}</p></div>
    <div class="card"><div class="meal-h">What you look after</div>
      ${can.length ? `<div class="stack">${can.map(([t, l]) => `<button class="btn" data-tab="${t}" style="justify-content:space-between">${esc(l)}<span aria-hidden="true">›</span></button>`).join("")}</div>`
        : `<p class="tip">You can view the camp but not change anything yet. Ask the Deputy Camp Director if you need access.</p>`}</div>
    ${SB.lead() ? `<div class="card"><div class="meal-h">Your team</div><p class="tip" id="home-team">${teamSummary()}</p>
      <div class="stack"><button class="btn" data-tab="people">Add or manage officials</button></div></div>` : ""}
    <p class="tip" style="text-align:center;margin-top:6px">Every change you make is saved with your name in Activity.</p>`;
}
function teamSummary(){
  if (!TEAM) { loadTeam().then(() => { const el = $("#home-team"); if (el) el.textContent = teamSummary(); }); return "Loading…"; }
  const act = TEAM.officials.filter(o => o.active);
  return `${act.length} official${act.length === 1 ? "" : "s"} in ${TEAM.units.length} unit${TEAM.units.length === 1 ? "" : "s"}.`;
}

/* ════════ People ════════ */
let TEAM = null, TEAM_ERR = false;
async function loadTeam(){ try { TEAM = await SB.people(); TEAM_ERR = false; } catch (e) { TEAM_ERR = true; } return TEAM; }
const ROLE_ORDER = ["admin", "director", "deputy", "coordinator", "unit_head", "unit_member", "platoon_officer", "delegate"];
const ROLE_DESC = {
  admin: "Sets up and supports the app. Can change everything.",
  director: "Can change everything and manage all officials.",
  deputy: "Can change everything and manage officials.",
  coordinator: "Can see everything, but can't change it.",
  unit_head: "Runs a unit. Posts announcements and manages the unit's people.",
  unit_member: "Helps a unit with what it looks after.",
  platoon_officer: "Posts announcements to their own platoon.",
  delegate: "A helper. Can change only what you switch on below." };
const SEC_NAME = { days: "Timetable", menu: "Menu", roster: "Kitchen duty", fixtures: "Fixtures and results", bestLosers: "Best losers", standings: "Standings" };
const SEC_LIST = ["days", "menu", "roster", "fixtures", "bestLosers", "standings"];
const initials = n => String(n || "").split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
function grantable(){
  const me = SB.me;
  if (me.role === "admin") return ROLE_ORDER;
  if (me.role === "director") return ROLE_ORDER.filter(r => r !== "admin");
  if (me.role === "deputy") return ROLE_ORDER.filter(r => !["admin", "director"].includes(r));
  if (me.role === "unit_head") return ["unit_member", "delegate"];
  return [];
}
function peopleTab(){
  if (!TEAM && !TEAM_ERR) { loadTeam().then(() => { if (tab === "people") render(); }); return `<h2>People</h2><p class="sub">Loading…</p>`; }
  if (TEAM_ERR) return `<h2>People</h2><div class="card empty">Couldn't load the list. Check your network.<div class="stack"><button class="btn" id="team-retry">Try again</button></div></div>`;
  const me = SB.me, canAdd = grantable().length > 0, lead = SB.lead();
  const units = TEAM.units, by = {};
  TEAM.officials.forEach(o => { const k = o.role === "admin" ? "_support" : o.unit_id || (["director", "deputy", "coordinator"].includes(o.role) ? "_lead" : o.role === "platoon_officer" ? "_po" : "_other"); (by[k] = by[k] || []).push(o); });
  const groups = [["_lead", "Camp leadership"], ...units.map(u => [u.id, u.name]), ["_po", "Platoon officers"], ["_other", "Others"], ["_support", "App support"]].filter(([k]) => by[k]);
  const row = o => `<button class="tl-row" data-pp="${o.id}" style="grid-template-columns:40px minmax(0,1fr) auto;${o.active ? "" : "opacity:.5"}">
      <span class="avatar" style="width:34px;height:34px;font-size:12.5px">${esc(initials(o.name))}</span>
      <span><span class="nm">${esc(o.name)}${o.id === me.id ? " (you)" : ""}</span><span class="mt">${esc(SB.roleLabel(o))}${!o.active ? " · no access" : ""}</span></span>
      <span class="rt">›</span></button>`;
  return `<h2>People</h2><p class="sub">${canAdd ? "Tap a person to change their role or send them a sign-in code." : "Officials on this camp."}</p>
    ${canAdd ? `<div class="row" style="margin-bottom:12px"><button class="btn primary" id="pp-one">+ Add a person</button><button class="btn" id="pp-add">Paste a list</button></div>` : ""}
    ${groups.map(([k, label]) => `<div class="meal-h" style="margin:14px 2px 6px">${esc(label)} <span style="color:var(--muted);font-weight:500">· ${by[k].length}</span></div>
      <div class="card tl">${by[k].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name)).map(row).join("")}</div>`).join("") || `<div class="card empty">No officials yet.</div>`}
    ${lead ? `<div class="meal-h" style="margin:18px 2px 6px">Units</div>
      <div class="card tl">${units.map(u => `<button class="tl-row" data-unit="${u.id}" style="grid-template-columns:minmax(0,1fr) auto">
        <span><span class="nm">${esc(u.name)}</span><span class="mt">${u.sections.length ? u.sections.map(s => SEC_NAME[s]).join(", ") : "Announcements only"}</span></span><span class="rt">›</span></button>`).join("") || `<div class="empty">No units yet.</div>`}</div>
      <button class="btn full" id="unit-add">+ Add a unit</button>` : ""}`;
}

/* ── One form for adding or changing a person: dropdowns and switches, only the fields that apply ── */
const NEEDS_UNIT = ["unit_head", "unit_member", "delegate"];
function personFields(x, isNew){
  const me = SB.me, ROLES = grantable(), units = TEAM.units.filter(u => SB.lead() || u.id === me.unit_id);
  const n = (SB.camp && SB.camp.platoons) || CAMP.platoons.length;
  return `${isNew ? `<label class="f"><span>Full name</span><input type="text" id="pf-n" autocapitalize="words" value="${esc(x.name || "")}"></label>
    <label class="f"><span>Phone number</span><input type="tel" id="pf-ph" inputmode="tel" value="${esc(x.phone || "")}" placeholder="0803 123 4567"></label>
    <label class="f"><span>Email (optional)</span><input type="email" id="pf-em" inputmode="email" value="${esc(x.email || "")}"></label>
    <p class="tip" style="margin:-4px 0 10px">No email? You'll send their sign-in code on WhatsApp.</p>` : ""}
    <label class="f"><span>Role</span><select id="pf-r">${isNew ? `<option value="">Choose a role</option>` : ""}${ROLES.map(r => `<option value="${r}" ${r === x.role ? "selected" : ""}>${esc(SB.ROLE_NAME[r])}</option>`).join("")}${!x.role || ROLES.includes(x.role) ? "" : `<option selected>${esc(SB.ROLE_NAME[x.role])}</option>`}</select></label>
    <p class="tip" id="pf-rd" style="margin:-4px 0 10px"></p>
    <label class="f" id="pf-uw"><span>Unit</span><select id="pf-u"><option value="">Choose a unit</option>${units.map(u => `<option value="${u.id}" ${u.id === x.unit_id ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select></label>
    <label class="f" id="pf-pw"><span>Platoon</span><select id="pf-p"><option value="">Choose a platoon</option>${Array.from({ length: n }, (_, i) => String(i + 1)).map(p => `<option value="${p}" ${p === String(x.platoon || "") ? "selected" : ""}>Platoon ${p}</option>`).join("")}</select></label>
    <div id="pf-sw"><div class="meal-h" style="margin:4px 0 6px">Can change</div>
      ${SEC_LIST.map(s => `<label class="switch-row" style="padding:8px 0"><b style="font-weight:600">${SEC_NAME[s]}</b><input type="checkbox" class="switch" data-sc="${s}" ${(x.scopes || []).includes(s) ? "checked" : ""}></label>`).join("")}</div>`;
}
function wirePerson(d){
  const show = () => { const r = d.querySelector("#pf-r").value;
    d.querySelector("#pf-rd").textContent = ROLE_DESC[r] || "";
    d.querySelector("#pf-uw").hidden = !NEEDS_UNIT.includes(r);
    d.querySelector("#pf-pw").hidden = r !== "platoon_officer"; d.querySelector("#pf-sw").hidden = r !== "delegate"; };
  show(); d.querySelector("#pf-r").onchange = show;
}
function readPerson(d){
  const r = d.querySelector("#pf-r").value, out = { role: r,
    unit_id: NEEDS_UNIT.includes(r) ? d.querySelector("#pf-u").value || null : null,
    platoon: r === "platoon_officer" ? d.querySelector("#pf-p").value : null,
    scopes: r === "delegate" ? [...d.querySelectorAll("[data-sc]:checked")].map(c => c.dataset.sc) : [] };
  const w = !r ? "Choose a role." : ["unit_head", "unit_member"].includes(r) && !out.unit_id ? "Choose a unit."
    : r === "platoon_officer" && !out.platoon ? "Choose a platoon." : r === "delegate" && !out.scopes.length ? "Switch on at least one thing they can change." : "";
  return { out, w };
}
function addOne(){
  const d = openSheet(`<div class="grab"></div><h3>Add a person</h3>${personFields({}, true)}
    <div class="warn" id="pf-w"></div>
    <div class="sheet-f"><button class="btn ghost" id="pf-c">Cancel</button><button class="btn primary" id="pf-ok">Add</button></div>`);
  wirePerson(d); setTimeout(() => d.querySelector("#pf-n").focus(), 250);
  d.querySelector("#pf-c").onclick = () => closeSheet();
  d.querySelector("#pf-ok").onclick = async () => {
    const { out, w } = readPerson(d), name = d.querySelector("#pf-n").value.trim(), phone = d.querySelector("#pf-ph").value.trim(), email = d.querySelector("#pf-em").value.trim();
    const warn = !name ? "Enter their name." : !phone && !email ? "Enter a phone number or an email." : w;
    if (warn) { d.querySelector("#pf-w").textContent = warn; return; }
    const unit = (TEAM.units.find(u => u.id === out.unit_id) || {}).name || "";
    const btn = d.querySelector("#pf-ok"); btn.disabled = true; btn.textContent = "Adding…";
    try {
      const r = await SB.invite([{ name, phone, email, role: out.role, unit, platoon: out.platoon || "", scopes: out.scopes }], false), x = r.results[0];
      if (!x.ok) { d.querySelector("#pf-w").textContent = x.error; btn.disabled = false; btn.textContent = "Add"; return; }
      closeSheet(); TEAM = null; await loadTeam(); render();
      toast(`${name} added`);
      if (!email) editPerson(x.id, true);   // phone only: straight to sending their code
    } catch (e) { d.querySelector("#pf-w").textContent = e.message || "Couldn't add them. Check your network."; btn.disabled = false; btn.textContent = "Add"; }
  };
}

/* ── Paste a list: works with spreadsheet rows, comma lists and WhatsApp messages ── */
const ROLE_ALIAS = [
  [/\bdeputy camp director\b|\bdcd\b|\bdeputy\b/i, "deputy"], [/\bcamp director\b|\bdirector\b|\bcd\b/i, "director"],
  [/\bstate coordinator\b|\bcoordinator\b|\bsc\b/i, "coordinator"], [/\bplatoon officers?\b|\bp\.?o\.?\b|\bplatoon inspector\b/i, "platoon_officer"],
  [/\bunit head\b|\bhead\b|\bhod\b|\bchairman\b|\bchairperson\b|\bleader?\b/i, "unit_head"], [/\bunit members?\b|\bmember\b/i, "unit_member"],
  [/\bdelegates?\b|\bhelper\b|\bvolunteer\b|\brecorder\b/i, "delegate"]];
function parseLine(line, units){
  let s = " " + line.replace(/\t/g, " , ") + " ";
  const take = re => { const m = s.match(re); if (!m) return ""; s = s.replace(m[0], " "); return m[1] !== undefined ? m[1] : m[0]; };
  const email = take(/[^\s,;|<>]+@[^\s,;|<>]+\.[a-z]{2,}/i).toLowerCase();
  const phone = take(/(?:\+?234|0)\s*[789][01](?:[\s-]?\d){8}/).replace(/[^\d+]/g, "");
  const platoon = take(/\b(?:platoon|plt|pl)\s*(?:no\.?)?\s*#?\s*(\d{1,2})\b/i);
  let role = ""; for (const [re, r] of ROLE_ALIAS) { if (re.test(s)) { role = r; s = s.replace(re, " "); break; } }
  let unit = ""; for (const u of [...units].sort((a, b) => b.name.length - a.name.length)) {
    const re = new RegExp(`\\b${u.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b(\\s+unit)?`, "i"); if (re.test(s)) { unit = u.name; s = s.replace(re, " "); break; } }
  const name = s.replace(/\b(unit|platoon|email|phone|tel|role|name)\b\s*:?/gi, " ").replace(/[,;|:()\-–]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, c => c.toUpperCase());
  const u = units.find(x => x.name === unit);
  const scopes = role === "delegate" ? (u && u.sections.length ? u.sections : ["standings"]) : [];
  return { name, email, phone, role, unit, platoon, scopes };
}
function parseList(txt, units){
  return txt.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^name\b.*\brole\b/i.test(l)).map(l => parseLine(l, units)).slice(0, 300);
}
function addPeople(){
  const units = TEAM ? TEAM.units : [];
  const d = openSheet(`<div class="grab"></div><h3>Paste a list</h3>
    <p class="sub">One person per line: name, phone or email, role, and their unit or platoon. A copied spreadsheet or WhatsApp list works.</p>
    <p class="tip" style="margin-bottom:8px">For example:<br><code>Ada Obi, 08051112222, Sports, Unit head</code><br><code>Bayo Ade, 07033334444, Platoon officer, Platoon 4</code></p>
    <label class="f"><span>List</span><textarea id="pp-txt" rows="7" placeholder="One person per line"></textarea></label>
    <div id="pp-prev"></div><div class="warn" id="pp-w"></div>
    <div class="sheet-f"><button class="btn ghost" id="pp-c">Cancel</button><button class="btn primary" id="pp-check">Check list</button></div>`);
  let rows = [], ready = [];
  const ROLES = grantable();
  d.querySelector("#pp-c").onclick = () => closeSheet();
  d.querySelector("#pp-check").onclick = async () => {
    const btn = d.querySelector("#pp-check");
    if (btn.dataset.ok) {   // second tap: add them
      btn.disabled = true; btn.textContent = "Adding…";
      try {
        const r = await SB.invite(ready, false);
        const okN = r.results.filter(x => x.ok).length, bad = r.results.filter(x => !x.ok);
        closeSheet(); TEAM = null; render();
        toast(`${okN} official${okN === 1 ? "" : "s"} added${bad.length ? `, ${bad.length} skipped` : ""}`);
        say(okN ? "Added. People with email get their code when they sign in. For phone-only people, tap their name and send the code on WhatsApp." : "No one was added. Check the list and try again.", okN ? "ok" : "err");
      } catch (x) { d.querySelector("#pp-w").textContent = x.message || "Couldn't add them. Try again."; btn.disabled = false; btn.textContent = "Add them"; }
      return;
    }
    rows = parseList(d.querySelector("#pp-txt").value, units);
    if (!rows.length) { d.querySelector("#pp-w").textContent = "Paste at least one person."; return; }
    btn.disabled = true; btn.textContent = "Checking…";
    try {
      const r = await SB.invite(rows.map(x => ({ ...x, role: ROLES.includes(x.role) ? x.role : (x.role || "") })), true);
      ready = r.results.filter(x => x.ok).map(x => rows[x.i]);
      d.querySelector("#pp-prev").innerHTML = `<div class="card tl" style="margin-top:4px">${r.results.map(x => { const p = rows[x.i];
        return `<div class="tl-row" style="grid-template-columns:22px minmax(0,1fr);cursor:default"><span style="color:${x.ok ? "var(--green-2)" : "var(--alert)"};font-weight:800">${x.ok ? "✓" : "✗"}</span>
          <span><span class="nm">${esc(p.name || "No name")}</span><span class="mt">${x.ok ? esc([SB.ROLE_NAME[p.role], p.unit, p.platoon && "Platoon " + p.platoon, p.email || p.phone].filter(Boolean).join(" · ")) : `<b style="color:var(--alert)">${esc(x.error)}</b>`}</span></span></div>`; }).join("")}</div>`;
      d.querySelector("#pp-w").textContent = ready.length < rows.length ? `${rows.length - ready.length} line${rows.length - ready.length === 1 ? "" : "s"} need fixing. Edit the list and tap Check again, or add the good ones now.` : "";
      d.querySelector("#pp-txt").oninput = () => { btn.dataset.ok = ""; btn.textContent = "Check list"; };
      if (ready.length) { btn.dataset.ok = "1"; btn.textContent = `Add ${ready.length}`; }
      else btn.textContent = "Check list";
    } catch (x) { d.querySelector("#pp-w").textContent = x.message || "Couldn't check the list."; btn.textContent = "Check list"; }
    finally { btn.disabled = false; }
  };
}
function editPerson(id, codeNow){
  const o = TEAM.officials.find(x => x.id === id); if (!o) return;
  const me = SB.me, canChange = SB.canChangeRole(o);
  const canCode = o.active && (SB.lead() || (me.role === "unit_head" && o.unit_id === me.unit_id));
  const d = openSheet(`<div class="grab"></div><h3>${esc(o.name)}</h3>
    <p class="sub">${esc([o.email_real ? o.email : "", o.phone].filter(Boolean).join(" · ") || "No contact")}</p>
    ${canChange ? personFields(o, false) : `<p class="tip">${esc(SB.roleLabel(o))}${o.unit_id ? " · " + esc((TEAM.units.find(u => u.id === o.unit_id) || {}).name || "") : ""}</p>`}
    <div class="warn" id="pf-w"></div>
    ${canCode ? `<div class="stack"><button class="btn" id="pe-code">Send sign-in code on WhatsApp</button></div>` : ""}
    <div class="sheet-f">${canChange ? `<button class="del" id="pe-rm">${o.active ? "Remove access" : "Give access back"}</button>` : ""}
      <button class="btn ghost" id="pe-c">${canChange ? "Cancel" : "Close"}</button>${canChange ? `<button class="btn primary" id="pe-ok">Save</button>` : ""}</div>`);
  if (canChange) wirePerson(d);
  d.querySelector("#pe-c").onclick = () => closeSheet();
  const save = async active => {
    const { out, w } = canChange ? readPerson(d) : { out: { role: o.role, unit_id: o.unit_id, platoon: o.platoon, scopes: o.scopes } , w: "" };
    if (w && active) { d.querySelector("#pf-w").textContent = w; return false; }
    try { await SB.setOfficial({ id: o.id, ...out, active }); TEAM = null; closeSheet(); render(); return true; }
    catch (e) { d.querySelector("#pf-w").textContent = /not_allowed/.test(e.message) ? "You can't make that change." : "Couldn't save. Check your network."; return false; }
  };
  const ok = d.querySelector("#pe-ok"); if (ok) ok.onclick = async () => { if (await save(o.active)) toast(`Saved ${o.name}`); };
  const rm = d.querySelector("#pe-rm"); if (rm) rm.onclick = async () => {
    if (o.active && !(await ask(`Remove ${o.name}'s access?`, "They're signed out straight away. You can give access back later.", "Remove access"))) return;
    if (await save(!o.active)) toast(o.active ? `${o.name} no longer has access` : `${o.name} has access again`);
  };
  const cb = d.querySelector("#pe-code"); if (cb) cb.onclick = async () => {
    cb.disabled = true; cb.textContent = "Making a code…";
    try {
      const r = await SB.code(o.id), url = location.origin + "/private-admin/";
      const login = o.email_real ? `your email (${o.email})` : `your phone number (${o.phone})`;
      const msg = `Hello ${o.name.split(/\s+/)[0]}, your Camp Companion sign-in code is ${r.code}.\n\nOpen ${url}\nEnter ${login}, tap Continue, then enter the code. It works once and expires in 1 hour.`;
      const ph = String(o.phone || "").replace(/\D/g, "").replace(/^0/, "234");
      cb.outerHTML = `<div class="card" style="text-align:center"><div class="tip">Sign-in code for ${esc(o.name)}</div>
        <div id="pe-codev" style="font:800 32px Inter,sans-serif;letter-spacing:.18em;margin:6px 0">${esc(r.code)}</div><div class="tip">Works once · expires in 1 hour</div>
        <div class="stack">${ph ? `<a class="btn primary" href="https://wa.me/${ph}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Send on WhatsApp</a>` : ""}
        <button class="btn" id="pe-copy">Copy message</button></div></div>`;
      d.querySelector("#pe-copy").onclick = () => { navigator.clipboard && navigator.clipboard.writeText(msg).then(() => toast("Message copied")); };
    } catch (x) { cb.disabled = false; cb.textContent = "Send sign-in code on WhatsApp"; d.querySelector("#pf-w").textContent = x.message || "Couldn't make a code."; }
  };
  if (codeNow && cb) setTimeout(() => cb.click(), 300);
}
const KINDS = [["programme", "Programme / timetable"], ["sports", "Sports"], ["socials", "Socials"], ["kitchen", "Kitchen"], ["saed", "SAED"], ["medical", "Medical"], ["welfare", "Welfare"], ["security", "Security"], ["general", "Other"]];
const KIND_SEC = { programme: ["days"], sports: ["fixtures", "bestLosers", "standings"], socials: ["standings"], kitchen: ["menu", "roster"] };
function editUnit(id){
  const isNew = !id, u = isNew ? { name: "", kind: "general", sections: [] } : { ...TEAM.units.find(x => x.id === id) };
  const d = openSheet(`<div class="grab"></div><h3>${isNew ? "New unit" : esc(u.name)}</h3>
    <label class="f"><span>Name</span><input type="text" id="un-n" value="${esc(u.name)}" placeholder="e.g. Sports"></label>
    <label class="f"><span>Type</span><select id="un-k">${KINDS.map(([k, l]) => `<option value="${k}" ${k === u.kind ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <div class="meal-h" style="margin:8px 0 6px">Members can change</div>
    ${SEC_LIST.map(s => `<label class="switch-row" style="padding:8px 0"><b style="font-weight:600">${SEC_NAME[s]}</b><input type="checkbox" class="switch" data-us="${s}" ${u.sections.includes(s) ? "checked" : ""}></label>`).join("")}
    <p class="tip">Unit heads can always post announcements.</p><div class="warn" id="un-w"></div>
    <div class="sheet-f">${isNew ? "" : `<button class="del" id="un-rm">Remove unit</button>`}<button class="btn ghost" id="un-c">Cancel</button><button class="btn primary" id="un-ok">${isNew ? "Add" : "Save"}</button></div>`);
  d.querySelector("#un-k").onchange = e => { if (!isNew) return; const s = KIND_SEC[e.target.value] || []; d.querySelectorAll("[data-us]").forEach(c => { c.checked = s.includes(c.dataset.us); }); };
  d.querySelector("#un-c").onclick = () => closeSheet();
  d.querySelector("#un-ok").onclick = async () => {
    const name = d.querySelector("#un-n").value.trim(); if (!name) { d.querySelector("#un-w").textContent = "Give the unit a name."; return; }
    try { await SB.saveUnit({ id: u.id, name, kind: d.querySelector("#un-k").value, sections: [...d.querySelectorAll("[data-us]:checked")].map(c => c.dataset.us) }); TEAM = null; closeSheet(); render(); toast(`Saved ${name}`); }
    catch (e) { d.querySelector("#un-w").textContent = /duplicate|unique/.test(e.message) ? "There's already a unit with that name." : "Couldn't save. Check your network."; }
  };
  const rm = d.querySelector("#un-rm"); if (rm) rm.onclick = async () => {
    if (!(await ask(`Remove the ${u.name} unit?`, "Its members stay on the list but lose what this unit lets them change.", "Remove"))) return;
    try { await SB.saveUnit(u, true); TEAM = null; closeSheet(); render(); toast(`Removed ${u.name}`); } catch (e) { d.querySelector("#un-w").textContent = "Couldn't remove it."; }
  };
}
document.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t || !window.SB || !SB.me) return;
  if (t.dataset.pp) editPerson(t.dataset.pp);
  else if (t.dataset.unit) editUnit(t.dataset.unit);
  else if (t.id === "pp-add") addPeople();
  else if (t.id === "pp-one") addOne();
  else if (t.id === "unit-add") editUnit(null);
  else if (t.id === "team-retry") { TEAM_ERR = false; render(); }
});

/* ════════ Duties ════════ */
let DUTIES = null, DUTIES_ERR = false;
async function loadDuties(){ try { DUTIES = await SB.duties(); DUTIES_ERR = false; } catch (e) { DUTIES_ERR = true; } return DUTIES; }
const canAssign = () => !!SB.me && (SB.lead() || SB.me.role === "unit_head");
const dueTxt = ts => ts ? new Date(ts).toLocaleString("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "";
function dutiesTab(){
  if (!DUTIES && !DUTIES_ERR) { loadDuties().then(() => { if (tab === "duties") render(); }); return `<h2>Duties</h2><p class="sub">Loading…</p>`; }
  if (DUTIES_ERR) return `<h2>Duties</h2><div class="card empty">Couldn't load duties. Check your network.<div class="stack"><button class="btn" id="duty-retry">Try again</button></div></div>`;
  const me = SB.me, now = Date.now();
  const mine = DUTIES.filter(d => d.assignee === me.id), others = DUTIES.filter(d => d.assignee !== me.id);
  const row = d => { const late = d.status === "open" && d.due_at && new Date(d.due_at).getTime() < now;
    return `<button class="tl-row" data-duty="${d.id}" style="grid-template-columns:26px minmax(0,1fr) auto">
      <span style="font-size:18px;color:${d.status === "done" ? "var(--green-2)" : late ? "var(--alert)" : "var(--faint)"}">${d.status === "done" ? "✓" : "○"}</span>
      <span><span class="nm" style="${d.status === "done" ? "text-decoration:line-through;color:var(--muted)" : ""}">${esc(d.title)}</span>
        <span class="mt">${esc([d.assignee === me.id ? `From ${d.creator_name || "an official"}` : d.assignee_name, d.due_at && (late ? "Overdue · " : "Due ") + dueTxt(d.due_at), d.status === "done" && d.note].filter(Boolean).join(" · "))}</span></span>
      <span class="rt">›</span></button>`; };
  const sect = (label, list) => list.length ? `<div class="meal-h" style="margin:14px 2px 6px">${label} <span style="color:var(--muted);font-weight:500">· ${list.filter(d => d.status === "open").length} open</span></div>
    <div class="card tl">${[...list.filter(d => d.status === "open"), ...list.filter(d => d.status === "done")].map(row).join("")}</div>` : "";
  const alertBtn = CampPush.ok && !CampPush.officialOn() ? `<div class="card"><div class="meal-h">Get duty alerts on this phone</div><p class="tip">You'll get a notification when someone assigns you a duty.</p><div class="stack"><button class="btn" id="duty-alerts">Turn on alerts</button></div></div>` : "";
  return `<h2>Duties</h2><p class="sub">${canAssign() ? "Assign tasks to officials, see who's done what, and follow up on anything overdue." : "Tasks assigned to you. Mark each one done when it's finished."}</p>
    ${canAssign() ? `<button class="btn full primary" id="duty-add" style="margin-bottom:12px">+ Assign a duty</button>` : ""}
    ${alertBtn}
    ${sect("Assigned to you", mine)}${sect(SB.lead() || me.role === "coordinator" ? "Everyone else" : "You assigned", others)}
    ${!DUTIES.length ? `<div class="card empty">No duties yet.</div>` : ""}`;
}
function editDuty(id){
  const me = SB.me, d0 = id ? DUTIES.find(x => x.id === id) : null;
  if (d0 && !(SB.lead() || d0.created_by === me.id)) return dutyDone(d0);
  const go = () => {
    const people = TEAM.officials.filter(o => o.active && (SB.lead() || o.unit_id === me.unit_id)).sort((a, b) => a.name.localeCompare(b.name));
    const today = lagosToday(), due = d0 && d0.due_at ? SB.local(d0.due_at) : { d: DATES.includes(today) ? today : DATES[0], t: "" };
    const d = openSheet(`<div class="grab"></div><h3>${d0 ? "Change duty" : "Assign a duty"}</h3>
      <label class="f"><span>What needs doing</span><input type="text" id="du-t" value="${esc(d0 ? d0.title : "")}" placeholder="e.g. Gate duty for the morning parade"></label>
      <label class="f"><span>Details (optional)</span><textarea id="du-d" rows="3" placeholder="Where, what to bring, who to report to">${esc(d0 ? d0.details : "")}</textarea></label>
      <label class="f"><span>Assign to</span><select id="du-a"><option value="">Choose a person</option>${people.map(o => `<option value="${o.id}" ${d0 && d0.assignee === o.id ? "selected" : ""}>${esc(o.name)} · ${esc(SB.roleLabel(o))}</option>`).join("")}</select></label>
      <div class="row"><label class="f"><span>Due date</span><input type="date" id="du-dd" value="${esc(due.d)}"></label>
        <label class="f"><span>Time (optional)</span><input type="time" id="du-dt" value="${esc(due.t === "00:00" ? "" : due.t)}"></label></div>
      ${CampPush.ready ? `<label class="check"><input type="checkbox" id="du-n" ${d0 ? "" : "checked"}> Send an alert to their phone</label>` : ""}
      <div class="warn" id="du-w"></div>
      <div class="sheet-f">${d0 ? `<button class="del" id="du-rm">Cancel duty</button>` : ""}<button class="btn ghost" id="du-c">Close</button><button class="btn primary" id="du-ok">${d0 ? "Save" : "Assign"}</button></div>`);
    d.querySelector("#du-c").onclick = () => closeSheet();
    d.querySelector("#du-ok").onclick = async () => {
      const t = d.querySelector("#du-t").value.trim(), a = d.querySelector("#du-a").value, dd = d.querySelector("#du-dd").value, dt = d.querySelector("#du-dt").value;
      const w = !t ? "Say what needs doing." : !a ? "Choose who it's for." : ""; if (w) { d.querySelector("#du-w").textContent = w; return; }
      const btn = d.querySelector("#du-ok"); btn.disabled = true;
      try {
        const nid = await SB.saveDuty({ id: d0 && d0.id, title: t, details: d.querySelector("#du-d").value.trim(), assignee: a, due_at: dd ? SB.toTs(dd, dt || "23:59") : null });
        const n = d.querySelector("#du-n"), sent = n && n.checked ? await SB.pushDuty(nid) : 0;
        DUTIES = null; closeSheet(); render();
        toast(d0 ? "Duty updated" : `Duty assigned${n && n.checked ? (sent ? " · alert sent" : " · they haven't turned on alerts") : ""}`);
      } catch (e) { btn.disabled = false; d.querySelector("#du-w").textContent = /not_allowed/.test(e.message) ? "You can only assign people in your unit." : "Couldn't save. Check your network."; }
    };
    const rm = d.querySelector("#du-rm"); if (rm) rm.onclick = async () => {
      if (!(await ask(`Cancel "${d0.title}"?`, `It comes off ${d0.assignee_name}'s list.`, "Cancel duty"))) return;
      try { await SB.saveDuty(d0, true); DUTIES = null; closeSheet(); render(); toast("Duty cancelled"); } catch (e) { d.querySelector("#du-w").textContent = "Couldn't cancel it."; }
    };
  };
  if (TEAM) go(); else loadTeam().then(() => TEAM ? go() : toast("Couldn't load the list of officials"));
}
function dutyDone(d0){
  const done = d0.status === "done";
  const d = openSheet(`<div class="grab"></div><h3>${esc(d0.title)}</h3>
    <p class="sub">${esc([`From ${d0.creator_name || "an official"}`, d0.due_at && "Due " + dueTxt(d0.due_at)].filter(Boolean).join(" · "))}</p>
    ${d0.details ? `<p class="tip" style="color:var(--ink);font-size:14.5px;margin-bottom:10px">${esc(d0.details).replace(/\n/g, "<br>")}</p>` : ""}
    ${done ? `<p class="tip">Done ${dueTxt(d0.done_at)}${d0.note ? ` · ${esc(d0.note)}` : ""}</p>` : `<label class="f"><span>Note (optional)</span><input type="text" id="dn-n" placeholder="e.g. Done, 3 stewards on the gate"></label>`}
    <div class="warn" id="dn-w"></div>
    <div class="sheet-f"><button class="btn ghost" id="dn-c">Close</button><button class="btn ${done ? "" : "primary"}" id="dn-ok">${done ? "Reopen" : "Mark done"}</button></div>`);
  d.querySelector("#dn-c").onclick = () => closeSheet();
  d.querySelector("#dn-ok").onclick = async () => {
    try { await SB.dutyStatus(d0.id, done ? "open" : "done", done ? "" : d.querySelector("#dn-n").value.trim()); DUTIES = null; closeSheet(); render(); toast(done ? "Reopened" : "Marked done"); }
    catch (e) { d.querySelector("#dn-w").textContent = "Couldn't save. Check your network."; }
  };
}
document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t || !window.SB || !SB.me) return;
  if (t.dataset.duty) { const d = DUTIES.find(x => x.id === t.dataset.duty); if (!d) return;
    /* your own open duty: mark it done. One you assigned: change it. Anything else: view it. */
    if (d.assignee === SB.me.id && d.status === "open") dutyDone(d);
    else if (SB.lead() || d.created_by === SB.me.id) editDuty(d.id); else dutyDone(d); }
  else if (t.id === "duty-add") editDuty(null);
  else if (t.id === "duty-retry") { DUTIES_ERR = false; render(); }
  else if (t.id === "duty-alerts" || t.id === "acct-alerts") {
    t.disabled = true; t.textContent = "Turning on…";
    try { const r = await CampPush.linkOfficial(await SB.token()); toast(r === "on" ? "Alerts are on for this phone" : "Notifications are blocked. Allow them in your browser settings."); } catch (x) { toast("Couldn't turn on alerts. Try again."); }
    render();
  }
});
