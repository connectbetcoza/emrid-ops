import type { EmergencyProfile } from "@/lib/data/entities";
import type { EmergencyProfileRepository } from "@/lib/data/types";
import { mockStore } from "@/lib/data/mock/store";

/** In-memory EmergencyProfileRepository over the shared mock store (read-only). */
export class MockEmergencyProfileRepository
  implements EmergencyProfileRepository
{
  async getEmergencyProfile(
    profileId: string,
  ): Promise<EmergencyProfile | null> {
    const e = mockStore.emergencyProfiles.get(profileId);
    return e ? { ...e } : null;
  }
}
