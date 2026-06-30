import "server-only";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { AuditEvent, AuditTargetType, NewAuditEvent } from "@/lib/data/entities";
import type { AuditRepository } from "@/lib/data/types";
import { defaultDeps, type DynamoDeps } from "@/lib/data/aws/client";
import {
  GSI2_INDEX,
  auditItem,
  auditPk,
  auditProfileGsiPk,
  itemToAudit,
} from "@/lib/data/aws/keys";
import { nowIso, newAuditId } from "@/lib/data/ids";

/**
 * DynamoDB-backed, APPEND-ONLY audit log on the shared table. Writes use a
 * unique SK (timestamp + uuid) and `attribute_not_exists(PK)` so records can
 * never be mutated. Profile-related events are also indexed on GSI2 for the
 * profile activity timeline (newest first). Mirrors the Patient Platform.
 */
export class DynamoAuditRepository implements AuditRepository {
  constructor(private readonly injected?: DynamoDeps) {}
  private deps(): DynamoDeps {
    return this.injected ?? defaultDeps();
  }

  async record(event: NewAuditEvent): Promise<AuditEvent> {
    const { doc, table } = this.deps();
    const recorded: AuditEvent = {
      ...event,
      eventId: newAuditId(),
      timestamp: nowIso(),
    };
    await doc.send(
      new PutCommand({
        TableName: table,
        Item: auditItem(recorded),
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    return recorded;
  }

  async listForProfile(profileId: string): Promise<AuditEvent[]> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new QueryCommand({
        TableName: table,
        IndexName: GSI2_INDEX,
        KeyConditionExpression: "GSI2PK = :pk",
        ExpressionAttributeValues: { ":pk": auditProfileGsiPk(profileId) },
        ScanIndexForward: false,
      }),
    );
    return (result.Items ?? []).map(itemToAudit);
  }

  async listForTarget(
    targetType: AuditTargetType,
    targetId: string,
  ): Promise<AuditEvent[]> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": auditPk(targetType, targetId),
          ":sk": "TS#",
        },
        ScanIndexForward: false,
      }),
    );
    return (result.Items ?? []).map(itemToAudit);
  }
}
