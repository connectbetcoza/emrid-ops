import "server-only";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { EmergencyProfile } from "@/lib/data/entities";
import type { EmergencyProfileRepository } from "@/lib/data/types";
import { defaultDeps, type DynamoDeps } from "@/lib/data/aws/client";
import {
  EMERGENCY_SK,
  itemToEmergencyProfile,
  profilePk,
} from "@/lib/data/aws/keys";

/**
 * DynamoDB EmergencyProfileRepository — reads the single `PROFILE#<id>/EMERGENCY`
 * item via a base-table `GetItem` (no scan, no GSI). Visibility filtering is
 * NEVER applied here; the public responder view is derived in application code
 * after the read. Ops is read-only on emergency data (the Patient Platform owns
 * the write). Injectable deps let tests assert the command + key without AWS.
 */
export class DynamoEmergencyProfileRepository
  implements EmergencyProfileRepository
{
  constructor(private readonly injected?: DynamoDeps) {}
  private deps(): DynamoDeps {
    return this.injected ?? defaultDeps();
  }

  async getEmergencyProfile(
    profileId: string,
  ): Promise<EmergencyProfile | null> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new GetCommand({
        TableName: table,
        Key: { PK: profilePk(profileId), SK: EMERGENCY_SK },
      }),
    );
    return result.Item ? itemToEmergencyProfile(result.Item) : null;
  }
}
