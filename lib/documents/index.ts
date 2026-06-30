import "server-only";
import { config } from "@/lib/config";
import type { DocumentAccessService } from "@/lib/documents/types";
import { MockDocumentAccessService } from "@/lib/documents/mock-access-service";
import { S3DocumentAccessService } from "@/lib/documents/s3-access-service";

const mockService = new MockDocumentAccessService();
const s3Service = new S3DocumentAccessService();

/**
 * Document-access selection respects `USE_MOCK_UPLOADS` (mock default, fails
 * closed in production). Real S3 presigned downloads when false.
 */
export function getDocumentAccessService(): DocumentAccessService {
  return config.useMockUploads ? mockService : s3Service;
}
