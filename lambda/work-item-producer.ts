/**
 * AWS Lambda entrypoint for the Work Item producer (operator-deployed).
 *
 * Thin adapter ONLY: it wires a DynamoDB Stream batch to the tested
 * `produceFromStreamRecords` logic with the real (flag-selected) repositories.
 * All decision logic lives in `lib/work/producer*` — this file adds nothing but
 * the runtime glue, so the Lambda and the app share one source of truth.
 *
 * Runtime config (set as Lambda env vars — see deploy docs):
 *   APP_ENV=production, USE_MOCK_DATA=false, APP_AWS_REGION=eu-west-1,
 *   DYNAMODB_TABLE_NAME=emrid-dev-app
 * With USE_MOCK_DATA=false the factory returns the DynamoDB repositories, which
 * resolve a lazy doc client from the Lambda execution role (no AWS keys).
 *
 * Build: bundle with esbuild using `--conditions=react-server` so the `server-only`
 * import in the data layer resolves to its no-op (the data modules are written for
 * RSC; this neutralises the guard for a plain Node runtime). See deploy docs.
 *
 * Idempotency: deterministic work-item ids + the idempotent `create` mean a
 * stream retry (or a redelivered record) never duplicates work — so letting an
 * error propagate for the event-source mapping to retry is safe.
 */
import {
  produceFromStreamRecords,
  type ProduceResult,
} from "@/lib/work/producer";
import { getProfileRepository, getWorkItemRepository } from "@/lib/data";

/** Minimal shape of a DynamoDB Stream invocation (avoids an aws-lambda dep). */
type DynamoDBStreamEvent = { Records?: unknown[] };

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  const records = Array.isArray(event?.Records) ? event.Records : [];
  if (records.length === 0) return;

  const results: ProduceResult[] = await produceFromStreamRecords(
    {
      workRepo: getWorkItemRepository(),
      profileRepo: getProfileRepository(),
    },
    records,
    new Date().toISOString(),
  );

  const created = results.filter((r) => r.created).length;
  // Secret-free operational log (counts only — never item contents / ids of PII).
  console.info("[work-item-producer]", {
    received: records.length,
    processed: results.length,
    created,
    skipped: results.length - created,
  });
}
