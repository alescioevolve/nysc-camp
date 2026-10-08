/* Install prompt + offline registration, shared by both versions.
   Usage: <script src="pwa.js" data-root="./"></script>  (data-root="../" from /v2/) */
(function () {
  const root = (document.currentScript && document.currentScript.dataset.root) || "./";

  /* "Available offline" badge: shown once the app is saved on the phone */
  let saved = false;
  function badge() {
    const el = document.querySelector("[data-offline]"); if (!el) return;
    if (!navigator.onLine) { el.textContent = saved ? "● Offline · saved copy" : "● Offline"; el.classList.add("is-off"); el.hidden = false; return; }
    el.classList.remove("is-off");
    el.textContent = "✓ Offline ready";
    el.hidden = !saved;
  }
  window.addEventListener("online", badge);
  window.addEventListener("offline", badge);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(root + "sw.js", { scope: root }).catch(() => {});
      navigator.serviceWorker.ready
        .then(() => caches.keys())
        .then(keys => { saved = keys.some(k => k.startsWith("camp-")); badge(); })
        .catch(badge);
    });
  } else {
    window.addEventListener("load", badge);
  }

  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const embedded = window.self !== window.top;   // shown inside the admin's corps member view
  let deferred = null;
  let dismissed = false;
  try { dismissed = localStorage.getItem("camp-install-dismissed") === "1"; } catch (_) {}

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  function card() { return document.getElementById("install"); }

  function show(mode) {
    const el = card(); if (!el || standalone || dismissed || embedded) return;
    const btn = el.querySelector("[data-install]");
    const hint = el.querySelector("[data-hint]");
    if (mode === "prompt") { btn.hidden = false; hint.textContent = "Opens instantly and works offline in camp."; }
    else if (isIOS) { btn.hidden = true; hint.textContent = "Tap Share, then “Add to Home Screen”."; }
    else { btn.hidden = true; hint.textContent = "Open your browser menu (⋮) and tap “Add to Home screen” or “Install app”."; }
    el.hidden = false;
  }

  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; show("prompt"); });
  window.addEventListener("appinstalled", () => { const el = card(); if (el) el.hidden = true; });

  document.addEventListener("click", e => {
    if (e.target.closest("[data-install]") && deferred) {
      deferred.prompt();
      deferred.userChoice.finally(() => { deferred = null; const el = card(); if (el) el.hidden = true; });
    }
    if (e.target.closest("[data-dismiss]")) {
      const el = card(); if (el) el.hidden = true;
      try { localStorage.setItem("camp-install-dismissed", "1"); } catch (_) {}
    }
  });

  /* If the browser never fires the install event, show manual steps */
  window.addEventListener("load", () => setTimeout(() => { if (!deferred) show("manual"); }, 2500));
})();
