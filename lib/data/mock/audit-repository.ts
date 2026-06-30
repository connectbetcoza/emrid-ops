import type { AuditEvent, AuditTargetType, NewAuditEvent } from "@/lib/data/entities";
import type { AuditRepository } from "@/lib/data/types";
import { mockStore } from "@/lib/data/mock/store";
import { auditEventProfileId } from "@/lib/data/aws/keys";
import { nowIso, newAuditId } from "@/lib/data/ids";

/** In-memory, append-only AuditRepository over the shared mock store. */
export class MockAuditRepository implements AuditRepository {
  async record(event: NewAuditEvent): Promise<AuditEvent> {
    const recorded: AuditEvent = {
      ...event,
      eventId: newAuditId(),
      timestamp: nowIso(),
    };
    mockStore.audit.push(recorded);
    return { ...recorded };
  }

  async listForProfile(profileId: string): Promise<AuditEvent[]> {
    return mockStore.audit
      .filter((e) => auditEventProfileId(e) === profileId)
      .slice()
      .reverse();
  }

  async listForTarget(
    targetType: AuditTargetType,
    targetId: string,
  ): Promise<AuditEvent[]> {
    return mockStore.audit
      .filter((e) => e.targetType === targetType && e.targetId === targetId)
      .slice()
      .reverse();
  }
}
