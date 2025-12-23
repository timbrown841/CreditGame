<!-- auth-guard.js -->
<script>
(function () {
  // --- PAGES THAT SHOULD BE ACCESSIBLE WITHOUT LOGIN ---
  // Add/remove filenames here as needed.
  const ALLOW_ANON = new Set([
    "",                     // root (e.g. / or /index.html)
    "index.html",
    "login.html",
    "register.html",
    "verified.html",
    "reset-password.html",
    "privacy.html",
    "terms.html",
    "cookies.html",
    "about.html",
    "site.webmanifest",
    "favicon.ico"
  ]);

  // Helper: current page filename (no querystring)
  function currentPage() {
    const path = (location.pathname || "/").toLowerCase();
    const file = path.split("/").pop();     // "" if trailing slash
    return file || "index.html";
  }

  // Helper: is logged in per your current scheme
  function isLoggedIn() {
    try {
      const name = (localStorage.getItem("playerName") || "").trim();
      const avatar = (localStorage.getItem("playerAvatar") || "").trim();
      return !!(name && avatar);
    } catch { return false; }
  }

  // Allow page-level opt-out by setting: <body data-allow-anon="1">
  const bodyAllowsAnon = document?.body?.getAttribute?.("data-allow-anon") === "1";
  const page = currentPage();

  // If this page is not in the allowlist and body doesn't opt-out,
  // require the user to be logged in.
  if (!ALLOW_ANON.has(page) && !bodyAllowsAnon) {
    if (!isLoggedIn()) {
      // Optional: preserve where they were going
      const redir = encodeURIComponent(location.pathname + location.search);
      location.replace(`login.html?next=${redir}`);
      return;
    }
  }

  // Bonus: if the user logs out in another tab, bounce them
  window.addEventListener("storage", (e) => {
    if (e.key === "playerName" || e.key === "playerAvatar") {
      // Only enforce on protected pages
      if (!ALLOW_ANON.has(currentPage()) && !isLoggedIn()) {
        location.replace("login.html");
      }
    }
  });
})();
</script>
