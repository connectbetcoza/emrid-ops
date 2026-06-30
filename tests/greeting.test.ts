import { describe, it, expect } from "vitest";
import { timeOfDay, greeting } from "@/lib/greeting";

describe("timeOfDay", () => {
  it("maps the hour to a part of day", () => {
    expect(timeOfDay(0)).toBe("morning");
    expect(timeOfDay(11)).toBe("morning");
    expect(timeOfDay(12)).toBe("afternoon");
    expect(timeOfDay(17)).toBe("afternoon");
    expect(timeOfDay(18)).toBe("evening");
    expect(timeOfDay(23)).toBe("evening");
  });
});

describe("greeting", () => {
  it("composes the greeting with the supplied name", () => {
    expect(greeting(8, "Michael")).toBe("Good morning, Michael");
    expect(greeting(14, "Naledi")).toBe("Good afternoon, Naledi");
    expect(greeting(20, "Sipho")).toBe("Good evening, Sipho");
  });
});
