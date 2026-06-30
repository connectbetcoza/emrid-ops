import "server-only";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { DocumentMetadata } from "@/lib/data/entities";
import type { DocumentRepository } from "@/lib/data/types";
import { defaultDeps, type DynamoDeps } from "@/lib/data/aws/client";
import {
  DOCUMENT_BY_PROFILE_PREFIX_SK,
  documentSk,
  itemToDocument,
  profilePk,
} from "@/lib/data/aws/keys";

/** DynamoDB DocumentRepository — reads document metadata from the shared table. */
export class DynamoDocumentRepository implements DocumentRepository {
  constructor(private readonly injected?: DynamoDeps) {}
  private deps(): DynamoDeps {
    return this.injected ?? defaultDeps();
  }

  async listForProfile(profileId: string): Promise<DocumentMetadata[]> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": profilePk(profileId),
          ":sk": DOCUMENT_BY_PROFILE_PREFIX_SK,
        },
      }),
    );
    return (result.Items ?? []).map(itemToDocument);
  }

  async getDocument(
    profileId: string,
    documentId: string,
  ): Promise<DocumentMetadata | null> {
    const { doc, table } = this.deps();
    const result = await doc.send(
      new GetCommand({
        TableName: table,
        Key: { PK: profilePk(profileId), SK: documentSk(documentId) },
      }),
    );
    return result.Item ? itemToDocument(result.Item) : null;
  }
}
