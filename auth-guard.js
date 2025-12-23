(function () {
  // PAGES THAT DO NOT REQUIRE LOGIN (keep this list short)
  // If you want the home page blocked too, do NOT include "index.html".
  const ALLOW_ANON = new Set([
    "login.html",
    "register.html",
    "reset-password.html",
    "verified.html",
  ]);

  // Helper: current page filename (no query string)
  function currentPage() {
    const path = (location.pathname || "/").toLowerCase();
    const file = path.split("/").pop();   // "" if trailing slash
    return file || "index.html";          // treat "/" as index.html
  }

  // Helper: your “logged in” test
  function isLoggedIn() {
    try {
      const name = (localStorage.getItem("playerName") || "").trim();
      const avatar = (localStorage.getItem("playerAvatar") || "").trim();
      return !!(name && avatar);
    } catch { return false; }
  }

  // Optional per-page opt-out: <body data-allow-anon="1">
  const page = currentPage();
  const bodyAllowsAnon =
    document?.body?.getAttribute?.("data-allow-anon") === "1";

  // Enforce login on all non-allowed pages
  if (!ALLOW_ANON.has(page) && !bodyAllowsAnon) {
    if (!isLoggedIn()) {
      const redir = encodeURIComponent(location.pathname + location.search);
      location.replace(`/login.html?next=${redir}`);
      return;
    }
  }

  // If the user logs out in another tab, kick them off protected pages
  window.addEventListener("storage", (e) => {
    if (e.key === "playerName" || e.key === "playerAvatar") {
      if (!ALLOW_ANON.has(currentPage()) && !isLoggedIn()) {
        location.replace("/login.html");
      }
    }
  });
})();
