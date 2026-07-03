import "server-only";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Practice, Practitioner, PractitionerAccess } from "@/lib/data/entities";
import type {
  CreatePracticeInput,
  CreatePractitionerInput,
  PractitionerDecisionInput,
  PractitionerRepository,
  UpdatePracticeInput,
  UpdatePractitionerAccountInput,
} from "@/lib/data/types";
import { defaultDeps, type DynamoDeps } from "@/lib/data/aws/client";
import {
  PATIENT_BY_PRACTITIONER_PREFIX,
  PRACTICE_SK,
  PRACTITIONER_SK,
  itemToPractice,
  itemToPractitioner,
  itemToPractitionerAccess,
  patientSkByPractitioner,
  practicePk,
  practitionerAccessItems,
  practitionerPk,
  practitionerSkByProfile,
  profilePk,
} from "@/lib/data/aws/keys";
import { nowIso } from "@/lib/data/ids";

/**
 * DynamoDB PractitionerRepository — point reads of the practitioner/practice
 * items (no scan) plus the ONE Ops write: the approval decision. The decision
 * is a conditional UpdateItem (`attribute_exists`) so it can never create a
 * phantom practitioner — the same discipline as the identity decision.
 */
export class DynamoPractitionerRepository implements PractitionerRepository {
  constructor(private readonly injected?: DynamoDeps) {}
  private deps(): DynamoDeps {
    return this.injected ?? defaultDeps();
  }

  async getPractitioner(practitionerId: string): Promise<Practitioner | null> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new GetCommand({
        TableName: table,
        Key: { PK: practitionerPk(practitionerId), SK: PRACTITIONER_SK },
      }),
    );
    return result.Item ? itemToPractitioner(result.Item) : null;
  }

  async getPractice(practiceId: string): Promise<Practice | null> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new GetCommand({
        TableName: table,
        Key: { PK: practicePk(practiceId), SK: PRACTICE_SK },
      }),
    );
    return result.Item ? itemToPractice(result.Item) : null;
  }

  async listPatientAccess(
    practitionerId: string,
  ): Promise<PractitionerAccess[]> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": practitionerPk(practitionerId),
          ":sk": PATIENT_BY_PRACTITIONER_PREFIX,
        },
      }),
    );
    return (result.Items ?? []).map(itemToPractitionerAccess);
  }

  async createPractice(input: CreatePracticeInput): Promise<Practice> {
    const { doc, table } = this.deps();
    const ts = nowIso();
    const practice: Practice = { ...input, status: "ACTIVE", createdAt: ts, updatedAt: ts };
    try {
      await doc.send(
        new PutCommand({
          TableName: table,
          Item: {
            PK: practicePk(practice.practiceId),
            SK: PRACTICE_SK,
            type: "PRACTICE",
            ...practice,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
        const existing = await this.getPractice(practice.practiceId);
        if (existing) return existing; // idempotent on id
      }
      throw error;
    }
    return practice;
  }

  async createPractitioner(input: CreatePractitionerInput): Promise<Practitioner> {
    const { doc, table } = this.deps();
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
    try {
      await doc.send(
        new PutCommand({
          TableName: table,
          Item: {
            PK: practitionerPk(practitioner.practitionerId),
            SK: PRACTITIONER_SK,
            type: "PRACTITIONER",
            ...practitioner,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
        const existing = await this.getPractitioner(practitioner.practitionerId);
        if (existing) return existing; // idempotent on id
      }
      throw error;
    }
    return practitioner;
  }

  async updatePractitionerAccount(
    practitionerId: string,
    input: UpdatePractitionerAccountInput,
  ): Promise<Practitioner> {
    const { doc, table } = this.deps();
    const sets: string[] = ["updatedAt = :ts"];
    const values: Record<string, unknown> = { ":ts": nowIso() };
    const names: Record<string, string> = {};
    if (input.fullName !== undefined) { sets.push("fullName = :fn"); values[":fn"] = input.fullName; }
    if (input.email !== undefined) { sets.push("email = :em"); values[":em"] = input.email; }
    if (input.registrationNumber !== undefined) {
      sets.push("registrationNumber = :rn"); values[":rn"] = input.registrationNumber;
    }
    if (input.status !== undefined) {
      names["#s"] = "status"; sets.push("#s = :st"); values[":st"] = input.status;
    }
    const result = await doc.send(
      new UpdateCommand({
        TableName: table,
        Key: { PK: practitionerPk(practitionerId), SK: PRACTITIONER_SK },
        ConditionExpression: "attribute_exists(PK)",
        UpdateExpression: `SET ${sets.join(", ")}`,
        ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      }),
    );
    return itemToPractitioner(result.Attributes ?? {});
  }

  async updatePractice(
    practiceId: string,
    input: UpdatePracticeInput,
  ): Promise<Practice> {
    const { doc, table } = this.deps();
    const sets: string[] = ["updatedAt = :ts"];
    const values: Record<string, unknown> = { ":ts": nowIso() };
    const names: Record<string, string> = {};
    if (input.name !== undefined) { names["#n"] = "name"; sets.push("#n = :nm"); values[":nm"] = input.name; }
    if (input.email !== undefined) { sets.push("email = :em"); values[":em"] = input.email; }
    if (input.phone !== undefined) { sets.push("phone = :ph"); values[":ph"] = input.phone; }
    if (input.address !== undefined) { names["#a"] = "address"; sets.push("#a = :ad"); values[":ad"] = input.address; }
    const result = await doc.send(
      new UpdateCommand({
        TableName: table,
        Key: { PK: practicePk(practiceId), SK: PRACTICE_SK },
        ConditionExpression: "attribute_exists(PK)",
        UpdateExpression: `SET ${sets.join(", ")}`,
        ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      }),
    );
    return itemToPractice(result.Attributes ?? {});
  }

  /**
   * Re-key the practitioner record — and every access-grant pair — to the
   * Cognito sub in ONE TransactWriteItems, so the login join key and the
   * grants can never diverge. The new-id Put is conditional
   * (`attribute_not_exists`) as the atomic backstop against id collisions.
   */
  async linkPractitionerLogin(
    currentId: string,
    cognitoUserId: string,
  ): Promise<Practitioner> {
    const { doc, table } = this.deps();
    const existing = await this.getPractitioner(currentId);
    if (!existing) throw new Error(`Practitioner not found: ${currentId}`);
    const taken = await this.getPractitioner(cognitoUserId);
    if (taken) throw new Error("A practitioner already exists for that login.");

    const grants = await this.listPatientAccess(currentId);
    // 2 practitioner ops + 4 per grant must fit one transaction (100 items).
    if (grants.length > 24) {
      throw new Error(
        "Too many linked patients to migrate in one step — escalate to engineering.",
      );
    }

    const linked: Practitioner = {
      ...existing,
      practitionerId: cognitoUserId,
      userId: cognitoUserId,
      updatedAt: nowIso(),
    };
    const transactItems: NonNullable<
      TransactWriteCommandInput["TransactItems"]
    > = [
      {
        Put: {
          TableName: table,
          Item: {
            PK: practitionerPk(linked.practitionerId),
            SK: PRACTITIONER_SK,
            type: "PRACTITIONER",
            ...linked,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
      {
        Delete: {
          TableName: table,
          Key: { PK: practitionerPk(currentId), SK: PRACTITIONER_SK },
        },
      },
    ];
    for (const grant of grants) {
      const moved = { ...grant, practitionerId: cognitoUserId };
      const [byPractitioner, byProfile] = practitionerAccessItems(moved);
      transactItems.push(
        { Put: { TableName: table, Item: byPractitioner } },
        { Put: { TableName: table, Item: byProfile } },
        {
          Delete: {
            TableName: table,
            Key: {
              PK: practitionerPk(currentId),
              SK: patientSkByPractitioner(grant.profileId),
            },
          },
        },
        {
          Delete: {
            TableName: table,
            Key: {
              PK: profilePk(grant.profileId),
              SK: practitionerSkByProfile(currentId),
            },
          },
        },
      );
    }
    await doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
    return linked;
  }

  async setApprovalDecision(
    practitionerId: string,
    input: PractitionerDecisionInput,
  ): Promise<Practitioner> {
    const { doc, table } = this.deps();
    const ts = nowIso();
    const result = await doc.send(
      new UpdateCommand({
        TableName: table,
        Key: { PK: practitionerPk(practitionerId), SK: PRACTITIONER_SK },
        ConditionExpression: "attribute_exists(PK)",
        UpdateExpression:
          "SET #s = :status, statusNotes = :notes, updatedAt = :ts",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":status": input.decision,
          ":notes": input.notes ?? "",
          ":ts": ts,
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    return itemToPractitioner(result.Attributes ?? {});
  }
}
