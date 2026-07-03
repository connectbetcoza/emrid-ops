import "server-only";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { OpsNote } from "@/lib/data/entities";
import type { NoteRepository } from "@/lib/data/types";
import { defaultDeps, type DynamoDeps } from "@/lib/data/aws/client";
import {
  OPSNOTE_PREFIX_SK,
  itemToOpsNote,
  opsNoteItem,
  profilePk,
} from "@/lib/data/aws/keys";

/**
 * DynamoDB NoteRepository — Ops-owned items in the subject's PROFILE#
 * partition. The SK embeds createdAt, so a descending Query reads newest-first
 * without any index. `add` is a conditional Put (idempotent on the exact
 * SK — a retried submit never duplicates); there is no update/delete path.
 */
export class DynamoNoteRepository implements NoteRepository {
  constructor(private readonly injected?: DynamoDeps) {}
  private deps(): DynamoDeps {
    return this.injected ?? defaultDeps();
  }

  async add(note: OpsNote): Promise<OpsNote> {
    const { doc, table } = this.deps();
    try {
      await doc.send(
        new PutCommand({
          TableName: table,
          Item: opsNoteItem(note),
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
        return note; // idempotent on (createdAt, noteId)
      }
      throw error;
    }
    return note;
  }

  async listForSubject(subjectId: string): Promise<OpsNote[]> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": profilePk(subjectId),
          ":sk": OPSNOTE_PREFIX_SK,
        },
        ScanIndexForward: false, // newest first (SK sorts by createdAt)
      }),
    );
    return (result.Items ?? []).map(itemToOpsNote);
  }
}
