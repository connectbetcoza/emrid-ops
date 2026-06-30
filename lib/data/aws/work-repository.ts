import "server-only";
import { QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import type { WorkItemRecord } from "@/lib/data/work-record";
import type { WorkItemRepository, WorkTransitionInput } from "@/lib/data/types";
import type { WorkDomain } from "@/lib/work/work-type";
import { defaultDeps, type DynamoDeps } from "@/lib/data/aws/client";
import {
  WORK_BY_CUSTOMER_PREFIX,
  itemToWorkRecord,
  profilePk,
  workCustomerItem,
  workCustomerSk,
  workPk,
  workQueueItem,
  workQueueSk,
} from "@/lib/data/aws/keys";
import { nowIso } from "@/lib/data/ids";

/**
 * DynamoDB WorkItemRepository — the persisted Ops work index, dual-written into
 * the SHARED table. Queues read the WORK#<domain> partition; the Customer
 * Workspace reads the PROFILE#<customerId> partition. NO scans, NO GSI.
 *
 * `status` is encoded in BOTH SKs, so a transition is a single TransactWrite
 * that deletes the old pair and puts the new pair — keeping both projection
 * items consistent atomically. Mirrors the Patient Platform's dual-write idiom.
 */
export class DynamoWorkItemRepository implements WorkItemRepository {
  constructor(private readonly injected?: DynamoDeps) {}
  private deps(): DynamoDeps {
    return this.injected ?? defaultDeps();
  }

  async create(record: WorkItemRecord): Promise<WorkItemRecord> {
    const { doc, table } = this.deps();
    // Idempotent: conditional Puts so a replayed stream event cannot duplicate
    // or clobber an existing Work Item. A conditional-check cancellation means
    // the item already exists → treat as a successful no-op.
    try {
      await doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: table,
                Item: workQueueItem(record),
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
            {
              Put: {
                TableName: table,
                Item: workCustomerItem(record),
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === "TransactionCanceledException") {
        return record; // already created — idempotent no-op
      }
      throw error;
    }
    return record;
  }

  async listByDomain(domain: WorkDomain): Promise<WorkItemRecord[]> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": workPk(domain) },
      }),
    );
    return (result.Items ?? []).map(itemToWorkRecord);
  }

  async listForCustomer(customerId: string): Promise<WorkItemRecord[]> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": profilePk(customerId),
          ":sk": WORK_BY_CUSTOMER_PREFIX,
        },
      }),
    );
    return (result.Items ?? []).map(itemToWorkRecord);
  }

  async transition(
    current: WorkItemRecord,
    input: WorkTransitionInput,
  ): Promise<WorkItemRecord> {
    const { doc, table } = this.deps();
    const updated: WorkItemRecord = {
      ...current,
      status: input.toStatus,
      step: input.step ?? current.step,
      updatedAt: nowIso(),
    };

    // Status is in both SKs → delete the old pair, put the new pair, atomically.
    await doc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: table,
              Key: {
                PK: workPk(current.workDomain),
                SK: workQueueSk(
                  current.status,
                  current.priority,
                  current.dueAt,
                  current.workItemId,
                ),
              },
            },
          },
          { Put: { TableName: table, Item: workQueueItem(updated) } },
          {
            Delete: {
              TableName: table,
              Key: {
                PK: profilePk(current.customerId),
                SK: workCustomerSk(current.status, current.workItemId),
              },
            },
          },
          { Put: { TableName: table, Item: workCustomerItem(updated) } },
        ],
      }),
    );
    return updated;
  }
}
