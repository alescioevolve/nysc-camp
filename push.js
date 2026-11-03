/* Phone notifications, shared by the corps app and the admin.
   Corps members subscribe with just their platoon (no account). Officials link the same phone
   to their sign-in so duty alerts reach them. */
window.CampPush = (() => {
  const C = window.CAMP_CFG || {};
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ready = !!(C.supabaseUrl && C.supabaseAnon && C.vapidPublic);
  const ok = ready && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };

  /* "on" | "ask" | "denied" | "ios-install" (iPhone: only works from the home screen) | "off" (not available) */
  function state() {
    if (!ok) return ready && ios && !standalone ? "ios-install" : "off";
    if (Notification.permission === "denied") return "denied";
    return Notification.permission === "granted" && store.get("camp-push") === "1" ? "on" : "ask";
  }
  const key = b64 => { const p = "=".repeat((4 - b64.length % 4) % 4), s = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, c => c.charCodeAt(0)); };
  async function sub() {
    const reg = await navigator.serviceWorker.ready;
    let s = await reg.pushManager.getSubscription();
    if (!s) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(C.vapidPublic) });
    return s;
  }
  async function rpc(fn, args, token) {
    const r = await fetch(`${C.supabaseUrl}/rest/v1/rpc/${fn}`, { method: "POST",
      headers: { apikey: C.supabaseAnon, Authorization: "Bearer " + (token || C.supabaseAnon), "Content-Type": "application/json" }, body: JSON.stringify(args) });
    if (!r.ok) throw new Error("rpc " + r.status);
    return r.json();
  }
  const parts = s => { const j = s.toJSON(); return { s_endpoint: j.endpoint, s_p256dh: j.keys.p256dh, s_auth: j.keys.auth }; };

  async function enable(platoon) {
    if (!ok) return state();
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return state();
    const s = await sub();
    await rpc("push_subscribe", { ...parts(s), s_platoon: platoon || "" });
    store.set("camp-push", "1"); store.set("camp-push-p", platoon || "");
    return "on";
  }
  /* Called when the corps member picks another platoon */
  async function setPlatoon(platoon) {
    if (state() !== "on" || (store.get("camp-push-p") || "") === (platoon || "")) return;
    try { const s = await sub(); await rpc("push_subscribe", { ...parts(s), s_platoon: platoon || "" }); store.set("camp-push-p", platoon || ""); } catch (e) {}
  }
  async function disable() {
    try { const reg = await navigator.serviceWorker.ready, s = await reg.pushManager.getSubscription();
      if (s) { await rpc("push_unsubscribe", { s_endpoint: s.endpoint }).catch(() => {}); await s.unsubscribe(); } } catch (e) {}
    store.set("camp-push", null); store.set("camp-push-p", null);
    return state();
  }
  /* Officials: link this phone to the signed-in account (duty alerts) */
  async function linkOfficial(token) {
    if (!ok) return state();
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return state();
    const s = await sub();
    await rpc("push_link_official", parts(s), token);
    store.set("camp-push-off", "1");
    return "on";
  }
  const officialOn = () => ok && Notification.permission === "granted" && store.get("camp-push-off") === "1";
  return { ok, ready, ios, standalone, state, enable, setPlatoon, disable, linkOfficial, officialOn };
})();
