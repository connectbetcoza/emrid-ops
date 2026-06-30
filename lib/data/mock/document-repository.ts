import type { DocumentMetadata } from "@/lib/data/entities";
import type { DocumentRepository } from "@/lib/data/types";
import { mockStore } from "@/lib/data/mock/store";

/** In-memory DocumentRepository over the shared mock store. */
export class MockDocumentRepository implements DocumentRepository {
  async listForProfile(profileId: string): Promise<DocumentMetadata[]> {
    return (mockStore.documents.get(profileId) ?? []).map((d) => ({ ...d }));
  }

  async getDocument(
    profileId: string,
    documentId: string,
  ): Promise<DocumentMetadata | null> {
    const doc = (mockStore.documents.get(profileId) ?? []).find(
      (d) => d.documentId === documentId,
    );
    return doc ? { ...doc } : null;
  }
}
