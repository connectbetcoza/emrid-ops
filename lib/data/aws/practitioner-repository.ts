import "server-only";
import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { Practice, Practitioner, PractitionerAccess } from "@/lib/data/entities";
import type {
  PractitionerDecisionInput,
  PractitionerRepository,
} from "@/lib/data/types";
import { defaultDeps, type DynamoDeps } from "@/lib/data/aws/client";
import {
  PATIENT_BY_PRACTITIONER_PREFIX,
  PRACTICE_SK,
  PRACTITIONER_SK,
  itemToPractice,
  itemToPractitioner,
  itemToPractitionerAccess,
  practicePk,
  practitionerPk,
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
