import type { Practice, Practitioner, PractitionerAccess } from "@/lib/data/entities";
import type {
  PractitionerDecisionInput,
  PractitionerRepository,
} from "@/lib/data/types";
import { mockStore } from "@/lib/data/mock/store";
import { nowIso } from "@/lib/data/ids";

/** In-memory PractitionerRepository over the shared mock store. */
export class MockPractitionerRepository implements PractitionerRepository {
  async getPractitioner(practitionerId: string): Promise<Practitioner | null> {
    const p = mockStore.practitioners.get(practitionerId);
    return p ? { ...p } : null;
  }

  async getPractice(practiceId: string): Promise<Practice | null> {
    const p = mockStore.practices.get(practiceId);
    return p ? { ...p } : null;
  }

  async listPatientAccess(
    practitionerId: string,
  ): Promise<PractitionerAccess[]> {
    return (mockStore.practitionerAccess.get(practitionerId) ?? []).map((a) => ({
      ...a,
    }));
  }

  async setApprovalDecision(
    practitionerId: string,
    input: PractitionerDecisionInput,
  ): Promise<Practitioner> {
    const existing = mockStore.practitioners.get(practitionerId);
    if (!existing) throw new Error(`Practitioner not found: ${practitionerId}`);
    const updated: Practitioner = {
      ...existing,
      status: input.decision,
      statusNotes: input.notes,
      updatedAt: nowIso(),
    };
    mockStore.practitioners.set(practitionerId, updated);
    return { ...updated };
  }
}
