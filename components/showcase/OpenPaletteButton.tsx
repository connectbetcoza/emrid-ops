"use client";

import { Command } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { useCommandPalette } from "@/components/command/CommandPaletteProvider";

/** Opens the universal command palette — same target as ⌘K / Ctrl K. */
export function OpenPaletteButton() {
  const { open } = useCommandPalette();
  return (
    <Button variant="outline" size="sm" onClick={open}>
      <Command className="h-4 w-4" aria-hidden />
      Open command palette
      <span className="ml-1 flex items-center gap-0.5">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </span>
    </Button>
  );
}
