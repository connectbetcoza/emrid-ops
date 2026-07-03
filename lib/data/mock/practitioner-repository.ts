import type { Practice, Practitioner, PractitionerAccess } from "@/lib/data/entities";
import type {
  CreatePracticeInput,
  CreatePractitionerInput,
  UpdatePracticeInput,
  UpdatePractitionerAccountInput,
} from "@/lib/data/types";
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

  async createPractice(input: CreatePracticeInput): Promise<Practice> {
    const existing = mockStore.practices.get(input.practiceId);
    if (existing) return { ...existing }; // idempotent on id
    const ts = nowIso();
    const practice: Practice = { ...input, status: "ACTIVE", createdAt: ts, updatedAt: ts };
    mockStore.practices.set(practice.practiceId, practice);
    return { ...practice };
  }

  async createPractitioner(input: CreatePractitionerInput): Promise<Practitioner> {
    const existing = mockStore.practitioners.get(input.practitionerId);
    if (existing) return { ...existing }; // idempotent on id
    const ts = nowIso();
    const practitioner: Practitioner = {
      practitionerId: input.practitionerId,
      userId: input.practitionerId,
      practiceId: input.practiceId,
      fullName: input.fullName,
      email: input.email,
      registrationNumber: input.registrationNumber,
      status: input.status,
      createdAt: ts,
      updatedAt: ts,
    };
    mockStore.practitioners.set(practitioner.practitionerId, practitioner);
    return { ...practitioner };
  }

  async updatePractitionerAccount(
    practitionerId: string,
    input: UpdatePractitionerAccountInput,
  ): Promise<Practitioner> {
    const existing = mockStore.practitioners.get(practitionerId);
    if (!existing) throw new Error(`Practitioner not found: ${practitionerId}`);
    const updated: Practitioner = {
      ...existing,
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.registrationNumber !== undefined
        ? { registrationNumber: input.registrationNumber }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: nowIso(),
    };
    mockStore.practitioners.set(practitionerId, updated);
    return { ...updated };
  }

  async updatePractice(
    practiceId: string,
    input: UpdatePracticeInput,
  ): Promise<Practice> {
    const existing = mockStore.practices.get(practiceId);
    if (!existing) throw new Error(`Practice not found: ${practiceId}`);
    const updated: Practice = {
      ...existing,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      updatedAt: nowIso(),
    };
    mockStore.practices.set(practiceId, updated);
    return { ...updated };
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
