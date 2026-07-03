import type {
  DirectoryEntry,
  PractitionerDirectoryEntry,
} from "@/lib/data/entities";
import type { DirectoryRepository } from "@/lib/data/types";
import { mockStore } from "@/lib/data/mock/store";
import { buildDirectoryEntry } from "@/lib/customers/directory-core";
import { nowIso } from "@/lib/data/ids";

/**
 * In-memory DirectoryRepository — COMPUTED ON READ from the mock store, so the
 * dev directory is always consistent with mock transitions by construction
 * (there is no separate seeded copy to drift). `upsertEntry` is accepted for
 * interface fidelity (the producer calls it) but the next read recomputes from
 * the store truth anyway.
 */
export class MockDirectoryRepository implements DirectoryRepository {
  private entryFor(profileId: string): DirectoryEntry | null {
    const profile = mockStore.profiles.get(profileId);
    if (!profile) return null;
    return buildDirectoryEntry({
      profile,
      emergency: mockStore.emergencyProfiles.get(profileId) ?? null,
      devices: [...mockStore.devices.values()].filter(
        (d) => d.profileId === profileId,
      ),
      workRecords: [...mockStore.workItems.values()].filter(
        (w) => w.customerId === profileId,
      ),
      auditEvents: mockStore.audit
        .filter((e) =>
          e.targetType === "PROFILE"
            ? e.targetId === profileId
            : e.metadata?.profileId === profileId,
        )
        .slice()
        .reverse(),
      now: nowIso(),
    });
  }

  async listCustomers(): Promise<DirectoryEntry[]> {
    return [...mockStore.profiles.keys()]
      .map((id) => this.entryFor(id))
      .filter((e): e is DirectoryEntry => e !== null);
  }

  async getEntry(profileId: string): Promise<DirectoryEntry | null> {
    return this.entryFor(profileId);
  }

  async upsertEntry(entry: DirectoryEntry): Promise<DirectoryEntry> {
    return { ...entry };
  }

  async listPractitioners(): Promise<PractitionerDirectoryEntry[]> {
    return [...mockStore.practitioners.values()].map((prac) => ({
      practitionerId: prac.practitionerId,
      fullName: prac.fullName,
      email: prac.email,
      practiceId: prac.practiceId,
      practiceName: mockStore.practices.get(prac.practiceId)?.name,
      status: prac.status,
      registeredAt: prac.createdAt,
      updatedAt: prac.updatedAt,
    }));
  }

  async upsertPractitionerEntry(
    entry: PractitionerDirectoryEntry,
  ): Promise<PractitionerDirectoryEntry> {
    return { ...entry };
  }

  // Computed-on-read: a re-keyed practitioner already vanishes from the next
  // read, so removal is interface fidelity only (the producer calls it).
  async removePractitionerEntry(practitionerId: string): Promise<void> {
    void practitionerId;
  }
}
