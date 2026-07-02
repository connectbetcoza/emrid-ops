import { describe, it, expect } from "vitest";
import {
  buildFulfilmentPack,
  fulfilmentDevice,
  lastTapAt,
  nfcUrlFor,
} from "@/lib/customers/fulfilment-pack";
import type { AuditEvent, Device } from "@/lib/data/entities";

function device(over: Partial<Device> = {}): Device {
  return {
    deviceId: "dev-1",
    profileId: "CUS-1",
    status: "PENDING",
    token: "tok-abc123",
    activationCode: "ACT-0001",
    issuedAt: "2026-06-28T08:00:00.000Z",
    updatedAt: "2026-06-28T08:00:00.000Z",
    ...over,
  };
}

function tap(over: Partial<AuditEvent> = {}): AuditEvent {
  return {
    eventId: "e1",
    eventType: "DEVICE_TAP_TESTED",
    actorType: "PUBLIC_RESPONDER",
    targetType: "DEVICE",
    targetId: "dev-1",
    timestamp: "2026-06-29T10:00:00.000Z",
    ...over,
  };
}

describe("nfcUrlFor", () => {
  it("builds <patient origin>/e/<token>", () => {
    expect(nfcUrlFor("https://app.emrid.co.za", "tok-abc123")).toBe(
      "https://app.emrid.co.za/e/tok-abc123",
    );
  });

  it("tolerates a trailing slash on the base", () => {
    expect(nfcUrlFor("http://localhost:3000/", "t")).toBe(
      "http://localhost:3000/e/t",
    );
  });
});

describe("lastTapAt", () => {
  it("is null with no tap-type events", () => {
    expect(lastTapAt([])).toBeNull();
    expect(lastTapAt([tap({ eventType: "CARD_REQUESTED" })])).toBeNull();
  });

  it("returns the newest tap across test taps and responder views", () => {
    const events = [
      tap({ timestamp: "2026-06-29T10:00:00.000Z" }),
      tap({
        eventId: "e2",
        eventType: "EMERGENCY_PROFILE_VIEWED",
        timestamp: "2026-06-30T09:00:00.000Z",
      }),
      tap({ eventId: "e3", timestamp: "2026-06-28T08:00:00.000Z" }),
    ];
    expect(lastTapAt(events)).toBe("2026-06-30T09:00:00.000Z");
  });
});

describe("buildFulfilmentPack", () => {
  it("assembles everything the officer needs to encode + verify", () => {
    const pack = buildFulfilmentPack({
      emrid: "EMR-2042",
      device: device(),
      deviceEvents: [tap()],
      patientBaseUrl: "https://app.emrid.co.za",
    });
    expect(pack).toEqual({
      emrid: "EMR-2042",
      deviceId: "dev-1",
      token: "tok-abc123",
      nfcUrl: "https://app.emrid.co.za/e/tok-abc123",
      activationCode: "ACT-0001",
      status: "PENDING",
      lastTapAt: "2026-06-29T10:00:00.000Z",
    });
  });

  it("reports a missing activation code as null (rendered 'Not generated')", () => {
    const pack = buildFulfilmentPack({
      emrid: "EMR-1",
      device: device({ activationCode: undefined }),
      deviceEvents: [],
      patientBaseUrl: "http://localhost:3000",
    });
    expect(pack.activationCode).toBeNull();
    expect(pack.lastTapAt).toBeNull();
  });
});

describe("fulfilmentDevice", () => {
  it("prefers the PENDING device being fulfilled", () => {
    const pending = device({ deviceId: "d-pending", status: "PENDING" });
    const active = device({ deviceId: "d-active", status: "ACTIVE" });
    expect(fulfilmentDevice([active, pending])?.deviceId).toBe("d-pending");
  });

  it("falls back to ACTIVE, then any, then null", () => {
    const active = device({ deviceId: "d-active", status: "ACTIVE" });
    const revoked = device({ deviceId: "d-revoked", status: "REVOKED" });
    expect(fulfilmentDevice([revoked, active])?.deviceId).toBe("d-active");
    expect(fulfilmentDevice([revoked])?.deviceId).toBe("d-revoked");
    expect(fulfilmentDevice([])).toBeNull();
  });
});
