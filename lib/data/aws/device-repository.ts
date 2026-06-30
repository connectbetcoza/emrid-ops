import "server-only";
import { QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import type { Device } from "@/lib/data/entities";
import type { DeviceRepository } from "@/lib/data/types";
import { defaultDeps, type DynamoDeps } from "@/lib/data/aws/client";
import {
  DEVICE_BY_PROFILE_PREFIX,
  DEVICE_SK,
  GSI1_INDEX,
  deviceByProfileItem,
  deviceItem,
  devicePk,
  deviceSkByProfile,
  itemToDevice,
  profilePk,
  tokenGsiPk,
} from "@/lib/data/aws/keys";
import { nowIso } from "@/lib/data/ids";

/**
 * DynamoDB DeviceRepository over the SHARED table. Dual-write (canonical +
 * per-profile item), mirroring the Patient Platform. Device status is NOT in
 * the SKs, so a status change is two `UpdateItem`s in one TransactWrite (no
 * delete needed). `getByToken` is an exact-match GSI1 query for the public tap.
 */
export class DynamoDeviceRepository implements DeviceRepository {
  constructor(private readonly injected?: DynamoDeps) {}
  private deps(): DynamoDeps {
    return this.injected ?? defaultDeps();
  }

  async listForCustomer(customerId: string): Promise<Device[]> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": profilePk(customerId),
          ":sk": DEVICE_BY_PROFILE_PREFIX,
        },
      }),
    );
    return (result.Items ?? []).map(itemToDevice);
  }

  async getByToken(token: string): Promise<Device | null> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new QueryCommand({
        TableName: table,
        IndexName: GSI1_INDEX,
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": tokenGsiPk(token) },
      }),
    );
    const item = (result.Items ?? [])[0];
    return item ? itemToDevice(item) : null;
  }

  async markCardActive(customerId: string): Promise<Device> {
    const { doc, table } = this.deps();
    const ts = nowIso();
    const existing = (await this.listForCustomer(customerId))[0];

    if (existing) {
      const updated: Device = {
        ...existing,
        status: "ACTIVE",
        activatedAt: ts,
        updatedAt: ts,
      };
      const setStatus = {
        UpdateExpression: "SET #s = :s, #a = :a, #u = :u",
        ExpressionAttributeNames: { "#s": "status", "#a": "activatedAt", "#u": "updatedAt" },
        ExpressionAttributeValues: { ":s": "ACTIVE", ":a": ts, ":u": ts },
      };
      await doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: table,
                Key: { PK: devicePk(existing.deviceId), SK: DEVICE_SK },
                ...setStatus,
              },
            },
            {
              Update: {
                TableName: table,
                Key: {
                  PK: profilePk(customerId),
                  SK: deviceSkByProfile(existing.deviceId),
                },
                ...setStatus,
              },
            },
          ],
        }),
      );
      return updated;
    }

    const device: Device = {
      deviceId: `dev-${customerId}-${crypto.randomUUID().slice(0, 8)}`,
      profileId: customerId,
      status: "ACTIVE",
      token: crypto.randomUUID(),
      issuedAt: ts,
      activatedAt: ts,
      updatedAt: ts,
    };
    await doc.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: table, Item: deviceItem(device) } },
          { Put: { TableName: table, Item: deviceByProfileItem(device) } },
        ],
      }),
    );
    return device;
  }
}
