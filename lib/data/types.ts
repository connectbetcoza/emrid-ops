import type {
  AuditEvent,
  AuditTargetType,
  Device,
  DirectoryEntry,
  Practice,
  Practitioner,
  PractitionerAccess,
  PractitionerDirectoryEntry,
  DocumentMetadata,
  EmergencyProfile,
  IdentityRecord,
  IdentityVerificationStatus,
  NewAuditEvent,
  OpsNote,
  Profile,
  ProtectedLivesAggregate,
} from "@/lib/data/entities";
import type { WorkItemRecord } from "@/lib/data/work-record";
import type { WorkDomain } from "@/lib/work/work-type";
import type { WorkStatus } from "@/lib/work/status";

/**
 * Repository contracts (the spine) — interfaces only; obtained from the factory
 * (`lib/data/index.ts`). Each has a mock (in-memory) and a DynamoDB impl,
 * selected by `USE_MOCK_DATA`. Methods never throw "not found" — they return
 * `null`/`[]`. Phase 1 covers the identity-verification vertical slice; more
 * entities (devices/cards) are added from the same shared contract later.
 */

export type IdentityDecision = "VERIFIED" | "REJECTED";

export type IdentityDecisionInput = {
  decision: IdentityDecision;
  notes?: string;
  /** Ops user (Cognito sub) who made the decision — recorded in audit. */
  decidedByOpsUserId: string;
};

export interface ProfileRepository {
  getProfile(profileId: string): Promise<Profile | null>;
  /**
   * Profiles at a given identity-verification status — the source of the
   * Identity queue projection. NOTE: the shared table has no index on identity
   * status; the DynamoDB impl cannot serve this without an access-pattern
   * decision (GSI or an Ops work index) — see the Phase 1 handoff/risks.
   */
  listByIdentityStatus(
    status: IdentityVerificationStatus,
  ): Promise<Profile[]>;
  /** The isolated raw-id item — Ops-only, never logged/serialised to clients. */
  getIdentity(profileId: string): Promise<IdentityRecord | null>;
  /** The pivotal Ops write: approve / reject a customer's identity. */
  setIdentityDecision(
    profileId: string,
    input: IdentityDecisionInput,
  ): Promise<Profile>;
}

/**
 * Emergency medical data on the shared table (`PROFILE#<id>/EMERGENCY`). Ops is
 * READ-ONLY here — the Patient Platform owns writes (the customer fills in their
 * emergency profile). Ops reads it to derive the emergency-info and
 * emergency-contact readiness factors. A single base-table `GetItem` — never a
 * scan. Returns `null` when the customer has no emergency profile yet.
 */
export interface EmergencyProfileRepository {
  getEmergencyProfile(profileId: string): Promise<EmergencyProfile | null>;
}

export interface DocumentRepository {
  listForProfile(profileId: string): Promise<DocumentMetadata[]>;
  getDocument(
    profileId: string,
    documentId: string,
  ): Promise<DocumentMetadata | null>;
}

export interface AuditRepository {
  record(event: NewAuditEvent): Promise<AuditEvent>;
  listForProfile(profileId: string): Promise<AuditEvent[]>;
  listForTarget(
    targetType: AuditTargetType,
    targetId: string,
  ): Promise<AuditEvent[]>;
}

/**
 * Devices/cards on the shared table. Reads list a customer's devices (the
 * per-profile partition) or resolve a device by NFC token (GSI1). The
 * fulfilment write `markCardActive` issues a device if none exists and sets it
 * ACTIVE — the step that can make a customer Protected. Writes are dual
 * (canonical + per-profile item), kept consistent.
 */
export interface DeviceRepository {
  listForCustomer(customerId: string): Promise<Device[]>;
  getByToken(token: string): Promise<Device | null>;
  /** Issue-and-activate the customer's card (idempotent activation). */
  markCardActive(customerId: string): Promise<Device>;
}

export type WorkTransitionInput = {
  toStatus: WorkStatus;
  /** Updated step for multi-step work types; defaults to the current step. */
  step?: number;
};

/**
 * Persisted Work Items — the operational source of truth. A queue is
 * `listByDomain`; the Customer Workspace's Active Work is `listForCustomer`.
 * Both reads hit a queryable partition (NO profile scan, NO GSI). `transition`
 * rewrites BOTH projection items together (status is in both SKs).
 */
export type PractitionerDecision = "APPROVED" | "REJECTED";

export type PractitionerDecisionInput = {
  decision: PractitionerDecision;
  /** Decision notes (e.g. rejection reason) — written to `statusNotes`. */
  notes?: string;
  /** Ops user (Cognito sub) who made the decision — recorded in audit. */
  decidedByOpsUserId: string;
};

export type CreatePracticeInput = {
  practiceId: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
};

export type CreatePractitionerInput = {
  /** V1: equals the Cognito sub when known; else a generated `prac_` id. */
  practitionerId: string;
  practiceId: string;
  fullName: string;
  email: string;
  registrationNumber?: string;
  /** V1 internal onboarding defaults to APPROVED ("Active"). */
  status: "APPROVED" | "PENDING";
};

export type UpdatePractitionerAccountInput = {
  fullName?: string;
  email?: string;
  registrationNumber?: string;
  status?: "APPROVED" | "PENDING" | "SUSPENDED" | "REJECTED";
};

export type UpdatePracticeInput = {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
};

/**
 * Practitioners/practices on the shared table. V1: ADMINISTRATION owns
 * creation — Ops creates and manages practitioner/practice records (no public
 * sign-up exists) and writes the review decision for pending accounts. The
 * practitioner portal reads all of it back.
 */
export interface PractitionerRepository {
  getPractitioner(practitionerId: string): Promise<Practitioner | null>;
  getPractice(practiceId: string): Promise<Practice | null>;
  /** The practitioner's patient grants (Query, no scan). Read-only for Ops. */
  listPatientAccess(practitionerId: string): Promise<PractitionerAccess[]>;
  /**
   * The inverse read: a customer's practitioner grants (the `PROFILE#<id>` /
   * `PRACTITIONER#<practitionerId>` items — Query, no scan). Read-only for
   * Ops; patients own granting.
   */
  listAccessForProfile(profileId: string): Promise<PractitionerAccess[]>;
  /** Internal onboarding: create the practice record (idempotent on id). */
  createPractice(input: CreatePracticeInput): Promise<Practice>;
  /** Internal onboarding: create the practitioner record (idempotent on id). */
  createPractitioner(input: CreatePractitionerInput): Promise<Practitioner>;
  /** Manage account particulars (name / email / registration / status). */
  updatePractitionerAccount(
    practitionerId: string,
    input: UpdatePractitionerAccountInput,
  ): Promise<Practitioner>;
  /** Manage practice particulars (name / contact details). */
  updatePractice(
    practiceId: string,
    input: UpdatePracticeInput,
  ): Promise<Practice>;
  setApprovalDecision(
    practitionerId: string,
    input: PractitionerDecisionInput,
  ): Promise<Practitioner>;
  /**
   * Link a Cognito login to an unlinked (`prac_`) account by re-keying the
   * practitioner record — and every access-grant pair — to the sub, atomically.
   * The record id IS the login join key on the Patient Platform, so this is
   * the one sanctioned identity rewrite. Fails when the target id is taken.
   */
  linkPractitionerLogin(
    currentId: string,
    cognitoUserId: string,
  ): Promise<Practitioner>;
}

/**
 * Customer Directory — the producer-maintained listing projection (Ops-owned).
 * `listCustomers` is a single-partition Query (never a scan); `upsertEntry` is
 * a recompute-from-truth overwrite, so replays are harmless.
 */
export interface DirectoryRepository {
  listCustomers(): Promise<DirectoryEntry[]>;
  getEntry(profileId: string): Promise<DirectoryEntry | null>;
  upsertEntry(entry: DirectoryEntry): Promise<DirectoryEntry>;
  listPractitioners(): Promise<PractitionerDirectoryEntry[]>;
  upsertPractitionerEntry(
    entry: PractitionerDirectoryEntry,
  ): Promise<PractitionerDirectoryEntry>;
  /**
   * Remove a practitioner's roster entry. Recompute-from-truth includes
   * absence: when the source record is gone (re-keyed to a new login id),
   * its old entry must not linger. Idempotent — removing a missing entry
   * is a no-op, so stream replays are harmless.
   */
  removePractitionerEntry(practitionerId: string): Promise<void>;
}

/** A signed change to the maintained Protected-Lives counters. */
export type ProtectedLivesDelta = {
  /** +1 when a customer crosses INTO protected, −1 when out, 0 otherwise. */
  protected: number;
  /** Inverse movement across the boundary (in_progress ⇄ protected). */
  inProgress: number;
};

/**
 * Maintained aggregate of the north-star figure (Ops-owned item, no scan, no
 * GSI). The Protected-Lives engine reads it; `executeTransition` adjusts it on
 * a Protected-boundary crossing. `adjustProtectedLives` is an atomic counter
 * update — never a read-modify-write — so concurrent transitions don't clobber.
 */
export interface AggregateRepository {
  getProtectedLives(): Promise<ProtectedLivesAggregate>;
  adjustProtectedLives(
    delta: ProtectedLivesDelta,
  ): Promise<ProtectedLivesAggregate>;
}

export interface WorkItemRepository {
  /**
   * Create a Work Item (dual-write). **Idempotent on `workItemId`**: a replay of
   * the same id is a no-op that returns the existing item, never a duplicate and
   * never an overwrite of progress — so the Stream producer can re-deliver safely.
   */
  create(record: WorkItemRecord): Promise<WorkItemRecord>;
  /** Queue projection — all work in a domain (UI filters/sorts via the pure core). */
  listByDomain(domain: WorkDomain): Promise<WorkItemRecord[]>;
  /** Customer active-work — all work for one customer, from the customer index. */
  listForCustomer(customerId: string): Promise<WorkItemRecord[]>;
  /**
   * Apply a transition. Takes the CURRENT record (so old keys are known) and
   * rewrites both projection items consistently. Returns the updated record.
   */
  transition(
    current: WorkItemRecord,
    input: WorkTransitionInput,
  ): Promise<WorkItemRecord>;
}

/**
 * Internal staff notes — Ops-owned items in the subject's PROFILE# partition
 * (like the work index; never mirrored, never patient-visible). Notes are
 * added and listed newest-first; there is no edit or delete path (corrections
 * are new notes) — the same append-only spirit as the audit trail.
 */
export interface NoteRepository {
  add(note: OpsNote): Promise<OpsNote>;
  /** Newest first. Single-partition Query — no scan. */
  listForSubject(subjectId: string): Promise<OpsNote[]>;
}
