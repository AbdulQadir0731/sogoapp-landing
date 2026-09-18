/* Headless test for assets/deeplink.js — run from the repo root:
 *   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc assets/deeplink.test.js
 *
 * Covers the part everything else rests on: turning a share URL into an
 * identifier, in BOTH shapes — the path form the apps and the backend emit
 * (/u/<id>) and the query form 404.html rewrites to (/u/?id=<id>), since GitHub
 * Pages cannot route paths. Exits non-zero on failure.
 */
// Minimal browser shims so the page script can be exercised headlessly.
var window = this;
function URLSearchParams(qs) {
  var m = {};
  String(qs || "").replace(/^\?/, "").split("&").forEach(function (kv) {
    if (!kv) return; var i = kv.indexOf("="); var k = i < 0 ? kv : kv.slice(0, i);
    m[decodeURIComponent(k)] = i < 0 ? "" : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " "));
  });
  this.get = function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; };
}
var location = { pathname: "/", search: "", href: "" };
var navigator = { userAgent: "" };
var document = { hidden: false, addEventListener: function () {}, removeEventListener: function () {},
                 getElementById: function () { return null; } };
function setTimeout() {}
load("assets/deeplink.js");

var pass = 0, fail = 0;
function eq(got, want, label) {
  if (got === want) { pass++; print("✅ " + label); }
  else { fail++; print("❌ " + label + "\n   got  " + got + "\n   want " + want); }
}
function withLoc(path, search, ua, fn) {
  location.pathname = path; location.search = search; navigator.userAgent = ua; return fn();
}

// path form — what the backend emits and what 404.html forwards
eq(withLoc("/u/user459000", "", "", function () { return SogoLink.readTarget("u"); }), "user459000", "path /u/<username>");
eq(withLoc("/u/923704294224", "", "", function () { return SogoLink.readTarget("u"); }), "923704294224", "path /u/<phone>");
eq(withLoc("/invite/ABC123", "", "", function () { return SogoLink.readTarget("invite"); }), "ABC123", "path /invite/<code>");
// query form — what 404.html rewrites to, and what the pages are linked as
eq(withLoc("/u/", "?id=user459000", "", function () { return SogoLink.readTarget("u"); }), "user459000", "query ?id=");
eq(withLoc("/invite/", "?code=ABC123", "", function () { return SogoLink.readTarget("invite"); }), "ABC123", "query ?code=");
// encoded values must come back decoded, once
eq(withLoc("/u/", "?id=" + encodeURIComponent("a b+c"), "", function () { return SogoLink.readTarget("u"); }), "a b+c", "encoded query value");
// no target at all
eq(withLoc("/u/", "", "", function () { return SogoLink.readTarget("u"); }), "", "missing target is empty");
// a path that is not ours must not be mistaken for one
eq(withLoc("/support/", "", "", function () { return SogoLink.readTarget("u"); }), "", "unrelated path yields nothing");

print("\n" + pass + " pass / " + fail + " fail");
if (fail) throw new Error("link parsing is wrong");
