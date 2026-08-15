import type {
  FamilyInviteSummary,
  Membership,
  ProfileAccessEntry,
} from "@/lib/data/entities";
import type { FamilyRepository } from "@/lib/data/types";
import { mockStore } from "@/lib/data/mock/store";

/**
 * In-memory FamilyRepository over the shared mock store. Read-only, like the
 * Dynamo adapter — nothing in Ops ever writes family/membership state.
 */
export class MockFamilyRepository implements FamilyRepository {
  async listFamilyAccess(profileId: string): Promise<ProfileAccessEntry[]> {
    return (mockStore.profileAccess.get(profileId) ?? []).map((a) => ({ ...a }));
  }

  async listFamilyInvites(profileId: string): Promise<FamilyInviteSummary[]> {
    return (mockStore.familyInvites.get(profileId) ?? []).map((i) => ({ ...i }));
  }

  async getMembershipForProfile(profileId: string): Promise<Membership | null> {
    const owner = (mockStore.profileAccess.get(profileId) ?? []).find(
      (a) => a.role === "OWNER",
    );
    if (!owner) return null;
    const membership = mockStore.memberships.get(owner.userId);
    return membership ? { ...membership } : null;
  }
}
