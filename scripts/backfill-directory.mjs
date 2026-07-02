#!/usr/bin/env node
/**
 * Customer Directory backfill — ONE-OFF operator tool.
 *
 * Existing profiles predate the directory, so no stream event will ever create
 * their entries. This script discovers every PROFILE item (one admin Scan —
 * sanctioned for operator tooling only; the app itself never scans) and drives
 * each through the PRODUCTION path: a synthetic "touch" event (PROFILE MODIFY,
 * status unchanged) invoked on the producer Lambda, whose directory-refresh
 * recomputes and upserts the entry. Status-unchanged means NO work items are
 * created — the only effect is the directory upsert.
 *
 * Usage:
 *   AWS_PROFILE=<admin> node scripts/backfill-directory.mjs [--dry-run]
 * Env: APP_AWS_REGION (default eu-west-1), DYNAMODB_TABLE_NAME (default
 *      emrid-dev-app), PRODUCER_FUNCTION (default emrid-work-item-producer).
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const REGION = process.env.APP_AWS_REGION ?? "eu-west-1";
const TABLE = process.env.DYNAMODB_TABLE_NAME ?? "emrid-dev-app";
const FN = process.env.PRODUCER_FUNCTION ?? "emrid-work-item-producer";
const DRY = process.argv.includes("--dry-run");

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const lambda = new LambdaClient({ region: REGION });

function touchEvent(profileId, idStatus) {
  const image = {
    profileId: { S: profileId },
    identityVerificationStatus: { S: idStatus },
  };
  return {
    Records: [
      {
        eventName: "MODIFY",
        dynamodb: {
          Keys: { PK: { S: `PROFILE#${profileId}` }, SK: { S: "PROFILE" } },
          OldImage: image,
          NewImage: image,
        },
      },
    ],
  };
}

async function main() {
  const profiles = [];
  let ExclusiveStartKey;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "SK = :sk",
        ExpressionAttributeValues: { ":sk": "PROFILE" },
        ExclusiveStartKey,
      }),
    );
    profiles.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  console.log(`Found ${profiles.length} profiles.${DRY ? " (dry-run)" : ""}`);
  for (const p of profiles) {
    const id = p.profileId;
    const status = p.identityVerificationStatus ?? "UNVERIFIED";
    if (DRY) {
      console.log(`would touch: ${id} (${p.firstName} ${p.lastName})`);
      continue;
    }
    const res = await lambda.send(
      new InvokeCommand({
        FunctionName: FN,
        Payload: Buffer.from(JSON.stringify(touchEvent(id, status))),
      }),
    );
    const failed = res.FunctionError ? ` FUNCTION ERROR: ${res.FunctionError}` : "";
    console.log(`touched: ${id} (${p.firstName} ${p.lastName})${failed}`);
  }
  console.log("Backfill complete. Verify with a directory Query (PK=DIRECTORY).");
}

main().catch((err) => { console.error("FAILED:", err?.message ?? err); process.exit(1); });
