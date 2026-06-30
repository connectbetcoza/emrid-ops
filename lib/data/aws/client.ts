import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { config } from "@/lib/config";

/**
 * Injectable DynamoDB seam — mirrors the Patient Platform's `lib/data/aws/client.ts`.
 * `DynamoDeps` is the surface the repositories depend on; tests inject a fake
 * `doc.send` to capture commands without AWS. The real client is a lazy
 * singleton built from the compute IAM role via the default provider chain
 * (NO AWS keys in env).
 */
export type DynamoDeps = {
  doc: Pick<DynamoDBDocumentClient, "send">;
  table: string;
};

let docClient: DynamoDBDocumentClient | null = null;

export function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    const base = new DynamoDBClient({ region: config.awsRegion });
    docClient = DynamoDBDocumentClient.from(base, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

export function tableName(): string {
  const name = config.aws.dynamoTableName;
  if (!name) {
    throw new Error(
      "DYNAMODB_TABLE_NAME is not configured (required when USE_MOCK_DATA=false).",
    );
  }
  return name;
}

export function defaultDeps(): DynamoDeps {
  return { doc: getDocClient(), table: tableName() };
}
