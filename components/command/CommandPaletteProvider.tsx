"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CommandPalette } from "@/components/command/CommandPalette";
import type { CommandItem } from "@/lib/search/core";
import { NAVIGATION_COMMANDS } from "@/lib/search/commands";

/**
 * Hosts the universal command palette and its global keyboard shortcut
 * (⌘K / Ctrl K). Any client component under the provider can call
 * `useCommandPalette().open()` — the header SearchTrigger does. This is the
 * permanent home of search-first navigation. Navigation commands derive from
 * the real nav; LIVE customer commands are supplied by the server layout (from
 * the Customer Directory) via the `customerCommands` prop.
 */
type CommandPaletteContextValue = {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null,
);

export function CommandPaletteProvider({
  children,
  customerCommands = [],
}: {
  children: React.ReactNode;
  /** Live customer results (serialisable), built server-side from the directory. */
  customerCommands?: CommandItem[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ open, close, toggle, isOpen }),
    [open, close, toggle, isOpen],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette
        open={isOpen}
        onClose={close}
        commands={[...NAVIGATION_COMMANDS, ...customerCommands]}
      />
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error(
      "useCommandPalette must be used within a CommandPaletteProvider",
    );
  }
  return ctx;
}
