/**
 * 主題初始化（避免首屏 FOUC）。須在 <body> 繪製前執行，故不使用 defer。
 * 與 ThemeContext 共用 localStorage key：paperclip.theme
 */
(() => {
  const key = "paperclip.theme";
  const darkThemeColor = "#18181b";
  const lightThemeColor = "#ffffff";
  try {
    const stored = window.localStorage.getItem(key);
    const theme = stored === "light" || stored === "dark" ? stored : "dark";
    const isDark = theme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", isDark ? darkThemeColor : lightThemeColor);
    }
  } catch {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }
})();
