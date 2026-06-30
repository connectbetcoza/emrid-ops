"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useTheme, type Theme } from "@/components/theme/ThemeProvider";

const ORDER: Theme[] = ["light", "dark", "system"];

const NEXT_LABEL: Record<Theme, string> = {
  light: "Switch to dark theme",
  dark: "Switch to system theme",
  system: "Switch to light theme",
};

/**
 * Cycles the theme preference light → dark → system. Shows the icon for the
 * *current* preference; the accessible label announces what activating it does.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  function cycle() {
    const idx = ORDER.indexOf(theme);
    const next = ORDER[(idx + 1) % ORDER.length] ?? "system";
    setTheme(next);
  }

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Laptop;

  return (
    <IconButton label={NEXT_LABEL[theme]} onClick={cycle}>
      <Icon className="h-4 w-4" aria-hidden />
    </IconButton>
  );
}
