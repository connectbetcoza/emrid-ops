import "server-only";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  DirectoryEntry,
  PractitionerDirectoryEntry,
} from "@/lib/data/entities";
import type { DirectoryRepository } from "@/lib/data/types";
import { defaultDeps, type DynamoDeps } from "@/lib/data/aws/client";
import {
  DIRECTORY_CUSTOMER_PREFIX_SK,
  DIRECTORY_PK,
  DIRECTORY_PRACTITIONER_PREFIX_SK,
  directoryItem,
  directoryPractitionerSk,
  directorySk,
  itemToDirectoryEntry,
  itemToPractitionerDirectoryEntry,
  practitionerDirectoryItem,
} from "@/lib/data/aws/keys";

/**
 * DynamoDB DirectoryRepository — the Ops-owned customer listing projection.
 * `listCustomers` is a paginated Query on the single DIRECTORY partition
 * (NEVER a scan); `upsertEntry` is a plain Put (recompute-from-truth overwrite,
 * last writer wins — replays rewrite the same entry).
 */
export class DynamoDirectoryRepository implements DirectoryRepository {
  constructor(private readonly injected?: DynamoDeps) {}
  private deps(): DynamoDeps {
    return this.injected ?? defaultDeps();
  }

  async listCustomers(): Promise<DirectoryEntry[]> {
    const { doc, table } = this.deps();
    const entries: DirectoryEntry[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const page = await doc.send(
        new QueryCommand({
          TableName: table,
          // begins_with keeps customer and practitioner entries separate — the
          // partition holds both kinds.
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": DIRECTORY_PK,
            ":sk": DIRECTORY_CUSTOMER_PREFIX_SK,
          },
          ExclusiveStartKey,
        }),
      );
      for (const item of page.Items ?? []) {
        entries.push(itemToDirectoryEntry(item));
      }
      ExclusiveStartKey = page.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (ExclusiveStartKey);
    return entries;
  }

  async getEntry(profileId: string): Promise<DirectoryEntry | null> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new GetCommand({
        TableName: table,
        Key: { PK: DIRECTORY_PK, SK: directorySk(profileId) },
      }),
    );
    return result.Item ? itemToDirectoryEntry(result.Item) : null;
  }

  async upsertEntry(entry: DirectoryEntry): Promise<DirectoryEntry> {
    const { doc, table } = this.deps();
    await doc.send(
      new PutCommand({ TableName: table, Item: directoryItem(entry) }),
    );
    return entry;
  }

  async listPractitioners(): Promise<PractitionerDirectoryEntry[]> {
    const { doc, table } = this.deps();
    const entries: PractitionerDirectoryEntry[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const page = await doc.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": DIRECTORY_PK,
            ":sk": DIRECTORY_PRACTITIONER_PREFIX_SK,
          },
          ExclusiveStartKey,
        }),
      );
      for (const item of page.Items ?? []) {
        entries.push(itemToPractitionerDirectoryEntry(item));
      }
      ExclusiveStartKey = page.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (ExclusiveStartKey);
    return entries;
  }

  async upsertPractitionerEntry(
    entry: PractitionerDirectoryEntry,
  ): Promise<PractitionerDirectoryEntry> {
    const { doc, table } = this.deps();
    await doc.send(
      new PutCommand({ TableName: table, Item: practitionerDirectoryItem(entry) }),
    );
    return entry;
  }

  async removePractitionerEntry(practitionerId: string): Promise<void> {
    const { doc, table } = this.deps();
    // Unconditional delete — removing a missing entry is a no-op, so stream
    // replays are harmless.
    await doc.send(
      new DeleteCommand({
        TableName: table,
        Key: { PK: DIRECTORY_PK, SK: directoryPractitionerSk(practitionerId) },
      }),
    );
  }
}
