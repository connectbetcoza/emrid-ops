import "server-only";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type {
  IdentityRecord,
  IdentityVerificationStatus,
  Profile,
} from "@/lib/data/entities";
import type {
  IdentityDecisionInput,
  UpdateContactDetailsInput,
  ProfileRepository,
} from "@/lib/data/types";
import { defaultDeps, type DynamoDeps } from "@/lib/data/aws/client";
import {
  IDENTITY_SK,
  PROFILE_SK,
  itemToIdentity,
  itemToProfile,
  profilePk,
} from "@/lib/data/aws/keys";
import { nowIso } from "@/lib/data/ids";

/**
 * DynamoDB ProfileRepository over the SHARED table. Reads the Patient-Platform-
 * owned Profile + isolated IDENTITY items and writes only the identity-decision
 * fields (the Patient Platform reads them back). Mirrors the Patient Platform's
 * repo patterns; injectable `DynamoDeps` for tests.
 */
export class DynamoProfileRepository implements ProfileRepository {
  constructor(private readonly injected?: DynamoDeps) {}
  private deps(): DynamoDeps {
    return this.injected ?? defaultDeps();
  }

  async getProfile(profileId: string): Promise<Profile | null> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new GetCommand({
        TableName: table,
        Key: { PK: profilePk(profileId), SK: PROFILE_SK },
      }),
    );
    if (!result.Item) return null;
    const profile = itemToProfile(result.Item);
    return profile.status === "DELETED" ? null : profile;
  }

  async updateContactDetails(
    profileId: string,
    input: UpdateContactDetailsInput,
  ): Promise<Profile> {
    const { doc, table } = this.deps();
    // WHITELIST: only the two contact fields can ever enter the expression —
    // extra keys on the input object are ignored by construction (CMS Stage 1;
    // pinned by test). Never creates a profile (attribute_exists).
    const sets: string[] = [];
    const values: Record<string, unknown> = {};
    if (input.contactEmail !== undefined) {
      sets.push("contactEmail = :ce");
      values[":ce"] = input.contactEmail;
    }
    if (input.contactMobile !== undefined) {
      sets.push("contactMobile = :cm");
      values[":cm"] = input.contactMobile;
    }
    if (sets.length === 0) {
      throw new Error("No contact fields provided.");
    }
    sets.push("updatedAt = :ts");
    values[":ts"] = nowIso();
    const result = await doc.send(
      new UpdateCommand({
        TableName: table,
        Key: { PK: profilePk(profileId), SK: PROFILE_SK },
        ConditionExpression: "attribute_exists(PK)",
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      }),
    );
    return itemToProfile(result.Attributes ?? {});
  }

  async getIdentity(profileId: string): Promise<IdentityRecord | null> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new GetCommand({
        TableName: table,
        Key: { PK: profilePk(profileId), SK: IDENTITY_SK },
      }),
    );
    return result.Item ? itemToIdentity(result.Item) : null;
  }

  /**
   * ⚠️ Access-pattern gap. The shared table has NO index on identity status, so
   * "all profiles at status X" cannot be served without either a GSI or an
   * Ops-maintained work index. Per the "no new GSI without escalating" law this
   * is an explicit decision (see the Phase 1 handoff). Fails closed rather than
   * silently scanning the table.
   */
  async listByIdentityStatus(
    _status: IdentityVerificationStatus,
  ): Promise<Profile[]> {
    throw new Error(
      "listByIdentityStatus is not supported on the shared table without an " +
        "access-pattern decision (GSI on identity status, or an Ops work index). " +
        "See OPERATOR_HANDOFF.md — resolve before enabling real data for the Identity queue.",
    );
  }

  async setIdentityDecision(
    profileId: string,
    input: IdentityDecisionInput,
  ): Promise<Profile> {
    const { doc, table } = this.deps();
    const ts = nowIso();

    const sets = [
      "#status = :status",
      "#updatedAt = :updatedAt",
      "#notes = :notes",
    ];
    const names: Record<string, string> = {
      "#status": "identityVerificationStatus",
      "#updatedAt": "updatedAt",
      "#notes": "identityVerificationNotes",
    };
    const values: Record<string, unknown> = {
      ":status": input.decision,
      ":updatedAt": ts,
      ":notes": input.notes ?? null,
    };
    if (input.decision === "VERIFIED") {
      sets.push("#level = :level", "#verifiedAt = :verifiedAt");
      names["#level"] = "verificationLevel";
      names["#verifiedAt"] = "identityVerifiedAt";
      values[":level"] = "IDENTITY_VERIFIED";
      values[":verifiedAt"] = ts;
    }

    await doc.send(
      new UpdateCommand({
        TableName: table,
        Key: { PK: profilePk(profileId), SK: PROFILE_SK },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(PK)",
      }),
    );

    const updated = await this.getProfile(profileId);
    if (!updated) throw new Error(`Profile not found: ${profileId}`);
    return updated;
  }
}
