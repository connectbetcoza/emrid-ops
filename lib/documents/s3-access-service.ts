import "server-only";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "@/lib/config";
import type { DocumentAccessService, PresignedDownload } from "@/lib/documents/types";

const DOWNLOAD_EXPIRY_SECONDS = 5 * 60;

/** Injectable S3 deps — tests provide a fake client + signer (no AWS needed). */
export type S3Deps = {
  client: Pick<S3Client, "send">;
  bucket: string;
  sign: (
    client: unknown,
    command: unknown,
    options: { expiresIn: number },
  ) => Promise<string>;
};

let cachedClient: S3Client | null = null;
function getS3Client(): S3Client {
  if (!cachedClient) cachedClient = new S3Client({ region: config.awsRegion });
  return cachedClient;
}

function bucketName(): string {
  const name = config.aws.s3DocumentBucket;
  if (!name) {
    throw new Error(
      "S3_DOCUMENT_BUCKET is not configured (required when USE_MOCK_UPLOADS=false).",
    );
  }
  return name;
}

function defaultDeps(): S3Deps {
  return {
    client: getS3Client(),
    bucket: bucketName(),
    sign: getSignedUrl as unknown as S3Deps["sign"],
  };
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Real S3 document access. Issues a short-lived presigned GET, forcing an
 * attachment filename. Reads the same private bucket the Patient Platform
 * writes; the bucket stays Block-Public-Access on. Mirrors the Patient
 * Platform's S3 presign service.
 */
export class S3DocumentAccessService implements DocumentAccessService {
  constructor(private readonly injected?: S3Deps) {}
  private deps(): S3Deps {
    return this.injected ?? defaultDeps();
  }

  async createDownloadUrl(
    storageKey: string,
    options?: { fileName?: string },
  ): Promise<PresignedDownload> {
    const { client, bucket, sign } = this.deps();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      ...(options?.fileName
        ? {
            ResponseContentDisposition: `attachment; filename="${safeFileName(options.fileName)}"`,
          }
        : {}),
    });
    const downloadUrl = await sign(client, command, {
      expiresIn: DOWNLOAD_EXPIRY_SECONDS,
    });
    return {
      downloadUrl,
      expiresAt: new Date(Date.now() + DOWNLOAD_EXPIRY_SECONDS * 1000).toISOString(),
    };
  }
}
