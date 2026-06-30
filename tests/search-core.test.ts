import { describe, it, expect } from "vitest";
import {
  scoreCommand,
  searchCommands,
  groupCommands,
  type CommandItem,
} from "@/lib/search/core";

const commands: CommandItem[] = [
  { id: "1", title: "Dashboard", group: "Navigation", href: "/dashboard" },
  {
    id: "2",
    title: "Card Fulfilment",
    group: "Navigation",
    href: "/card-fulfilment",
    keywords: ["encode", "dispatch"],
  },
  {
    id: "3",
    title: "Thandi Mokoena",
    subtitle: "Customer",
    group: "Customers",
  },
  { id: "4", title: "Create work item", group: "Actions", keywords: ["new"] },
];

describe("scoreCommand", () => {
  it("ranks prefix > substring > keyword/subtitle, null for no match", () => {
    expect(scoreCommand(commands[1]!, "card")).toBe(3); // title prefix
    expect(scoreCommand(commands[1]!, "fulfil")).toBe(2); // title substring
    expect(scoreCommand(commands[1]!, "encode")).toBe(1); // keyword
    expect(scoreCommand(commands[1]!, "zzz")).toBeNull();
  });

  it("an empty query matches everything at score 0", () => {
    expect(scoreCommand(commands[0]!, "")).toBe(0);
    expect(scoreCommand(commands[0]!, "   ")).toBe(0);
  });
});

describe("searchCommands", () => {
  it("returns all items for an empty query, in source order", () => {
    expect(searchCommands(commands, "").map((c) => c.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("filters and ranks by score", () => {
    const results = searchCommands(commands, "card");
    expect(results.map((c) => c.id)).toEqual(["2"]);
  });

  it("matches keywords and subtitles", () => {
    expect(searchCommands(commands, "new").map((c) => c.id)).toEqual(["4"]);
    expect(searchCommands(commands, "customer").map((c) => c.id)).toEqual([
      "3",
    ]);
  });

  it("honours a limit", () => {
    expect(searchCommands(commands, "", 2)).toHaveLength(2);
  });
});

describe("groupCommands", () => {
  it("groups in canonical order and drops empty groups", () => {
    const sections = groupCommands(searchCommands(commands, ""));
    expect(sections.map((s) => s.group)).toEqual([
      "Navigation",
      "Customers",
      "Actions",
    ]);
    expect(sections[0]!.items.map((i) => i.id)).toEqual(["1", "2"]);
  });
});
