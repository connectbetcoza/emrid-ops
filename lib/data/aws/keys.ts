import type {
  AuditEvent,
  Device,
  DirectoryEntry,
  PractitionerDirectoryEntry,
  DocumentMetadata,
  EmergencyProfile,
  OpsNote,
  Practice,
  Practitioner,
  PractitionerAccess,
  Profile,
  ProtectedLivesAggregate,
} from "@/lib/data/entities";
import type { WorkItemRecord } from "@/lib/data/work-record";

/**
 * Shared single-table key design — FROZEN MIRROR of the Patient Platform's
 * `lib/data/aws/keys.ts` (table emrid-dev-app, PK + SK; GSI2 = profile activity
 * timeline). Ops and the Patient Platform write the SAME table, so these key
 * strings MUST match exactly. `tests/shared-contract.test.ts` guards them.
 *
 *   Profile          PK = PROFILE#<profileId>   SK = PROFILE
 *   Identity (raw)   PK = PROFILE#<profileId>   SK = IDENTITY
 *   Emergency        PK = PROFILE#<profileId>   SK = EMERGENCY
 *   Document (meta)  PK = PROFILE#<profileId>   SK = DOCUMENT#<documentId>
 *   Audit            PK = AUDIT#<targetType>#<targetId>  SK = TS#<ts>#<eventId>
 *                      + GSI2PK = PROFILE#<profileId> when profile-related
 *
 * Ops only needs this subset (Profile read + identity-decision write, the
 * isolated IDENTITY item, document metadata, append-only audit). Device/card
 * keys are added in a later phase from the same source contract.
 */
export const PROFILE_SK = "PROFILE";
export const IDENTITY_SK = "IDENTITY";
export const EMERGENCY_SK = "EMERGENCY";
export const DOCUMENT_BY_PROFILE_PREFIX_SK = "DOCUMENT#";
export const GSI2_INDEX = "GSI2";
export const AUDIT_PK_PREFIX = "AUDIT#";
export const AUDIT_TYPE = "AUDIT_EVENT";

export const profilePk = (profileId: string): string => `PROFILE#${profileId}`;
export const documentSk = (documentId: string): string =>
  `${DOCUMENT_BY_PROFILE_PREFIX_SK}${documentId}`;

export const auditPk = (targetType: string, targetId: string): string =>
  `${AUDIT_PK_PREFIX}${targetType}#${targetId}`;
export const auditSk = (timestamp: string, eventId: string): string =>
  `TS#${timestamp}#${eventId}`;
export const auditProfileGsiPk = (profileId: string): string =>
  `PROFILE#${profileId}`;

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

// ── Profile ──────────────────────────────────────────────────────────────────

export function profileItem(profile: Profile): Record<string, unknown> {
  return { PK: profilePk(profile.profileId), SK: PROFILE_SK, type: "PROFILE", ...profile };
}

/** Reconstruct a Profile from a stored item. NEVER reconstructs a raw id number. */
export function itemToProfile(item: Record<string, unknown>): Profile {
  return {
    profileId: String(item.profileId),
    emrid: String(item.emrid),
    firstName: String(item.firstName),
    lastName: String(item.lastName),
    dateOfBirth: String(item.dateOfBirth),
    photoUrl: str(item.photoUrl),
    status: item.status as Profile["status"],
    verificationLevel: item.verificationLevel as Profile["verificationLevel"],
    idType: item.idType as Profile["idType"],
    idNumberMasked: str(item.idNumberMasked),
    identityVerificationStatus:
      item.identityVerificationStatus as Profile["identityVerificationStatus"],
    identityDocumentId: str(item.identityDocumentId),
    identitySubmittedAt: str(item.identitySubmittedAt),
    identityVerifiedAt: str(item.identityVerifiedAt),
    identityVerificationNotes: str(item.identityVerificationNotes),
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
  };
}

// ── Emergency ─────────────────────────────────────────────────────────────────

/**
 * DynamoDB item for an EmergencyProfile (MIRROR of the Patient Platform). The
 * full entity — every VisibleField value AND its visibility — is stored as
 * nested attributes; filtering is NEVER done here (it stays in application code
 * after the read). `removeUndefinedValues` on the client drops absent fields.
 */
export function emergencyItem(
  profile: EmergencyProfile,
): Record<string, unknown> {
  return {
    PK: profilePk(profile.profileId),
    SK: EMERGENCY_SK,
    type: "EMERGENCY_PROFILE",
    ...profile,
  };
}

/** Reconstruct an EmergencyProfile from a stored item (drops table keys). */
export function itemToEmergencyProfile(
  item: Record<string, unknown>,
): EmergencyProfile {
  const e = item as Record<string, unknown>;
  return {
    profileId: String(e.profileId),
    bloodType: e.bloodType as EmergencyProfile["bloodType"],
    allergies: e.allergies as EmergencyProfile["allergies"],
    chronicConditions: e.chronicConditions as EmergencyProfile["chronicConditions"],
    medications: e.medications as EmergencyProfile["medications"],
    disabilities: e.disabilities as EmergencyProfile["disabilities"],
    emergencyInstructions:
      e.emergencyInstructions as EmergencyProfile["emergencyInstructions"],
    emergencyContacts: e.emergencyContacts as EmergencyProfile["emergencyContacts"],
    medicalAid: e.medicalAid as EmergencyProfile["medicalAid"],
    preferredHospital: e.preferredHospital as EmergencyProfile["preferredHospital"],
    familyDoctor: e.familyDoctor as EmergencyProfile["familyDoctor"],
    updatedAt: String(e.updatedAt),
  };
}

// ── Identity (isolated, sensitive) ────────────────────────────────────────────

export function itemToIdentity(item: Record<string, unknown>): {
  profileId: string;
  idNumber: string;
  idType: string;
  submittedAt: string;
} {
  return {
    profileId: String(item.profileId),
    idNumber: String(item.idNumber),
    idType: String(item.idType),
    submittedAt: String(item.submittedAt),
  };
}

// ── Document metadata ─────────────────────────────────────────────────────────

export function itemToDocument(item: Record<string, unknown>): DocumentMetadata {
  return {
    documentId: String(item.documentId),
    profileId: String(item.profileId),
    category: item.category as DocumentMetadata["category"],
    fileName: String(item.fileName),
    contentType: String(item.contentType),
    sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : undefined,
    status: item.status as DocumentMetadata["status"],
    storageKey: String(item.storageKey),
    uploadedAt: str(item.uploadedAt),
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
  };
}

// ── Audit (append-only) ───────────────────────────────────────────────────────

export function auditEventProfileId(event: {
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}): string | undefined {
  if (event.targetType === "PROFILE") return event.targetId;
  const fromMeta = event.metadata?.profileId;
  return typeof fromMeta === "string" ? fromMeta : undefined;
}

export function auditItem(event: AuditEvent): Record<string, unknown> {
  const profileId = auditEventProfileId(event);
  const sk = auditSk(event.timestamp, event.eventId);
  return {
    PK: auditPk(event.targetType, event.targetId),
    SK: sk,
    type: AUDIT_TYPE,
    ...(profileId ? { GSI2PK: auditProfileGsiPk(profileId), GSI2SK: sk } : {}),
    ...event,
  };
}

export function itemToAudit(item: Record<string, unknown>): AuditEvent {
  return {
    eventId: String(item.eventId),
    eventType: String(item.eventType),
    actorType: item.actorType as AuditEvent["actorType"],
    actorId: str(item.actorId),
    targetType: item.targetType as AuditEvent["targetType"],
    targetId: String(item.targetId),
    timestamp: String(item.timestamp),
    metadata:
      item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>)
        : undefined,
  };
}

// ── Devices / cards (mirror of the Patient Platform's device keys) ────────────
//
//   Canonical    PK = DEVICE#<deviceId>   SK = DEVICE   (+ GSI1PK = TOKEN#<token>)
//   By profile   PK = PROFILE#<profileId> SK = DEVICE#<deviceId>
//
// Token→device is an exact-match GSI1 query (never scanned/decoded). The
// per-profile duplicate lets Ops list a customer's devices with one base-table
// query. Status changes rewrite BOTH items together.

export const DEVICE_SK = "DEVICE";
export const DEVICE_BY_PROFILE_PREFIX = "DEVICE#";
export const GSI1_INDEX = "GSI1";

export const devicePk = (deviceId: string): string => `DEVICE#${deviceId}`;
export const tokenGsiPk = (token: string): string => `TOKEN#${token}`;
export const deviceSkByProfile = (deviceId: string): string =>
  `${DEVICE_BY_PROFILE_PREFIX}${deviceId}`;

export function deviceItem(device: Device): Record<string, unknown> {
  return {
    PK: devicePk(device.deviceId),
    SK: DEVICE_SK,
    GSI1PK: tokenGsiPk(device.token),
    GSI1SK: devicePk(device.deviceId),
    type: "DEVICE",
    ...device,
  };
}

export function deviceByProfileItem(device: Device): Record<string, unknown> {
  return {
    PK: profilePk(device.profileId),
    SK: deviceSkByProfile(device.deviceId),
    type: "DEVICE_BY_PROFILE",
    ...device,
  };
}

export function itemToDevice(item: Record<string, unknown>): Device {
  return {
    deviceId: String(item.deviceId),
    profileId: String(item.profileId),
    status: item.status as Device["status"],
    token: String(item.token),
    activationCode: str(item.activationCode),
    issuedAt: String(item.issuedAt),
    activatedAt: str(item.activatedAt),
    updatedAt: String(item.updatedAt),
  };
}

// ── Persisted Work Items (Ops work index) ─────────────────────────────────────
//
// Dual-write — every Work Item is stored as TWO items, updated together:
//   1. Queue projection   PK = WORK#<domain>
//                         SK = STATUS#<status>#PRIORITY#<priority>#DUE#<dueAt>#WORK#<id>
//   2. Customer index      PK = PROFILE#<customerId>
//                         SK = WORK#<status>#<id>
// Queues read partition (1) by domain; the Customer Workspace reads partition
// (2) by customer. NO profile scan, NO GSI. Both items carry the full record,
// and both SKs encode `status`, so a status change rewrites both (delete+put).

export const WORK_BY_CUSTOMER_PREFIX = "WORK#"; // SK prefix in PROFILE# partition

export const workPk = (domain: string): string => `WORK#${domain}`;
export const workQueueSk = (
  status: string,
  priority: string,
  dueAt: string,
  workItemId: string,
): string =>
  `STATUS#${status}#PRIORITY#${priority}#DUE#${dueAt}#WORK#${workItemId}`;
export const workCustomerSk = (status: string, workItemId: string): string =>
  `${WORK_BY_CUSTOMER_PREFIX}${status}#${workItemId}`;

/** Queue projection item (read by domain). */
export function workQueueItem(record: WorkItemRecord): Record<string, unknown> {
  return {
    PK: workPk(record.workDomain),
    SK: workQueueSk(record.status, record.priority, record.dueAt, record.workItemId),
    type: "WORK_QUEUE",
    ...record,
  };
}

/** Per-customer index item (read by customer, under the PROFILE# partition). */
export function workCustomerItem(record: WorkItemRecord): Record<string, unknown> {
  return {
    PK: profilePk(record.customerId),
    SK: workCustomerSk(record.status, record.workItemId),
    type: "WORK_BY_CUSTOMER",
    ...record,
  };
}

/** Reconstruct a WorkItemRecord from either projection item (drops table keys). */
export function itemToWorkRecord(item: Record<string, unknown>): WorkItemRecord {
  return {
    workItemId: String(item.workItemId),
    customerId: String(item.customerId),
    workType: item.workType as WorkItemRecord["workType"],
    workDomain: item.workDomain as WorkItemRecord["workDomain"],
    status: item.status as WorkItemRecord["status"],
    priority: item.priority as WorkItemRecord["priority"],
    step: typeof item.step === "number" ? item.step : 0,
    assignment: item.assignment as WorkItemRecord["assignment"],
    source: item.source as WorkItemRecord["source"],
    title: String(item.title),
    subjectName: String(item.subjectName),
    nextAction: String(item.nextAction),
    dueAt: String(item.dueAt),
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
  };
}

// ── Protected-Lives aggregate (Ops-owned; not mirrored) ───────────────────────

export const AGGREGATE_PROTECTED_LIVES_PK = "AGGREGATE#PROTECTED_LIVES";
export const AGGREGATE_CURRENT_SK = "CURRENT";

/** DynamoDB item for the single Protected-Lives aggregate row. */
export function protectedLivesAggregateItem(
  agg: ProtectedLivesAggregate,
): Record<string, unknown> {
  return {
    PK: AGGREGATE_PROTECTED_LIVES_PK,
    SK: AGGREGATE_CURRENT_SK,
    type: "PROTECTED_LIVES_AGGREGATE",
    ...agg,
  };
}

/** Reconstruct the aggregate from a stored item (drops table keys). */
export function itemToProtectedLivesAggregate(
  item: Record<string, unknown>,
): ProtectedLivesAggregate {
  return {
    protectedCount: Number(item.protectedCount ?? 0),
    inProgressCount: Number(item.inProgressCount ?? 0),
    lastUpdatedAt: typeof item.lastUpdatedAt === "string" ? item.lastUpdatedAt : "",
    version: Number(item.version ?? 0),
  };
}

// ── Customer Directory (Ops-owned; not mirrored) ──────────────────────────────

export const DIRECTORY_PK = "DIRECTORY";
export const DIRECTORY_CUSTOMER_PREFIX_SK = "CUSTOMER#";
export const directorySk = (profileId: string): string =>
  `${DIRECTORY_CUSTOMER_PREFIX_SK}${profileId}`;

/** DynamoDB item for a Customer Directory entry (single-partition list). */
export function directoryItem(entry: DirectoryEntry): Record<string, unknown> {
  return {
    PK: DIRECTORY_PK,
    SK: directorySk(entry.profileId),
    type: "CUSTOMER_DIRECTORY",
    ...entry,
  };
}

/** Reconstruct a DirectoryEntry from a stored item (drops table keys). */
export function itemToDirectoryEntry(
  item: Record<string, unknown>,
): DirectoryEntry {
  return {
    profileId: String(item.profileId),
    emrid: String(item.emrid),
    firstName: String(item.firstName),
    lastName: String(item.lastName),
    displayName: String(item.displayName),
    identityStatus: item.identityStatus as DirectoryEntry["identityStatus"],
    verificationLevel: item.verificationLevel as DirectoryEntry["verificationLevel"],
    protectionStatus: item.protectionStatus as DirectoryEntry["protectionStatus"],
    readinessScore: Number(item.readinessScore ?? 0),
    activeWorkCount: Number(item.activeWorkCount ?? 0),
    lastActivityAt:
      typeof item.lastActivityAt === "string" ? item.lastActivityAt : null,
    practitionerId: str(item.practitionerId),
    profileComplete: Boolean(item.profileComplete),
    emergencyInfoComplete: Boolean(item.emergencyInfoComplete),
    emergencyContactsCount: Number(item.emergencyContactsCount ?? 0),
    cardStatus: item.cardStatus as DirectoryEntry["cardStatus"],
    joinedAt: String(item.joinedAt),
    updatedAt: String(item.updatedAt),
  };
}

// ── Practitioners / practices (mirror of the Patient Platform's keys) ─────────

export const PRACTICE_SK = "PRACTICE";
export const PRACTITIONER_SK = "PRACTITIONER";

export const practicePk = (practiceId: string): string =>
  `PRACTICE#${practiceId}`;
export const practitionerPk = (practitionerId: string): string =>
  `PRACTITIONER#${practitionerId}`;

export function itemToPractice(item: Record<string, unknown>): Practice {
  return {
    practiceId: String(item.practiceId),
    name: String(item.name),
    email: String(item.email),
    phone: str(item.phone),
    address: str(item.address),
    status: item.status as Practice["status"],
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
  };
}

export function itemToPractitioner(item: Record<string, unknown>): Practitioner {
  return {
    practitionerId: String(item.practitionerId),
    userId: String(item.userId),
    practiceId: String(item.practiceId),
    fullName: String(item.fullName),
    email: String(item.email),
    registrationNumber: str(item.registrationNumber),
    status: item.status as Practitioner["status"],
    statusNotes: str(item.statusNotes),
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
  };
}

export const DIRECTORY_PRACTITIONER_PREFIX_SK = "PRACTITIONER#";
export const directoryPractitionerSk = (practitionerId: string): string =>
  `${DIRECTORY_PRACTITIONER_PREFIX_SK}${practitionerId}`;

/** DynamoDB item for a Practitioner Directory entry. */
export function practitionerDirectoryItem(
  entry: PractitionerDirectoryEntry,
): Record<string, unknown> {
  return {
    PK: DIRECTORY_PK,
    SK: directoryPractitionerSk(entry.practitionerId),
    type: "PRACTITIONER_DIRECTORY",
    ...entry,
  };
}

/** Reconstruct a PractitionerDirectoryEntry from a stored item. */
export function itemToPractitionerDirectoryEntry(
  item: Record<string, unknown>,
): PractitionerDirectoryEntry {
  return {
    practitionerId: String(item.practitionerId),
    fullName: String(item.fullName),
    email: String(item.email),
    practiceId: String(item.practiceId),
    practiceName: str(item.practiceName),
    status: item.status as PractitionerDirectoryEntry["status"],
    registeredAt: String(item.registeredAt),
    updatedAt: String(item.updatedAt),
  };
}

export const PATIENT_BY_PRACTITIONER_PREFIX = "PATIENT#"; // SK prefix in PRACTITIONER# partition
export const PRACTITIONER_BY_PROFILE_PREFIX = "PRACTITIONER#"; // SK prefix in PROFILE# partition

export const patientSkByPractitioner = (profileId: string): string =>
  `${PATIENT_BY_PRACTITIONER_PREFIX}${profileId}`;
export const practitionerSkByProfile = (practitionerId: string): string =>
  `${PRACTITIONER_BY_PROFILE_PREFIX}${practitionerId}`;

/**
 * The two grant items (by-practitioner + by-profile) for one access grant —
 * byte-compatible with the Patient Platform's builder (used only to migrate
 * grants when a login is linked; grants themselves stay patient-owned).
 */
export function practitionerAccessItems(
  access: PractitionerAccess,
): [Record<string, unknown>, Record<string, unknown>] {
  const body = { type: "PRACTITIONER_ACCESS", ...access };
  return [
    {
      PK: practitionerPk(access.practitionerId),
      SK: patientSkByPractitioner(access.profileId),
      ...body,
    },
    {
      PK: profilePk(access.profileId),
      SK: practitionerSkByProfile(access.practitionerId),
      ...body,
    },
  ];
}

export function itemToPractitionerAccess(
  item: Record<string, unknown>,
): PractitionerAccess {
  return {
    accessId: String(item.accessId),
    practitionerId: String(item.practitionerId),
    profileId: String(item.profileId),
    grantedAt: String(item.grantedAt),
    revokedAt: str(item.revokedAt),
    status: item.status as PractitionerAccess["status"],
  };
}

// ── Internal notes (Ops-owned, PROFILE# partition) ─────────────────────────────

export const OPSNOTE_PREFIX_SK = "OPSNOTE#";
/** SK sorts by createdAt (ISO) so a descending Query reads newest-first. */
export const opsNoteSk = (createdAt: string, noteId: string): string =>
  `${OPSNOTE_PREFIX_SK}${createdAt}#${noteId}`;

export function opsNoteItem(note: OpsNote): Record<string, unknown> {
  return {
    PK: profilePk(note.subjectId),
    SK: opsNoteSk(note.createdAt, note.noteId),
    type: "OPS_NOTE",
    ...note,
  };
}

export function itemToOpsNote(item: Record<string, unknown>): OpsNote {
  return {
    noteId: String(item.noteId),
    subjectId: String(item.subjectId),
    authorId: String(item.authorId),
    authorName: String(item.authorName),
    body: String(item.body),
    createdAt: String(item.createdAt),
  };
}
