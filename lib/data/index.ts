import "server-only";
import { config } from "@/lib/config";
import type {
  AggregateRepository,
  AuditRepository,
  DeviceRepository,
  DocumentRepository,
  EmergencyProfileRepository,
  ProfileRepository,
  WorkItemRepository,
} from "@/lib/data/types";
import { MockProfileRepository } from "@/lib/data/mock/profile-repository";
import { MockDocumentRepository } from "@/lib/data/mock/document-repository";
import { MockAuditRepository } from "@/lib/data/mock/audit-repository";
import { MockWorkItemRepository } from "@/lib/data/mock/work-repository";
import { MockDeviceRepository } from "@/lib/data/mock/device-repository";
import { MockEmergencyProfileRepository } from "@/lib/data/mock/emergency-profile-repository";
import { MockAggregateRepository } from "@/lib/data/mock/aggregate-repository";
import { DynamoProfileRepository } from "@/lib/data/aws/profile-repository";
import { DynamoDocumentRepository } from "@/lib/data/aws/document-repository";
import { DynamoAuditRepository } from "@/lib/data/aws/audit-repository";
import { DynamoWorkItemRepository } from "@/lib/data/aws/work-repository";
import { DynamoDeviceRepository } from "@/lib/data/aws/device-repository";
import { DynamoEmergencyProfileRepository } from "@/lib/data/aws/emergency-profile-repository";
import { DynamoAggregateRepository } from "@/lib/data/aws/aggregate-repository";

/**
 * Repository factory — the spine. `pickMigrated` returns the DynamoDB impl when
 * `USE_MOCK_DATA=false`, else the mock. Defaults to mock outside production and
 * fails closed in production (see `lib/config`). Mirrors the Patient Platform.
 */
function pickMigrated<T>(mock: T, aws: T): T {
  return config.useMockData ? mock : aws;
}

const mockProfile = new MockProfileRepository();
const mockDocument = new MockDocumentRepository();
const mockAudit = new MockAuditRepository();
const mockWork = new MockWorkItemRepository();
const mockDevice = new MockDeviceRepository();
const mockEmergency = new MockEmergencyProfileRepository();
const mockAggregate = new MockAggregateRepository();

const awsProfile = new DynamoProfileRepository();
const awsDocument = new DynamoDocumentRepository();
const awsAudit = new DynamoAuditRepository();
const awsWork = new DynamoWorkItemRepository();
const awsDevice = new DynamoDeviceRepository();
const awsEmergency = new DynamoEmergencyProfileRepository();
const awsAggregate = new DynamoAggregateRepository();

export function getProfileRepository(): ProfileRepository {
  return pickMigrated(mockProfile, awsProfile);
}

export function getDocumentRepository(): DocumentRepository {
  return pickMigrated(mockDocument, awsDocument);
}

export function getAuditRepository(): AuditRepository {
  return pickMigrated(mockAudit, awsAudit);
}

export function getWorkItemRepository(): WorkItemRepository {
  return pickMigrated(mockWork, awsWork);
}

export function getDeviceRepository(): DeviceRepository {
  return pickMigrated(mockDevice, awsDevice);
}

export function getEmergencyProfileRepository(): EmergencyProfileRepository {
  return pickMigrated(mockEmergency, awsEmergency);
}

export function getAggregateRepository(): AggregateRepository {
  return pickMigrated(mockAggregate, awsAggregate);
}
