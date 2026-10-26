// Runs in <head> before the page paints, so it never flashes the wrong theme. A separate file
// rather than an inline script, because the CSP allows scripts from this site only.
// The same rules as src/lib/theme.ts: "higgins.theme" is light, dark or auto (the default).
(function () {
  var preference = "auto";
  try {
    preference = localStorage.getItem("higgins.theme") || "auto";
  } catch (e) {
    /* storage blocked: follow the device */
  }
  var dark = preference === "dark" || (preference !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
})();
