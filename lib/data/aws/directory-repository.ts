import "server-only";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { DirectoryEntry } from "@/lib/data/entities";
import type { DirectoryRepository } from "@/lib/data/types";
import { defaultDeps, type DynamoDeps } from "@/lib/data/aws/client";
import {
  DIRECTORY_PK,
  directoryItem,
  directorySk,
  itemToDirectoryEntry,
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
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": DIRECTORY_PK },
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
}
