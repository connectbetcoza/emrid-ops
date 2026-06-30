/** A short-lived, authorised download URL for a stored document object. */
export type PresignedDownload = {
  downloadUrl: string;
  expiresAt: string;
};

/**
 * Document access for Operations — Ops reads (downloads) documents to review
 * them (e.g. the customer's ID document during identity verification). Ops does
 * NOT upload customer documents (the customer/Patient Platform does), so the
 * service is read-only.
 */
export interface DocumentAccessService {
  createDownloadUrl(
    storageKey: string,
    options?: { fileName?: string },
  ): Promise<PresignedDownload>;
}
