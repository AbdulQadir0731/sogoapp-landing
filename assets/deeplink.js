/* Shared resolver for SogoApp share links: /u/<id>, /invite/<code>, /qr/<token>, /call/<id>
 *
 * WHY THIS FILE EXISTS (2026-09-18). Every share link the apps emitted pointed at
 * credail.com — the retired product's host — and nothing resolved them any more.
 * The backend now emits app.sogoapps.com links (backend/src/utilis/publicLinks.js);
 * these pages are what those links land on.
 *
 * 🔴 CONTENT MUST NEVER DEPEND ON A SUCCESSFUL FETCH. If the API is slow, blocked
 * or down, the page still has to show what it is and how to get the app — a
 * marketing page that renders blank is a worse trade than one without details.
 * So the store buttons are in the HTML, and this script only ADDS detail.
 *
 * 🔴 The app is opened with the scheme the SHIPPED clients actually register:
 *    Android  credail://  (AndroidManifest still claims it; `sogo://` handles only /training)
 *    iOS      sogo://     (Info.plist registers `sogo` only; `credail` is not registered)
 * Do not "modernise" the Android one until a build ships that routes sogo://u.
 *
 * 🔴 WHAT "OPEN IN SOGOAPP" OPENS (2026-09-20): the CHAT with the person. This page
 * is titled "Message me on SogoApp" and promised "this link will open the chat" —
 * while Android landed on the profile and iOS did nothing at all (its router had
 * no consumer for `sogo://profile`). Both apps now route /u/<id> to the 1:1 chat:
 *    Android  credail://u/<id>   — old builds still open the profile, new ones the chat
 *    iOS      sogo://u/<id>      — old builds ignore it exactly as they ignored the old
 *                                  form; new ones open the chat
 * On Android Chrome the app is entered through an intent:// URL with the Play page as
 * `S.browser_fallback_url`: installed ⇒ the app, not installed ⇒ Play, no timer race.
 * Other browsers keep the scheme + visibility timer.
 */
(function () {
  "use strict";

  var API = "https://api.sogoapps.com/api/v1";
  var APP_STORE = "https://apps.apple.com/app/id6760476602";
  var PLAY_STORE = "https://play.google.com/store/apps/details?id=com.org.sogo";

  function ua() { return navigator.userAgent || ""; }
  function isAndroid() { return /Android/i.test(ua()); }
  function isIOS() { return /iPhone|iPad|iPod/i.test(ua()) || (/Mac/.test(ua()) && "ontouchend" in document); }

  /** Identifier from /u/<id> style paths, or ?id= / ?code= / ?token= for query links. */
  function readTarget(kind) {
    var q = new URLSearchParams(location.search);
    var fromQuery = q.get("id") || q.get("code") || q.get("token") || q.get("p");
    if (fromQuery) return decodeURIComponent(fromQuery);
    var parts = location.pathname.split("/").filter(Boolean);
    var at = parts.indexOf(kind);
    if (at !== -1 && parts[at + 1]) return decodeURIComponent(parts[at + 1]);
    return "";
  }

  function appUrl(kind, id) {
    if (isAndroid()) return "credail://" + kind + "/" + encodeURIComponent(id);
    // iOS registers `sogo` only. `u` opens the chat (2026-09-20 builds and later).
    if (kind === "invite") return "sogo://join/" + encodeURIComponent(id);
    return "sogo://" + kind + "/" + encodeURIComponent(id);
  }

  /** Chrome / Samsung Internet on Android: one URL that opens the app or falls back to Play. */
  function isChromeLike() { return /Chrome|CriOS|SamsungBrowser/i.test(ua()) && !/Firefox|FxiOS|OPR\//i.test(ua()); }
  function androidIntentUrl(kind, id) {
    return "intent://" + kind + "/" + encodeURIComponent(id)
      + "#Intent;scheme=credail;package=com.org.sogo;S.browser_fallback_url="
      + encodeURIComponent(PLAY_STORE) + ";end";
  }

  /** Try the app, fall back to the right store if nothing took over the page. */
  function openInApp(kind, id) {
    if (!id) { location.href = isIOS() ? APP_STORE : PLAY_STORE; return; }
    if (!isAndroid() && !isIOS()) { return; }          // desktop: the store buttons are already there
    if (isAndroid() && isChromeLike()) { location.href = androidIntentUrl(kind, id); return; }
    var store = isIOS() ? APP_STORE : PLAY_STORE;
    var left = false;
    function onHide() { if (document.hidden) left = true; }
    document.addEventListener("visibilitychange", onHide);
    location.href = appUrl(kind, id);
    setTimeout(function () {
      document.removeEventListener("visibilitychange", onHide);
      if (!left && !document.hidden) location.href = store;
    }, 1400);
  }

  function el(id) { return document.getElementById(id); }
  function show(id) { var n = el(id); if (n) n.style.display = ""; }
  function hide(id) { var n = el(id); if (n) n.style.display = "none"; }
  function text(id, v) { var n = el(id); if (n) n.textContent = v; }

  function initials(name) {
    var letters = String(name || "").trim().split(/\s+/).map(function (w) { return w[0]; })
      .filter(function (c) { return c && /[A-Za-z]/.test(c); }).slice(0, 2).join("");
    return letters.toUpperCase() || "S";
  }

  async function getJSON(url) {
    var res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  /* ── /u/<identifier> — a person ───────────────────────────────────────── */
  async function profile() {
    var id = readTarget("u");
    var btn = el("open");
    if (btn) btn.addEventListener("click", function (e) { e.preventDefault(); openInApp("u", id); });
    if (!id) { hide("generic"); show("missing"); return; }
    try {
      var data = await getJSON(API + "/dl/user/" + encodeURIComponent(id));
      var u = (data && (data.user || data.data)) || data || {};
      var name = u.displayName || u.username || "";
      if (!name) throw new Error("no profile in response");
      text("name", name);
      var first = String(name).trim().split(/\s+/)[0];
      if (btn && first) btn.textContent = "Message " + first + " on SogoApp";
      if (u.username) { text("handle", "@" + u.username); show("handle"); }
      if (u.about) { text("about", u.about); show("about"); }
      var pic = u.profilePicture || u.profile_picture;
      if (pic) {
        var img = el("avatarImg");
        img.onload = function () { show("avatarImg"); hide("avatarText"); };
        img.src = pic;
      } else {
        text("avatarText", initials(name));
      }
      hide("generic");
      show("card");
    } catch (err) {
      // 🔴 An unknown or private handle is NOT an error page. The visitor still
      //    came from someone's message; give them the app, not a stack trace.
      show("generic");
    }
  }

  /* ── /invite/<code> — a group ─────────────────────────────────────────── */
  async function invite() {
    var code = readTarget("invite");
    var btn = el("open");
    if (btn) btn.addEventListener("click", function (e) { e.preventDefault(); openInApp("invite", code); });
    if (!code) { hide("generic"); show("missing"); return; }
    try {
      var data = await getJSON(API + "/dl/invite/" + encodeURIComponent(code));
      var g = (data && (data.group || data.data)) || data || {};
      var name = g.groupName || g.name || "";
      if (!name) throw new Error("no group in response");
      text("name", name);
      var n = g.memberCount || g.members || g.member_count;
      if (n) { text("handle", n + (n === 1 ? " member" : " members")); show("handle"); }
      var desc = g.groupDescription || g.description;
      if (desc) { text("about", desc); show("about"); }
      var icon = g.groupIcon || g.iconUrl || g.icon_url;
      if (icon) {
        var img = el("avatarImg");
        img.onload = function () { show("avatarImg"); hide("avatarText"); };
        img.src = icon;
      } else {
        text("avatarText", initials(name));
      }
      hide("generic");
      show("card");
    } catch (err) {
      show("generic");
    }
  }

  window.SogoLink = { profile: profile, invite: invite, openInApp: openInApp, readTarget: readTarget };
})();
