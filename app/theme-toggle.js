"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "theme";

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4.25" />
      <path d="M12 2.75v2.5M12 18.75v2.5M21.25 12h-2.5M5.25 12h-2.5M18.55 5.45l-1.8 1.8M7.25 16.75l-1.8 1.8M18.55 18.55l-1.8-1.8M7.25 7.25l-1.8-1.8" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 14.2a8.4 8.4 0 1 1-10.2-10.2A7 7 0 0 0 20 14.2Z" />
    </svg>
  );
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    const initialTheme = stored === "light" || stored === "dark" ? stored : systemTheme;
    setTheme(initialTheme);
    document.documentElement.setAttribute("data-theme", initialTheme);
  }, []);

  const nextTheme = theme === "dark" ? "light" : "dark";

  function handleToggle() {
    const updatedTheme = theme === "dark" ? "light" : "dark";
    setTheme(updatedTheme);
    document.documentElement.setAttribute("data-theme", updatedTheme);
    window.localStorage.setItem(STORAGE_KEY, updatedTheme);
  }

  return (
    <button
      aria-label={`Switch to ${nextTheme} mode`}
      className="theme-toggle"
      type="button"
      onClick={handleToggle}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
