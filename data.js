/* NYSC 2026 Batch 'C' Stream I Orientation Course
   Source: official timetable (3 sheets) and camp menu, checked cell by cell.
   Edit this one file if the camp announces a change; both versions read it. */
(function () {
  const RV = ["05:20","05:30","Reveille"];
  const AN = ["05:30","05:40","National Anthems and Meditation"];
  const AT = ["05:40","06:00","Attendance by Platoon Officers"];
  const BB = ["07:30","08:55","Bath and Breakfast"];
  const IL = ["11:30","12:00","Interlude"];
  const LS = ["14:00","15:50","Lunch and Siesta"];
  const DN = ["18:30","20:20","Dinner"];
  const SOC = ["20:30","22:00","Social Activities"];
  const LO = ["22:00","22:30","Lights Out"];
  const VIEW = ["20:30","22:00","Viewing of Safety Measures / NYSC Documentaries"];
  const AM = pt => [RV, AN, AT, ["06:00","07:25",pt], BB];
  const SUN_AM = [["05:20","07:25","Personal Administration"], BB, ["09:00","14:00","Religious Activities / Personal Administration"]];

  const PT_SWEAR = "Physical Training / Swearing-in Rehearsals";
  const PT_LECT  = "Physical Training / Drills / NYSC Lecture and Security Lecture";
  const PT_VALUE = "Value Reorientation Lectures by NDLEA & NOA";
  const PT_LANG  = "Physical Training / Drills / Language Study";
  const PT_W3    = "Physical Training / Drills / Language Study / PAIGAS Lecture";

  const W2_PM = [LS, ["16:00","17:30","Drills, Martial Arts, Man O' War"], ["17:30","18:30","Games and Sports"], DN, SOC, LO];

  const days = {
    /* ── WEEK 1 ── */
    "2026-09-30": [["05:20","07:25","Screening, Allocation of Accommodation and Commencement of Registration"], BB,
      ["09:00","14:00","Registration and Issuance of Kit Items"], LS,
      ["16:00","18:30","Formation of Platoons"], DN, VIEW, LO],
    "2026-10-01": [...AM(PT_SWEAR),
      ["09:00","14:00","Registration / Drills / Swearing-in Rehearsals"], LS,
      ["16:00","18:30","State Coordinator's Briefing and Introduction of Principal Officers"], DN, VIEW, LO],
    "2026-10-02": [...AM(PT_SWEAR),
      ["09:00","11:30","Swearing-in Ceremony"],
      ["11:30","14:00","Jumu'at Prayer"], LS,
      ["16:00","18:30","Drills / Man O' War Activities"], DN, VIEW,
      ["22:00","22:30","Lights Out","Registration closes at midnight tonight"]],
    "2026-10-03": [...AM(PT_SWEAR),
      ["09:00","09:45","Environmental Sanitation / Inspection"],
      ["09:50","11:30","NYSC Lecture / Policy Against Sexual Harassment Lecture"], IL,
      ["12:00","13:00","Security Lecture by Security Consultants"],
      ["13:10","14:00","Personal Administration"], LS,
      ["16:00","17:30","Drills, Man O' War, Martial Arts"],
      ["17:30","18:30","Games and Sports"], DN,
      ["20:30","22:00","Welcome Party"], LO],
    "2026-10-04": [...SUN_AM, LS,
      ["16:00","16:45","Drills, Man O' War, Martial Arts"],
      ["16:50","17:30","SAED 'Kudi Mata' Sensitization"],
      ["17:30","18:30","Games and Sports"], DN, SOC, LO],
    "2026-10-05": [...AM(PT_LECT),
      ["09:00","09:45","NYSC Lecture / NTBLCP Lecture"],
      ["09:50","10:40","NYSC Lecture / Fiscal Responsibility Lecture"],
      ["10:45","11:30","HIV/AIDS and SDG Project Sensitization"], IL,
      ["12:00","14:00","Traditional Lecture"], LS,
      ["16:00","18:30","Drills / Man O' War Activities"], DN,
      ["20:30","22:00","NYSC Movie"], LO],
    "2026-10-06": [...AM(PT_LECT),
      ["09:00","09:45","NIMC Sensitization"],
      ["09:50","11:30","Sensitization on Skills Acquisition"], IL,
      ["12:00","14:00","Skills Acquisition Training"], LS,
      ["16:00","18:30","Drills, Man O' War, Martial Arts"], DN, SOC, LO],

    /* ── WEEK 2 ── */
    "2026-10-07": [...AM(PT_LECT),
      ["09:00","10:40","Entrepreneurship Development Programme (EDP)"],
      ["10:45","11:30","Sensitization on Financial Inclusion by FMYSD / NYSC Lecture"], IL,
      ["12:00","13:00","CITN Sensitization / Access Bank Lecture"],
      ["13:10","14:00","YouWin Lecture / KDI & INEC Sensitization by KDI"], ...W2_PM],
    "2026-10-08": [...AM(PT_VALUE),
      ["09:00","09:45","PICA Lecture / CIPM Lecture"],
      ["09:50","10:40","ISPON Lecture / Mental Health Sensitization"],
      ["10:45","11:30","EFCC Lecture / NICO Lecture"], IL,
      ["12:00","14:00","Skills Acquisition Training"], ...W2_PM],
    "2026-10-09": [...AM(PT_VALUE),
      ["09:00","09:45","NYSC Act / Bye-Laws Lecture"],
      ["09:50","11:30","Skills Acquisition Training"], IL,
      ["12:00","14:00","Jumu'at Prayer"], ...W2_PM],
    "2026-10-10": [...AM(PT_VALUE),
      ["09:00","09:45","Environmental Sanitation / Inspection"],
      ["09:50","11:30","NITDA Sensitization / Mind the Gap Digital Skills and Leadership Programme"],
      ["11:30","13:00","Fire Safety Lecture"],
      ["13:10","14:00","Personal Administration"], ...W2_PM],
    "2026-10-11": [...SUN_AM, ...W2_PM],
    "2026-10-12": [...AM(PT_LANG),
      ["09:00","09:45","NYSC Lecture / Service Innovation Sensitization Campaign"],
      ["09:50","10:40","NIM Lecture / NPC Lecture"],
      ["10:45","11:30","Skills Acquisition Training"], IL,
      ["12:00","14:00","Skills Acquisition Training"], ...W2_PM],
    "2026-10-13": [...AM(PT_LANG),
      ["09:00","09:45","Professional Orientation on Teaching"],
      ["09:50","10:40","CISR Lecture / DHQ Security Awareness / NYSC Lecture"],
      ["10:45","11:30","Skills Acquisition Training"], IL,
      ["12:00","14:00","Skills Acquisition Training"], LS,
      ["16:00","16:45","Intra-Platoon Activities"],
      ["16:50","17:30","Drills"],
      ["17:30","18:30","Games and Sports"], DN, SOC, LO],

    /* ── WEEK 3 ── */
    "2026-10-14": [...AM(PT_W3),
      ["09:00","09:45","Professional Orientation: Engineering, Law (REJA) & Medicine"],
      ["09:50","10:40","NHIA Lecture"],
      ["10:45","11:30","NCC / NYSC / NIYA / NERC Lecture"], IL,
      ["12:00","14:00","Skills Acquisition Training"], LS,
      ["16:00","16:45","Drills, Man O' War, Martial Arts"],
      ["16:50","18:30","Games and Sports"], DN, SOC, LO],
    "2026-10-15": [...AM(PT_W3),
      ["09:00","09:45","NBSC Lecture / Financial Institutions / Investment Lecture"],
      ["09:50","10:40","ICPC Lecture / NIS Lecture"],
      ["10:45","11:30","Funding Options by Financial Institutions (SAED)"], IL,
      ["12:00","14:00","Skills Acquisition Training"], LS,
      ["16:00","18:30","Inter-Platoon Drills Competition"], DN, SOC, LO],
    "2026-10-16": [...AM(PT_W3),
      ["09:00","11:30","Inter-Platoon Skills Acquisition Competition / Exhibition"], IL,
      ["12:00","14:00","Jumu'at Prayer"], LS,
      ["16:00","18:30","Finals of Sports Competitions"], DN, SOC, LO],
    "2026-10-17": [["05:20","06:30","Bath and Breakfast"],
      ["06:30","14:00","Carnival"], LS,
      ["16:00","18:30","Parade Rehearsals"], DN, SOC, LO],
    "2026-10-18": [["05:20","07:25","Personal Administration"],
      ["07:30","08:55","Breakfast"],
      ["09:00","14:00","Religious Activities / Personal Administration"], LS,
      ["16:00","18:30","Parade Rehearsals"], DN, SOC, LO],
    "2026-10-19": [RV, AN, AT, ["06:00","07:25",PT_LANG], ["07:30","08:55","Breakfast"],
      ["09:00","09:45","NYSC Lecture (Recap)"],
      ["09:50","12:00","State Coordinator's Debriefing of Corps Members and Introduction of Field Officers"],
      ["12:00","14:00","Personal Administration"], LS,
      ["16:00","18:30","Final Parade Rehearsals"], DN, SOC, LO],
    "2026-10-20": [["05:20","08:55","Bath and Breakfast"],
      ["09:00","22:30","Closing / Collection of Corps Members"]]
  };

  /* Weekly menu, Sunday = 0 (official wording) */
  const menu = [
    ["Bread / Butter / Tea", "Jollof Rice / Chicken", "Yam Porridge / Vegetable / Fried Fish"],
    ["Beans / Pap", "Rice / Stew / Fish", "Amala / Tuwon Massara / Garri / Ogbono / Okro / Beef"],
    ["Bread / Boiled Egg / Tea", "Porridge Beans / Garri", "Garri / Egusi / Beef"],
    ["Beans / Pap", "Jollof Rice / Beef", "Amala / Tuwon Massara / Ogbono / Okro / Fish"],
    ["Bread / Butter / Tea", "Amala / Tuwon Massara / Garri / Egusi Soup / Beef", "Porridge Yam / Fried Fish"],
    ["Bread / Egg / Tea", "Jollof Rice / Fish", "Amala / Tuwon Massara / Garri / Ogbono / Okro / Beef"],
    ["Akara / Pap", "Amala / Tuwon Massara / Garri / Egusi Soup / Beef", "Rice / Stew / Fish"]
  ];

  /* ── SCHEDULE OF SOCIAL ACTIVITIES (official sheet) ──
     Every event starts 8:00 PM on the dot; platoons must be seated by 7:30 PM.
     This sheet is newer than the timetable, so it replaces the 8:30 PM evening slot. */
  const AUD = "Chief Barr. Nyesom Wike Auditorium";
  const social = {
    "2026-10-03": ["Welcome Extravaganza", "Modern dance, inter-platoon dance hall competition and comedy"],
    "2026-10-05": ["Inter-Platoon Talent Hunt / Comedy Night Competition"],
    "2026-10-06": ["Inter-Platoon Cultural Dance Competition", "Theme: WAZOBIA, A Blend of Dance"],
    "2026-10-07": ["Inter-Platoon Cultural Dance Competition", "Theme: WAZOBIA, A Blend of Dance"],
    "2026-10-08": ["Inter-Platoon Drama Competition", "Theme: A Better and a United Nigeria"],
    "2026-10-09": ["Inter-Platoon Drama Competition", "Theme: A Better and a United Nigeria"],
    "2026-10-10": ["Old-school Night"],
    "2026-10-12": ["Miss Petite / Mr Tall and Handsome"],
    "2026-10-13": ["Miss Big Bold & Beautiful / Mr Big Bold & Handsome"],
    "2026-10-14": ["Variety Night: Miss NYSC & Mr Macho"],
    "2026-10-15": ["Inter-Platoon Choreography Competition"]
  };
  for (const [k, [title, theme]] of Object.entries(social)) {
    const d = days[k]; if (!d) continue;
    const di = d.findIndex(x => /^dinner/i.test(x[2]));
    const ei = d.findIndex(x => x[0] === "20:30");
    if (di < 0 || ei < 0) continue;
    d[di] = ["18:30", "19:30", "Dinner", "Eat early: platoons must be seated by 7:30 PM"];
    d.splice(ei, 1,
      ["19:30", "20:00", "Be Seated at the Auditorium", "Platoons seated by 7:30 PM. Event starts 8:00 PM on the dot", AUD],
      ["20:00", "22:00", title, theme || "", AUD]);
  }
  /* 16 Oct: carnival preparations run day and night */
  (() => { const d = days["2026-10-16"], i = d.findIndex(x => x[0] === "20:30");
    d[i] = ["20:30", "22:00", "Cultural Carnival Preparations", "Platoon rehearsals, costumes and props (day and night)"]; })();
  /* 17 Oct: Cultural Fiesta starts 10:00 AM at the Parade Ground */
  (() => { const d = days["2026-10-17"], i = d.findIndex(x => x[2] === "Carnival");
    d.splice(i, 1,
      ["06:30", "10:00", "Carnival Preparations", "Cultural Fiesta starts 10:00 AM at the Parade Ground"],
      ["10:00", "14:00", "Cultural Fiesta · Camp Carnival", "Theme: Tongues and Tribes May Differ: My Culture My Pride", "Parade Ground"]); })();

  /* ── INTER-PLATOON FIXTURES (official sheets, subject to amendment) ──
     [date, time, sport, match no., stage, side A, side B, note]  Numbers in "W1" etc. are match numbers within that sport. */
  const R1 = "Round 1", QF = "Quarter-final", SF = "Semi-final", TP = "Third place", FN = "Final";
  const F = [];
  const add = (sport, rows) => rows.forEach(r => F.push({ d:r[0], t:r[1], sport, no:r[2], stage:r[3], a:r[4], b:r[5], note:r[6]||"" }));
  add("Volleyball", [
    ["2026-10-05","17:00",1,R1,"8","4"], ["2026-10-06","17:00",2,R1,"2","9"], ["2026-10-07","17:00",3,R1,"10","6"],
    ["2026-10-08","17:00",4,R1,"1","5"], ["2026-10-09","17:00",5,R1,"3","7"],
    ["2026-10-10","08:00",6,QF,"W1","W2"], ["2026-10-10","17:00",7,QF,"W3","W4"],
    ["2026-10-11","20:00",8,QF,"W5","BL1","Printed as 8:00 PM. Confirm the time with your platoon"], ["2026-10-11","17:00",9,QF,"BL2","BL3"],
    ["2026-10-12","17:00",10,SF,"W6","W7"], ["2026-10-13","17:00",11,SF,"W8","W9"],
    ["2026-10-14","17:00",14,TP,"L10","L11"], ["2026-10-16","15:00",15,FN,"W10","W11"]]);
  add("Football", [
    ["2026-10-05","17:00",1,R1,"5","2"], ["2026-10-06","17:00",2,R1,"8","6"], ["2026-10-07","17:00",3,R1,"1","7"],
    ["2026-10-08","17:00",4,R1,"10","3"], ["2026-10-09","17:00",5,R1,"4","9"],
    ["2026-10-10","07:00",6,QF,"W1","W2"], ["2026-10-10","17:00",7,QF,"W3","W4"],
    ["2026-10-11","07:00",8,QF,"W5","BL1"], ["2026-10-11","17:00",9,QF,"BL2","BL3"],
    ["2026-10-12","17:00",10,SF,"W6","W7"], ["2026-10-13","17:00",11,SF,"W8","W9"],
    ["2026-10-14","17:00",14,TP,"L10","L11"], ["2026-10-16","15:00",15,FN,"W10","W11"]]);
  add("Badminton (singles)", [
    ["2026-10-05","07:00",1,R1,"3","1"], ["2026-10-06","07:00",2,R1,"10","8"], ["2026-10-07","07:00",3,R1,"2","5"],
    ["2026-10-08","07:00",4,R1,"6","9"], ["2026-10-09","07:00",5,R1,"7","4"],
    ["2026-10-10","07:00",6,QF,"W1","W2"], ["2026-10-10","17:00",7,QF,"W3","W4"],
    ["2026-10-11","07:00",8,QF,"W5","BL1"], ["2026-10-11","17:00",9,QF,"BL2","BL3"],
    ["2026-10-12","07:00",10,SF,"W6","W7"], ["2026-10-13","07:00",11,SF,"W8","W9"],
    ["2026-10-14","07:00",14,TP,"L10","L11"], ["2026-10-16","07:00",15,FN,"W10","W11"]]);
  add("Athletics", [
    ["2026-10-12","15:00",null,"Heats","",""], ["2026-10-13","15:00",null,"Heats final","",""]]);
  F.sort((x, y) => (x.d + x.t).localeCompare(y.d + y.t));

  /* "W1" → "Winner of #1", "BL2" → "Best loser 2", "8" → "Platoon 8" */
  const side = s => /^W(\d+)$/.test(s) ? `Winner #${s.slice(1)}` : /^L(\d+)$/.test(s) ? `Loser #${s.slice(1)}`
    : /^BL(\d+)$/.test(s) ? `Best loser ${s.slice(2)}` : `Platoon ${s}`;
  const fixtures = k => F.filter(f => f.d === k);

  /* ── Results and progression ──
     Each fixture can carry sa / sb (scores) and win ("a" or "b").
     "W3" becomes the winner of match 3 once it has a result; "BL1" uses bestLosers[sport][0]. */
  const bestLosers = {};
  function resolve(sport, tok, depth = 0) {
    tok = String(tok ?? "").trim();
    if (!tok) return { label: "TBD", p: null };
    if (/^\d+$/.test(tok)) return { label: `Platoon ${tok}`, p: tok };
    const m = tok.match(/^(W|L)(\d+)$/i);
    if (m && depth < 6) {
      const w = m[1].toUpperCase() === "W", n = +m[2], tag = `${w ? "Winner" : "Loser"} #${n}`;
      const g = F.find(x => x.sport === sport && x.no === n);
      if (g && (g.win === "a" || g.win === "b")) {
        const pick = w ? g.win : (g.win === "a" ? "b" : "a");
        const r = resolve(sport, g[pick], depth + 1);
        return { label: r.label, p: r.p, from: tag };
      }
      return { label: tag, p: null };
    }
    const b = tok.match(/^BL(\d+)$/i);
    if (b) {
      const v = (bestLosers[sport] || [])[+b[1] - 1];
      if (v && depth < 6) { const r = resolve(sport, v, depth + 1); return { label: r.label, p: r.p, from: `Best loser ${b[1]}` }; }
      return { label: `Best loser ${b[1]}`, p: null };
    }
    return { label: tok, p: null };
  }
  const sides = f => [resolve(f.sport, f.a), resolve(f.sport, f.b)];
  const played = f => f.win === "a" || f.win === "b" || (f.sa !== undefined && f.sa !== "" && f.sb !== undefined && f.sb !== "");
  const myMatches = p => F.filter(f => sides(f).some(x => x.p === String(p)));
  const myFirstRound = p => F.filter(f => f.stage === R1 && (f.a === String(p) || f.b === String(p)));

  const toM = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const DEFAULT = [["Breakfast","07:30","08:55","🍳"], ["Lunch","14:00","15:50","🍛"], ["Dinner","18:30","20:20","🍲"]];

  /* Meal windows follow each day's own timetable (e.g. 17 Oct breakfast is 5:20–6:30) */
  function meals(k) {
    const items = days[k] || [];
    return DEFAULT.map(([name, s, e, icon], i) => {
      const hit = items.find(x => new RegExp(name, "i").test(x[2]));
      return { name, icon, i, S: toM(hit ? hit[0] : s), E: toM(hit ? hit[1] : e) };
    });
  }

  /* ── LIVE UPDATES ──
     Officials edit camp.json from /private-admin/. Phones read it from GitHub when they have
     signal, keep the last copy, and fall back to the built-in data above when offline. */
  const SOURCE = { owner: "alescioevolve", repo: "camp-companion-data", branch: "main", path: "camp.json" };
  const RAW = `https://raw.githubusercontent.com/${SOURCE.owner}/${SOURCE.repo}/${SOURCE.branch}/${SOURCE.path}`;
  const CDN = `https://cdn.jsdelivr.net/gh/${SOURCE.owner}/${SOURCE.repo}@${SOURCE.branch}/${SOURCE.path}`;
  const PURGE = `https://purge.jsdelivr.net/gh/${SOURCE.owner}/${SOURCE.repo}@${SOURCE.branch}/${SOURCE.path}`;
  /* Same-site copy (served by the host's proxy, e.g. Vercel). Helps on networks that can't reach GitHub. */
  const HERE = (() => { try { return new URL("live/camp.json", document.currentScript.src).href; } catch (e) { return ""; } })();
  const announcements = [];
  const meta = { updatedAt: "", updatedBy: "" };
  const keys = Object.keys(days).sort();
  const clone = o => JSON.parse(JSON.stringify(o));
  const BUILT_IN = clone({ schema: 1, updatedAt: "", updatedBy: "", days, menu, fixtures: F, announcements: [], bestLosers: {} });

  function valid(c) {
    return c && c.schema === 1 && c.days && typeof c.days === "object" && Array.isArray(c.menu) && c.menu.length === 7
      && Array.isArray(c.fixtures) && Array.isArray(c.announcements);
  }
  /* Swap content in place so pages holding references keep working */
  function apply(c) {
    if (!valid(c)) return false;
    Object.keys(days).forEach(k => delete days[k]);
    Object.entries(c.days).forEach(([k, v]) => { days[k] = v; });
    menu.splice(0, menu.length, ...c.menu);
    F.splice(0, F.length, ...c.fixtures);
    F.sort((x, y) => (x.d + x.t).localeCompare(y.d + y.t));
    announcements.splice(0, announcements.length, ...c.announcements);
    Object.keys(bestLosers).forEach(k => delete bestLosers[k]);
    Object.assign(bestLosers, c.bestLosers || {});
    keys.splice(0, keys.length, ...Object.keys(days).sort());
    meta.updatedAt = c.updatedAt || ""; meta.updatedBy = c.updatedBy || "";
    return true;
  }
  function exportContent() {
    return clone({ schema: 1, updatedAt: meta.updatedAt, updatedBy: meta.updatedBy, days, menu, fixtures: F, announcements, bestLosers });
  }

  /* 1. Last copy saved on this phone */
  try {
    const saved = JSON.parse(localStorage.getItem("camp-content") || "null");
    if (saved && (saved.updatedAt || "") > meta.updatedAt) apply(saved);
  } catch (e) {}

  /* 2. Latest copy, when there is signal. Tries each route in turn; the first good one wins. */
  function get(url) {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl && setTimeout(() => ctl.abort(), 8000);
    return fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store", signal: ctl && ctl.signal })
      .then(r => r.ok ? r.json() : null).catch(() => null).finally(() => timer && clearTimeout(timer));
  }
  /* Ask every route at once and keep the newest copy, so one slow or out-of-date route can't hold back an update */
  async function latest() {
    const got = await Promise.all([HERE, RAW, CDN].filter(Boolean).map(get));
    return got.filter(valid).sort((x, y) => (y.updatedAt || "").localeCompare(x.updatedAt || ""))[0] || null;
  }
  function refresh() {
    if (typeof fetch !== "function") return Promise.resolve(false);
    return latest()
      .then(c => {
        if (!valid(c) || (c.updatedAt || "") <= meta.updatedAt) return false;
        apply(c);
        try { localStorage.setItem("camp-content", JSON.stringify(c)); } catch (e) {}
        window.dispatchEvent(new Event("camp:update"));
        return true;
      })
      .catch(() => false);
  }
  /* Admin preview: show the admin's unpublished changes from this phone instead of the live copy */
  const PREVIEW = new URLSearchParams(location.search).get("preview");
  if (PREVIEW === "draft") {
    try { const d = JSON.parse(localStorage.getItem("camp-admin-draft") || "null"); if (d && valid(d.work)) apply(d.work); } catch (e) {}
  } else if (!/\/private-admin\//.test(location.pathname)) {
    /* Check on open, every 2 minutes while on screen, and the moment the app comes back to the front */
    let last = 0;
    const check = () => { if (document.visibilityState === "visible" && Date.now() - last > 20000) { last = Date.now(); refresh(); } };
    check();
    setInterval(check, 2 * 60 * 1000);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", e => { if (e.persisted) check(); });
  }

  /* Announcements showing on a given date (from ≤ date ≤ to), urgent first */
  const notices = k => announcements
    .filter(a => a.from <= k && k <= (a.to || a.from))
    .sort((x, y) => (y.urgent ? 1 : 0) - (x.urgent ? 1 : 0) || (y.postedAt || "").localeCompare(x.postedAt || ""));

  window.CAMP = {
    title: "2026 Batch C · Stream I",
    days, menu, meals, toM, fixtures, myFirstRound, side, notices, meta, keys,
    allFixtures: F, bestLosers, resolve, sides, played, myMatches,
    sports: ["Football", "Volleyball", "Badminton (singles)", "Athletics"],
    stages: ["Round 1", "Quarter-final", "Semi-final", "Third place", "Final", "Heats", "Heats final"],
    platoons: ["1","2","3","4","5","6","7","8","9","10"],
    SOURCE, RAW, PURGE, PREVIEW, BUILT_IN, apply, exportContent, refresh, valid
  };
})();
