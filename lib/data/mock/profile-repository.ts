import type {
  IdentityRecord,
  IdentityVerificationStatus,
  Profile,
} from "@/lib/data/entities";
import type {
  IdentityDecisionInput,
  ProfileRepository,
} from "@/lib/data/types";
import { mockStore } from "@/lib/data/mock/store";
import { nowIso } from "@/lib/data/ids";

/** In-memory ProfileRepository over the shared mock store. */
export class MockProfileRepository implements ProfileRepository {
  async getProfile(profileId: string): Promise<Profile | null> {
    const p = mockStore.profiles.get(profileId);
    if (!p || p.status === "DELETED") return null;
    return { ...p };
  }

  async listByIdentityStatus(
    status: IdentityVerificationStatus,
  ): Promise<Profile[]> {
    return [...mockStore.profiles.values()]
      .filter((p) => p.status !== "DELETED" && p.identityVerificationStatus === status)
      .map((p) => ({ ...p }));
  }

  async getIdentity(profileId: string): Promise<IdentityRecord | null> {
    const i = mockStore.identities.get(profileId);
    return i ? { ...i } : null;
  }

  async setIdentityDecision(
    profileId: string,
    input: IdentityDecisionInput,
  ): Promise<Profile> {
    const current = mockStore.profiles.get(profileId);
    if (!current) throw new Error(`Profile not found: ${profileId}`);
    const ts = nowIso();
    const updated: Profile = {
      ...current,
      identityVerificationStatus: input.decision,
      verificationLevel:
        input.decision === "VERIFIED" ? "IDENTITY_VERIFIED" : current.verificationLevel,
      identityVerifiedAt: input.decision === "VERIFIED" ? ts : current.identityVerifiedAt,
      identityVerificationNotes: input.notes ?? current.identityVerificationNotes,
      updatedAt: ts,
    };
    mockStore.profiles.set(profileId, updated);
    return { ...updated };
  }
}
