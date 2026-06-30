"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import {
  groupCommands,
  searchCommands,
  type CommandItem,
} from "@/lib/search/core";
import { Kbd } from "@/components/ui/Kbd";
import { cn } from "@/lib/utils";

/**
 * Universal search palette. Fully keyboard-driven and accessible:
 *   - role="dialog" aria-modal, labelled; focus moves to the input on open
 *   - the input is a combobox controlling a listbox of options
 *   - ↑/↓ move the active option (wrapping), Enter selects, Esc closes
 *
 * Selecting a navigation result routes to it; other result types are inert
 * placeholders in Sprint 1 (no backend). Opening/closing is owned by the
 * provider — this component is controlled.
 */
export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: CommandItem[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const sections = useMemo(
    () => groupCommands(searchCommands(commands, query)),
    [commands, query],
  );
  // Flat, display-ordered list that keyboard navigation indexes into.
  const ordered = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );

  // Reset + focus when the palette opens; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Keep the active option in view.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, sections]);

  if (!open) return null;

  function select(item: CommandItem | undefined) {
    if (!item) return;
    onClose();
    if (item.href) router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (ordered.length ? (i + 1) % ordered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        ordered.length ? (i - 1 + ordered.length) % ordered.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(ordered[activeIndex]);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
      role="presentation"
    >
      <div
        className="absolute inset-0 animate-fade-in bg-foreground/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search EMRID Operations"
        className="relative z-10 w-full max-w-xl animate-scale-in overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            placeholder="Search or jump to…"
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Results"
          className="max-h-[min(24rem,60vh)] overflow-y-auto p-2"
        >
          {ordered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No results for “{query}”
            </p>
          ) : (
            sections.map((section) => (
              <div key={section.group} className="mb-1 last:mb-0">
                <p className="px-3 pb-1 pt-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
                  {section.group}
                </p>
                {section.items.map((item) => {
                  const index = ordered.indexOf(item);
                  const active = index === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-active={active}
                      onClick={() => select(item)}
                      onMouseMove={() => setActiveIndex(index)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground",
                      )}
                    >
                      <span className="flex-1 truncate">
                        <span className="font-medium">{item.title}</span>
                        {item.subtitle ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {item.subtitle}
                          </span>
                        ) : null}
                      </span>
                      {active ? (
                        item.href ? (
                          <ArrowRight
                            className="h-3.5 w-3.5 text-muted-foreground"
                            aria-hidden
                          />
                        ) : (
                          <CornerDownLeft
                            className="h-3.5 w-3.5 text-muted-foreground"
                            aria-hidden
                          />
                        )
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[0.6875rem] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            to navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd>
            to select
          </span>
        </div>
      </div>
    </div>
  );
}
