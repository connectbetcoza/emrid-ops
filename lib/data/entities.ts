/**
 * Shared-table entity types — the Ops-relevant SUBSET of the entities the
 * Patient Platform stores in the shared DynamoDB single table.
 *
 * ⚠️ SHARED CONTRACT. These shapes (and the key builders in
 * `lib/data/aws/keys.ts`) MUST stay byte-for-byte compatible with the Patient
 * Platform's `types/*` + `lib/data/aws/keys.ts`. There is no shared package
 * yet, so this is a deliberate, frozen MIRROR — see PRODUCT_ARCHITECTURE.md
 * "shared-contract drift" risk. The exact enum values below must be reconciled
 * against the Patient Platform's `types/profile.ts` before live use; a
 * contract test (`tests/shared-contract.test.ts`) guards the key strings.
 *
 * Ops reads these; Ops writes only the identity-decision fields on Profile and
 * appends AuditEvents (writes that the Patient Platform reads back).
 *
 * Reconciled against the Patient Platform on 2026-06-30: Profile, Identity,
 * Document, Device, Audit, and EmergencyProfile (the last added in the
 * Emergency-repository slice — mirrored verbatim from the Patient Platform's
 * `types/emergency.ts`).
 */

export type ISODateString = string;

export type ProfileStatus = "ACTIVE" | "INACTIVE" | "LEGACY" | "DELETED";
export type VerificationLevel =
  | "UNVERIFIED"
  | "IDENTITY_VERIFIED"
  | "DEVICE_VERIFIED"
  | "PRACTITIONER_VERIFIED"
  | "ORGANISATION_VERIFIED";
export type IdType = "SOUTH_AFRICAN_ID" | "PASSPORT" | "OTHER";
export type IdentityVerificationStatus =
  | "UNVERIFIED"
  | "PENDING"
  | "VERIFIED"
  | "REJECTED";

/** Customer healthcare identity (the `PROFILE#<id>/PROFILE` item). */
export type Profile = {
  profileId: string;
  emrid: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  photoUrl?: string;
  status: ProfileStatus;
  verificationLevel: VerificationLevel;
  idType?: IdType;
  idNumberMasked?: string;
  identityVerificationStatus?: IdentityVerificationStatus;
  identityDocumentId?: string;
  identitySubmittedAt?: ISODateString;
  identityVerifiedAt?: ISODateString;
  identityVerificationNotes?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

/** The isolated, sensitive raw-id item (`PROFILE#<id>/IDENTITY`). Ops-readable. */
export type IdentityRecord = {
  profileId: string;
  idNumber: string;
  idType: string;
  submittedAt: ISODateString;
};

export type DocumentCategory =
  | "ID_DOCUMENT"
  | "MEDICAL_AID_CARD"
  | "PRESCRIPTION"
  | "LAB_RESULT"
  | "DOCTOR_LETTER"
  | "OTHER";
export type DocumentStatus = "PENDING_UPLOAD" | "STORED";

/** Document METADATA (`PROFILE#<id>/DOCUMENT#<id>`); bytes live in S3. */
export type DocumentMetadata = {
  documentId: string;
  profileId: string;
  category: DocumentCategory;
  fileName: string;
  contentType: string;
  sizeBytes?: number;
  status: DocumentStatus;
  storageKey: string;
  uploadedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

/**
 * Device/card — the NFC device that makes a customer protected. Subset of the
 * Patient Platform's Device. Status uses the SHARED device enum (no Ops-only
 * states): the encode/dispatch fulfilment sub-steps live on the Work Item, not
 * here. A device becomes ACTIVE when fulfilment completes.
 */
export type DeviceStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED" | "REPLACED";

export type Device = {
  deviceId: string;
  profileId: string;
  status: DeviceStatus;
  token: string;
  issuedAt: ISODateString;
  activatedAt?: ISODateString;
  updatedAt: ISODateString;
};

/**
 * Emergency medical data — MIRROR of the Patient Platform's `types/emergency.ts`
 * (byte-for-byte). Stored as the `PROFILE#<id>/EMERGENCY` item; Ops reads it to
 * derive the emergency-info and emergency-contact readiness factors. Each field
 * carries its own visibility; an unset field is simply absent. Visibility
 * FILTERING for any public surface is always done in application code AFTER the
 * read — never reflect a non-PUBLIC_EMERGENCY field onto an unauthenticated view.
 */
export type Visibility =
  | "PUBLIC_EMERGENCY"
  | "CONSENT_REQUIRED"
  | "PRIVATE"
  | "PRACTITIONER_ONLY";

/** A value paired with who is allowed to see it. */
export type VisibleField<T> = {
  value: T;
  visibility: Visibility;
};

export type EmergencyContact = {
  name: string;
  relationship?: string;
  phone: string;
};

export type MedicalAidInfo = {
  provider: string;
  memberNumber: string;
  plan?: string;
};

export type DoctorContact = {
  name: string;
  practice?: string;
  phone?: string;
};

export type EmergencyProfile = {
  profileId: string;
  bloodType?: VisibleField<string>;
  allergies?: VisibleField<string[]>;
  chronicConditions?: VisibleField<string[]>;
  medications?: VisibleField<string[]>;
  disabilities?: VisibleField<string[]>;
  emergencyInstructions?: VisibleField<string>;
  emergencyContacts?: VisibleField<EmergencyContact[]>;
  medicalAid?: VisibleField<MedicalAidInfo>;
  preferredHospital?: VisibleField<string>;
  familyDoctor?: VisibleField<DoctorContact>;
  updatedAt: ISODateString;
};

/**
 * Audit actor. Reconciled with the Patient Platform's `AuditActorType` PLUS the
 * Ops-specific `OPS` actor (audit-vocabulary **Option A** — Ops actions are
 * recorded as first-class facts, never disguised as a generic Patient actor).
 * The Patient Platform must add `OPS` to its own union — see OPERATOR_HANDOFF §6b.
 */
export type AuditActorType =
  | "USER"
  | "GUARDIAN"
  | "ADMIN"
  | "PUBLIC_RESPONDER"
  | "PRACTITIONER"
  | "SYSTEM"
  | "OPS";
export type AuditTargetType =
  | "USER"
  | "PROFILE"
  | "DEVICE"
  | "CONSENT"
  | "DOCUMENT";

/** Append-only audit event (`AUDIT#<targetType>#<targetId>/TS#…`). */
export type AuditEvent = {
  eventId: string;
  eventType: string;
  actorType: AuditActorType;
  actorId?: string;
  targetType: AuditTargetType;
  targetId: string;
  timestamp: ISODateString;
  metadata?: Record<string, unknown>;
};

export type NewAuditEvent = Omit<AuditEvent, "eventId" | "timestamp">;

/**
 * Protected-Lives aggregate (`AGGREGATE#PROTECTED_LIVES / CURRENT`).
 *
 * ⚠️ Ops-OWNED — NOT mirrored from the Patient Platform. This is a new item type
 * Operations maintains on the shared table to avoid scanning profiles to count
 * the north-star figure. The Patient Platform neither reads nor writes it, so it
 * carries no cross-product drift risk (unlike the mirrored entities above). It
 * is maintained by `executeTransition` on Protected-boundary crossings and read
 * by the Protected-Lives engine. Counts reflect Ops-observed crossings from a
 * seeded baseline — see OPERATOR_HANDOFF (backfill + reconciliation).
 */
export type ProtectedLivesAggregate = {
  /** Customers currently PROTECTED. */
  protectedCount: number;
  /** Customers currently IN_PROGRESS (maintained inversely on crossings). */
  inProgressCount: number;
  lastUpdatedAt: ISODateString;
  /** Monotonic write counter — diagnostics / optimistic-concurrency hook. */
  version: number;
};
