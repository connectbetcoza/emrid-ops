import "server-only";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { ProtectedLivesAggregate } from "@/lib/data/entities";
import type {
  AggregateRepository,
  ProtectedLivesDelta,
} from "@/lib/data/types";
import { defaultDeps, type DynamoDeps } from "@/lib/data/aws/client";
import {
  AGGREGATE_CURRENT_SK,
  AGGREGATE_PROTECTED_LIVES_PK,
  itemToProtectedLivesAggregate,
} from "@/lib/data/aws/keys";
import { nowIso } from "@/lib/data/ids";

const EMPTY: ProtectedLivesAggregate = {
  protectedCount: 0,
  inProgressCount: 0,
  lastUpdatedAt: "",
  version: 0,
};

/**
 * DynamoDB AggregateRepository — the single `AGGREGATE#PROTECTED_LIVES / CURRENT`
 * row. Reads are a base-table `GetItem` (no scan, no GSI). Writes use an atomic
 * `ADD` so concurrent boundary crossings accumulate correctly without a
 * read-modify-write race; a missing item is treated as zero, so the row
 * self-initialises on first adjustment. Ops-owned — the Patient Platform never
 * touches this item.
 */
export class DynamoAggregateRepository implements AggregateRepository {
  constructor(private readonly injected?: DynamoDeps) {}
  private deps(): DynamoDeps {
    return this.injected ?? defaultDeps();
  }

  async getProtectedLives(): Promise<ProtectedLivesAggregate> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new GetCommand({
        TableName: table,
        Key: { PK: AGGREGATE_PROTECTED_LIVES_PK, SK: AGGREGATE_CURRENT_SK },
      }),
    );
    return result.Item ? itemToProtectedLivesAggregate(result.Item) : EMPTY;
  }

  async adjustProtectedLives(
    delta: ProtectedLivesDelta,
  ): Promise<ProtectedLivesAggregate> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new UpdateCommand({
        TableName: table,
        Key: { PK: AGGREGATE_PROTECTED_LIVES_PK, SK: AGGREGATE_CURRENT_SK },
        UpdateExpression:
          "SET lastUpdatedAt = :ts, #t = :type " +
          "ADD protectedCount :p, inProgressCount :ip, version :one",
        ExpressionAttributeNames: { "#t": "type" },
        ExpressionAttributeValues: {
          ":ts": nowIso(),
          ":type": "PROTECTED_LIVES_AGGREGATE",
          ":p": delta.protected,
          ":ip": delta.inProgress,
          ":one": 1,
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    return result.Attributes
      ? itemToProtectedLivesAggregate(result.Attributes)
      : EMPTY;
  }
}
