import { describe, it, expect } from "vitest";
import {
  PROFILE_SK,
  IDENTITY_SK,
  EMERGENCY_SK,
  AGGREGATE_PROTECTED_LIVES_PK,
  AGGREGATE_CURRENT_SK,
  GSI2_INDEX,
  profilePk,
  documentSk,
  auditPk,
  auditSk,
  auditProfileGsiPk,
  profileItem,
  itemToProfile,
  emergencyItem,
  itemToEmergencyProfile,
  auditItem,
  itemToAudit,
} from "@/lib/data/aws/keys";
import type {
  AuditActorType,
  AuditEvent,
  AuditTargetType,
  DeviceStatus,
  DocumentCategory,
  DocumentStatus,
  EmergencyProfile,
  IdentityVerificationStatus,
  IdType,
  Profile,
  ProfileStatus,
  VerificationLevel,
} from "@/lib/data/entities";
import { OPS_AUDIT_EVENT } from "@/lib/work/audit";

/**
 * Guards the FROZEN shared-table contract: these strings must match the Patient
 * Platform's `lib/data/aws/keys.ts` exactly, because both products write the
 * same table. If a value here changes, it is a breaking, cross-product change.
 */
describe("shared single-table key contract", () => {
  it("pins the exact key strings", () => {
    expect(PROFILE_SK).toBe("PROFILE");
    expect(IDENTITY_SK).toBe("IDENTITY");
    expect(EMERGENCY_SK).toBe("EMERGENCY");
    expect(GSI2_INDEX).toBe("GSI2");
    expect(profilePk("p1")).toBe("PROFILE#p1");
    expect(documentSk("d1")).toBe("DOCUMENT#d1");
    expect(auditPk("PROFILE", "p1")).toBe("AUDIT#PROFILE#p1");
    expect(auditSk("2026-06-30T00:00:00.000Z", "e1")).toBe(
      "TS#2026-06-30T00:00:00.000Z#e1",
    );
    expect(auditProfileGsiPk("p1")).toBe("PROFILE#p1");
  });

  it("pins the Ops-owned aggregate key", () => {
    expect(AGGREGATE_PROTECTED_LIVES_PK).toBe("AGGREGATE#PROTECTED_LIVES");
    expect(AGGREGATE_CURRENT_SK).toBe("CURRENT");
  });
});

const profile: Profile = {
  profileId: "p1",
  emrid: "EMR-1",
  firstName: "Test",
  lastName: "Person",
  dateOfBirth: "1990-01-01",
  status: "ACTIVE",
  verificationLevel: "UNVERIFIED",
  idType: "SOUTH_AFRICAN_ID",
  idNumberMasked: "9001•••••••00",
  identityVerificationStatus: "PENDING",
  identitySubmittedAt: "2026-06-28T08:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-06-28T08:00:00.000Z",
};

describe("profile item round-trip", () => {
  it("stores PK/SK/type and reconstructs the Profile", () => {
    const item = profileItem(profile);
    expect(item.PK).toBe("PROFILE#p1");
    expect(item.SK).toBe("PROFILE");
    expect(item.type).toBe("PROFILE");
    expect(itemToProfile(item)).toEqual(profile);
  });

  it("itemToProfile never reconstructs a raw id number", () => {
    // Even if a stray idNumber sat on the item, the reconstructor must drop it.
    const reconstructed = itemToProfile({ ...profileItem(profile), idNumber: "9001015800000" });
    expect("idNumber" in reconstructed).toBe(false);
  });
});

/**
 * Pin the reconciled enum VALUE sets against the Patient Platform's `types/*`.
 * Each `Record<Union, true>` is exhaustive: adding/removing a member of the
 * union fails typecheck here (forcing a deliberate, reviewed change), and the
 * runtime assertion documents the exact Patient-aligned value set. This is the
 * value-level guard the key-string pins alone could not provide.
 *
 * `AuditActorType` is the Patient set + the Ops-specific `OPS` actor
 * (audit-vocabulary Option A), and the Ops-authored event types are pinned too —
 * both require the matching additions on the Patient side (OPERATOR_HANDOFF §6b).
 */
const PROFILE_STATUSES: Record<ProfileStatus, true> = {
  ACTIVE: true,
  INACTIVE: true,
  LEGACY: true,
  DELETED: true,
};
const VERIFICATION_LEVELS: Record<VerificationLevel, true> = {
  UNVERIFIED: true,
  IDENTITY_VERIFIED: true,
  DEVICE_VERIFIED: true,
  PRACTITIONER_VERIFIED: true,
  ORGANISATION_VERIFIED: true,
};
const ID_TYPES: Record<IdType, true> = {
  SOUTH_AFRICAN_ID: true,
  PASSPORT: true,
  OTHER: true,
};
const IDENTITY_VERIFICATION_STATUSES: Record<IdentityVerificationStatus, true> = {
  UNVERIFIED: true,
  PENDING: true,
  VERIFIED: true,
  REJECTED: true,
};
const DOCUMENT_STATUSES: Record<DocumentStatus, true> = {
  PENDING_UPLOAD: true,
  STORED: true,
};
const DOCUMENT_CATEGORIES: Record<DocumentCategory, true> = {
  ID_DOCUMENT: true,
  MEDICAL_AID_CARD: true,
  PRESCRIPTION: true,
  LAB_RESULT: true,
  DOCTOR_LETTER: true,
  OTHER: true,
};
const DEVICE_STATUSES: Record<DeviceStatus, true> = {
  PENDING: true,
  ACTIVE: true,
  SUSPENDED: true,
  REPLACED: true,
  REVOKED: true,
};
const AUDIT_TARGET_TYPES: Record<AuditTargetType, true> = {
  USER: true,
  PROFILE: true,
  DEVICE: true,
  CONSENT: true,
  DOCUMENT: true,
};
const AUDIT_ACTOR_TYPES: Record<AuditActorType, true> = {
  USER: true,
  GUARDIAN: true,
  ADMIN: true,
  PUBLIC_RESPONDER: true,
  PRACTITIONER: true,
  SYSTEM: true,
  OPS: true,
};

describe("shared entity enum values (reconciled with the Patient Platform)", () => {
  it("pins each reconciled enum value set", () => {
    expect(Object.keys(PROFILE_STATUSES).sort()).toEqual(
      ["ACTIVE", "DELETED", "INACTIVE", "LEGACY"],
    );
    expect(Object.keys(VERIFICATION_LEVELS).sort()).toEqual(
      [
        "DEVICE_VERIFIED",
        "IDENTITY_VERIFIED",
        "ORGANISATION_VERIFIED",
        "PRACTITIONER_VERIFIED",
        "UNVERIFIED",
      ],
    );
    expect(Object.keys(ID_TYPES).sort()).toEqual(
      ["OTHER", "PASSPORT", "SOUTH_AFRICAN_ID"],
    );
    expect(Object.keys(IDENTITY_VERIFICATION_STATUSES).sort()).toEqual(
      ["PENDING", "REJECTED", "UNVERIFIED", "VERIFIED"],
    );
    expect(Object.keys(DOCUMENT_STATUSES).sort()).toEqual(
      ["PENDING_UPLOAD", "STORED"],
    );
    expect(Object.keys(DOCUMENT_CATEGORIES).sort()).toEqual(
      [
        "DOCTOR_LETTER",
        "ID_DOCUMENT",
        "LAB_RESULT",
        "MEDICAL_AID_CARD",
        "OTHER",
        "PRESCRIPTION",
      ],
    );
    expect(Object.keys(DEVICE_STATUSES).sort()).toEqual(
      ["ACTIVE", "PENDING", "REPLACED", "REVOKED", "SUSPENDED"],
    );
    expect(Object.keys(AUDIT_TARGET_TYPES).sort()).toEqual(
      ["CONSENT", "DEVICE", "DOCUMENT", "PROFILE", "USER"],
    );
    expect(Object.keys(AUDIT_ACTOR_TYPES).sort()).toEqual(
      ["ADMIN", "GUARDIAN", "OPS", "PRACTITIONER", "PUBLIC_RESPONDER", "SYSTEM", "USER"],
    );
  });

  it("pins the Ops-authored audit event types (shared-vocabulary additions)", () => {
    expect(OPS_AUDIT_EVENT).toEqual({
      IDENTITY_VERIFIED: "IDENTITY_VERIFIED",
      IDENTITY_REJECTED: "IDENTITY_REJECTED",
      CARD_ACTIVATED: "CARD_ACTIVATED",
      WORK_TRANSITION: "OPS_WORK_TRANSITION",
    });
  });
});

describe("emergency item round-trip", () => {
  const emergency: EmergencyProfile = {
    profileId: "p1",
    bloodType: { value: "O+", visibility: "PUBLIC_EMERGENCY" },
    allergies: { value: ["Penicillin"], visibility: "PUBLIC_EMERGENCY" },
    emergencyContacts: {
      value: [{ name: "Jane", relationship: "Sister", phone: "+27800000001" }],
      visibility: "PUBLIC_EMERGENCY",
    },
    updatedAt: "2026-06-28T08:00:00.000Z",
  };

  it("stores PK = PROFILE#<id>, SK = EMERGENCY and reconstructs the profile", () => {
    const item = emergencyItem(emergency);
    expect(item.PK).toBe("PROFILE#p1");
    expect(item.SK).toBe("EMERGENCY");
    expect(item.type).toBe("EMERGENCY_PROFILE");
    // Round-trip drops the table keys and preserves every visible field.
    expect(itemToEmergencyProfile(item)).toEqual(emergency);
  });
});

describe("audit item indexing", () => {
  it("sets GSI2 for a PROFILE-target event (profile timeline)", () => {
    const event: AuditEvent = {
      eventId: "e1",
      eventType: "IDENTITY_VERIFIED",
      actorType: "OPS",
      actorId: "ops-1",
      targetType: "PROFILE",
      targetId: "p1",
      timestamp: "2026-06-30T00:00:00.000Z",
    };
    const item = auditItem(event);
    expect(item.PK).toBe("AUDIT#PROFILE#p1");
    expect(item.SK).toBe("TS#2026-06-30T00:00:00.000Z#e1");
    expect(item.GSI2PK).toBe("PROFILE#p1");
    expect(itemToAudit(item)).toEqual(event);
  });

  it("omits GSI2 for a non-profile target", () => {
    const item = auditItem({
      eventId: "e2",
      eventType: "X",
      actorType: "SYSTEM",
      targetType: "USER",
      targetId: "u1",
      timestamp: "2026-06-30T00:00:00.000Z",
    });
    expect("GSI2PK" in item).toBe(false);
  });
});
