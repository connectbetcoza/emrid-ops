import "server-only";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type {
  FamilyInviteSummary,
  Membership,
  ProfileAccessEntry,
} from "@/lib/data/entities";
import type { FamilyRepository } from "@/lib/data/types";
import { defaultDeps, type DynamoDeps } from "@/lib/data/aws/client";
import {
  ACCESS_BY_PROFILE_PREFIX,
  FAMILY_INVITE_PREFIX_SK,
  MEMBERSHIP_SK,
  itemToFamilyInviteSummary,
  itemToMembership,
  itemToProfileAccess,
  profilePk,
  userPk,
} from "@/lib/data/aws/keys";

/**
 * DynamoDB FamilyRepository — READ-ONLY projections of Patient-owned state.
 * Every read is a bounded partition Query or point GetItem: no scan, no GSI,
 * no new IAM (Query/GetItem on the table are already granted). Ops NEVER
 * writes family access, invites, or membership — the Patient Platform owns
 * every mutation (consent boundary).
 */
export class DynamoFamilyRepository implements FamilyRepository {
  constructor(private readonly injected?: DynamoDeps) {}
  private deps(): DynamoDeps {
    return this.injected ?? defaultDeps();
  }

  async listFamilyAccess(profileId: string): Promise<ProfileAccessEntry[]> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": profilePk(profileId),
          ":sk": ACCESS_BY_PROFILE_PREFIX,
        },
      }),
    );
    return (result.Items ?? []).map(itemToProfileAccess);
  }

  async listFamilyInvites(profileId: string): Promise<FamilyInviteSummary[]> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": profilePk(profileId),
          ":sk": FAMILY_INVITE_PREFIX_SK,
        },
      }),
    );
    // itemToFamilyInviteSummary drops the stored bearer token — the raw item
    // never leaves this function.
    return (result.Items ?? []).map(itemToFamilyInviteSummary);
  }

  async getMembershipForProfile(profileId: string): Promise<Membership | null> {
    const access = await this.listFamilyAccess(profileId);
    const owner = access.find((a) => a.role === "OWNER");
    if (!owner) return null;

    const { doc, table } = this.deps();
    const result = await doc.send(
      new GetCommand({
        TableName: table,
        Key: { PK: userPk(owner.userId), SK: MEMBERSHIP_SK },
      }),
    );
    return result.Item ? itemToMembership(result.Item) : null;
  }
}
