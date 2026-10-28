// Applies the saved theme before first paint (no light flash); ThemeContext takes over after mount.
(function () {
  try {
    if (localStorage.getItem("theme") === "light") return;
  } catch (e) {
    /* storage unavailable: default dark */
  }
  document.documentElement.classList.add("dark");
})();
