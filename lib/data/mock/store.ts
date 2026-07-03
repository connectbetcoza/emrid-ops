import type {
  AuditEvent,
  Practice,
  Practitioner,
  PractitionerAccess,
  Device,
  DeviceStatus,
  DocumentMetadata,
  EmergencyProfile,
  IdentityRecord,
  IdentityVerificationStatus,
  Profile,
  ProtectedLivesAggregate,
  OpsNote,
} from "@/lib/data/entities";
import type { WorkItemRecord } from "@/lib/data/work-record";
import type { WorkItem } from "@/lib/work/types";
import type { Customer } from "@/lib/customers/types";
import { generateAllWork } from "@/lib/work/generate";
import { workItemToRecord } from "@/lib/work/record";
import { protectionStatus } from "@/lib/customers/readiness";
import { MOCK_CUSTOMERS } from "@/lib/customers/mock";

/**
 * Shared in-memory store for the mock repositories. Seeded so the WHOLE mock
 * backend shares ONE id space: profiles are derived from `MOCK_CUSTOMERS`
 * (profileId === customerId === the work items' customerId), so the wired
 * "approve identity" path finds the profile. `resetStore()` re-seeds for
 * deterministic tests.
 */
export type MockStore = {
  profiles: Map<string, Profile>;
  identities: Map<string, IdentityRecord>;
  documents: Map<string, DocumentMetadata[]>;
  audit: AuditEvent[];
  workItems: Map<string, WorkItemRecord>;
  /** Devices keyed by deviceId. */
  devices: Map<string, Device>;
  /** Emergency profiles keyed by profileId (Patient-Platform-owned; Ops reads). */
  emergencyProfiles: Map<string, EmergencyProfile>;
  /** The single Protected-Lives aggregate row (Ops-owned). */
  protectedLives: ProtectedLivesAggregate;
  practitioners: Map<string, Practitioner>;
  practices: Map<string, Practice>;
  /** Patient grants keyed by practitionerId (read-only for Ops). */
  practitionerAccess: Map<string, PractitionerAccess[]>;
  /** Internal staff notes keyed by subjectId (Ops-owned; newest first). */
  notes: Map<string, OpsNote[]>;
};

/** A pending practitioner application (mirrors the Patient portal's write). */
const SEED_PRACTICE: Practice = {
  practiceId: "prc-9001",
  name: "Rosebank Family Practice",
  email: "reception@rosebankfp.co.za",
  phone: "+27 11 555 0190",
  address: "12 Baker St, Rosebank, Johannesburg",
  status: "ACTIVE",
  createdAt: "2026-06-20T08:00:00.000Z",
  updatedAt: "2026-06-20T08:00:00.000Z",
};

const SEED_PRACTITIONER: Practitioner = {
  practitionerId: "prac-9001",
  userId: "prac-9001",
  practiceId: "prc-9001",
  fullName: "Dr. Johan Botha",
  email: "johan.botha@rosebankfp.co.za",
  registrationNumber: "MP-0123456",
  status: "PENDING",
  createdAt: "2026-06-26T09:00:00.000Z",
  updatedAt: "2026-06-26T09:00:00.000Z",
};

const IDENTITY_STATUS: Record<
  Customer["identityStatus"],
  IdentityVerificationStatus
> = { UNVERIFIED: "UNVERIFIED", PENDING: "PENDING", VERIFIED: "VERIFIED" };

/** Map an Ops Customer (UI view) to a shared-table Profile fixture. */
function customerToProfile(c: Customer): Profile {
  const [firstName, ...rest] = c.fullName.split(" ");
  const submitted = c.identityStatus !== "UNVERIFIED";
  return {
    profileId: c.id,
    emrid: `EMR-${c.id.replace("CUS-", "")}`,
    firstName: firstName ?? c.fullName,
    lastName: rest.join(" ") || "—",
    // Profile-completeness is now derived from the Profile (see lib/customers/
    // facets.ts: isProfileComplete checks the basics). Represent an incomplete
    // profile by leaving a basic (date of birth) unset, so the seed reproduces
    // the fixture's `profileComplete` spread through the repository path.
    dateOfBirth: c.profileComplete ? "1990-01-01" : "",
    status: "ACTIVE",
    verificationLevel:
      c.identityStatus === "VERIFIED" ? "IDENTITY_VERIFIED" : "UNVERIFIED",
    idType: submitted ? "SOUTH_AFRICAN_ID" : undefined,
    idNumberMasked: submitted ? "9001•••••••00" : undefined,
    identityVerificationStatus: IDENTITY_STATUS[c.identityStatus],
    identitySubmittedAt: submitted ? "2026-06-28T08:00:00.000Z" : undefined,
    identityVerifiedAt:
      c.identityStatus === "VERIFIED" ? "2026-05-01T09:00:00.000Z" : undefined,
    createdAt: c.joinedAt,
    updatedAt: c.joinedAt,
  };
}

function seedWorkItems(): WorkItemRecord[] {
  return generateAllWork(MOCK_CUSTOMERS)
    .filter((w): w is WorkItem & { customerId: string } => Boolean(w.customerId))
    .map(workItemToRecord);
}

/** Seed a device for each customer who already has a card (fixture cardStatus). */
function seedDevices(): Device[] {
  const map: Partial<Record<Customer["cardStatus"], DeviceStatus>> = {
    ACTIVE: "ACTIVE",
    PENDING: "PENDING",
    SUSPENDED: "SUSPENDED",
  };
  return MOCK_CUSTOMERS.flatMap((c) => {
    const status = map[c.cardStatus];
    if (!status) return [];
    return [
      {
        deviceId: `dev-${c.id}`,
        profileId: c.id,
        status,
        token: `tok-${c.id}`,
        // Patient-issued activation code: present while PENDING, consumed on
        // activation (mirrors the Patient Platform's device lifecycle).
        activationCode: status === "PENDING" ? `ACT-${c.id.slice(-4)}` : undefined,
        issuedAt: c.joinedAt,
        activatedAt: status === "ACTIVE" ? c.joinedAt : undefined,
        updatedAt: c.joinedAt,
      },
    ];
  });
}

/**
 * A seeded fulfilment tap-test: the Patient Platform's public `/e/<token>` route
 * records DEVICE_TAP_TESTED when a PENDING card is tapped, so the Ops fulfilment
 * pack can show "last tap". Seeded for one PENDING-card customer to keep the
 * surface demonstrable in mock.
 */
function seedTapTestAudit(): AuditEvent[] {
  return [
    {
      eventId: "evt-tap-CUS-2042",
      eventType: "DEVICE_TAP_TESTED",
      actorType: "PUBLIC_RESPONDER",
      targetType: "DEVICE",
      targetId: "dev-CUS-2042",
      timestamp: "2026-06-29T14:05:00.000Z",
      metadata: { profileId: "CUS-2042" },
    },
  ];
}

/**
 * Map a fixture Customer to the emergency profile the Patient Platform would
 * have written, so the repository path reproduces the fixture's emergency-info
 * and contact-count spread. A customer with neither medical info nor contacts
 * has no emergency item at all (read returns null). Medical info and contacts
 * are independent — they back two distinct readiness factors.
 */
function customerToEmergency(c: Customer): EmergencyProfile | null {
  if (!c.emergencyInfoComplete && c.emergencyContactsCount === 0) return null;
  const e: EmergencyProfile = { profileId: c.id, updatedAt: c.joinedAt };
  if (c.emergencyInfoComplete) {
    e.bloodType = { value: "O+", visibility: "PUBLIC_EMERGENCY" };
    e.allergies = { value: ["Penicillin"], visibility: "PUBLIC_EMERGENCY" };
  }
  if (c.emergencyContactsCount > 0) {
    e.emergencyContacts = {
      value: Array.from({ length: c.emergencyContactsCount }, (_, i) => ({
        name: `Contact ${i + 1}`,
        relationship: "Family",
        phone: `+27 80 555 010${i}`,
      })),
      visibility: "PUBLIC_EMERGENCY",
    };
  }
  return e;
}

/**
 * Seed the Protected-Lives aggregate from the actual fixture customer states —
 * the mock equivalent of the operator's production backfill. From here it is
 * maintained by `executeTransition` on Protected-boundary crossings only.
 */
function seedProtectedLives(): ProtectedLivesAggregate {
  let protectedCount = 0;
  let inProgressCount = 0;
  for (const c of MOCK_CUSTOMERS) {
    const status = protectionStatus(c);
    if (status === "PROTECTED") protectedCount += 1;
    else if (status === "IN_PROGRESS") inProgressCount += 1;
  }
  return {
    protectedCount,
    inProgressCount,
    lastUpdatedAt: "2026-06-29T00:00:00.000Z",
    version: 0,
  };
}

function freshStore(): MockStore {
  const store: MockStore = {
    profiles: new Map(),
    identities: new Map(),
    documents: new Map(),
    audit: [...seedTapTestAudit()],
    workItems: new Map(),
    devices: new Map(),
    emergencyProfiles: new Map(),
    protectedLives: seedProtectedLives(),
    practitioners: new Map([[SEED_PRACTITIONER.practitionerId, { ...SEED_PRACTITIONER }]]),
    practices: new Map([[SEED_PRACTICE.practiceId, { ...SEED_PRACTICE }]]),
    practitionerAccess: new Map(),
    notes: new Map(),
  };

  // The pending application's APPROVE_PRACTITIONER work item (the producer
  // would create this from the registration event; `customerId` carries the
  // SUBJECT id — here the practitioner — so the workspace reads it the same way).
  store.workItems.set("prac-9001-practitioner", {
    workItemId: "prac-9001-practitioner",
    customerId: "prac-9001",
    workType: "APPROVE_PRACTITIONER",
    workDomain: "PRACTITIONER",
    status: "OPEN",
    priority: "MEDIUM",
    step: 0,
    assignment: { assigneeName: null },
    source: "SYSTEM",
    title: "Activate practitioner",
    subjectName: "Dr. Johan Botha",
    nextAction: "Verify registration and activate",
    dueAt: "2026-06-29T09:00:00.000Z",
    createdAt: "2026-06-26T09:00:00.000Z",
    updatedAt: "2026-06-26T09:00:00.000Z",
  });

  for (const d of seedDevices()) store.devices.set(d.deviceId, d);

  for (const c of MOCK_CUSTOMERS) {
    store.profiles.set(c.id, customerToProfile(c));
    const emergency = customerToEmergency(c);
    if (emergency) store.emergencyProfiles.set(c.id, emergency);
    // The isolated raw-id item exists once an identity has been submitted.
    if (c.identityStatus !== "UNVERIFIED") {
      store.identities.set(c.id, {
        profileId: c.id,
        idNumber: "9001015800000",
        idType: "SOUTH_AFRICAN_ID",
        submittedAt: "2026-06-28T08:00:00.000Z",
      });
      store.documents.set(c.id, [
        {
          documentId: `doc-${c.id}-id`,
          profileId: c.id,
          category: "ID_DOCUMENT",
          fileName: "sa-id.pdf",
          contentType: "application/pdf",
          status: "STORED",
          storageKey: `profiles/${c.id}/documents/uuid-sa-id.pdf`,
          uploadedAt: "2026-06-28T08:00:00.000Z",
          createdAt: "2026-06-28T08:00:00.000Z",
          updatedAt: "2026-06-28T08:00:00.000Z",
        },
      ]);
    }
  }

  for (const w of seedWorkItems()) store.workItems.set(w.workItemId, w);

  return store;
}

/**
 * Backed by `globalThis` so the in-memory store survives Next's per-request
 * module re-evaluation (and is shared across the RSC + Server Action module
 * graphs) within a process — so a mock transition persists across a refresh.
 * (Still resets on a cold serverless instance; real durability is DynamoDB.)
 */
const globalForStore = globalThis as unknown as {
  __emridOpsMockStore?: MockStore;
};
export const mockStore: MockStore =
  globalForStore.__emridOpsMockStore ??
  (globalForStore.__emridOpsMockStore = freshStore());

/** Re-seed the store — used by tests for determinism. */
export function resetStore(): void {
  const fresh = freshStore();
  mockStore.profiles = fresh.profiles;
  mockStore.identities = fresh.identities;
  mockStore.documents = fresh.documents;
  mockStore.audit = fresh.audit;
  mockStore.workItems = fresh.workItems;
  mockStore.devices = fresh.devices;
  mockStore.emergencyProfiles = fresh.emergencyProfiles;
  mockStore.protectedLives = fresh.protectedLives;
  mockStore.practitioners = fresh.practitioners;
  mockStore.practices = fresh.practices;
  mockStore.practitionerAccess = fresh.practitionerAccess;
  mockStore.notes = fresh.notes;
}
