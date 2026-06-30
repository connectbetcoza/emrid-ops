import type { DocumentAccessService, PresignedDownload } from "@/lib/documents/types";

/**
 * Mock document access — returns a non-functional URL and stores no bytes.
 * Keeps Ops fully runnable offline; the real S3 service is selected when
 * `USE_MOCK_UPLOADS=false`.
 */
export class MockDocumentAccessService implements DocumentAccessService {
  async createDownloadUrl(storageKey: string): Promise<PresignedDownload> {
    return {
      downloadUrl: `mock://document/${encodeURIComponent(storageKey)}`,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }
}
