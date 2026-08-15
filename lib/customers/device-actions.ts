"use server";

import { requireOpsUser } from "@/lib/auth/server";
import { reportAuthzDenial, reportError } from "@/lib/observability/report";
import {
  getAuditRepository,
  getDeviceRepository,
  getNoteRepository,
} from "@/lib/data";
import { newNoteId, nowIso } from "@/lib/data/ids";
import {
  DEVICE_ACTION_PERMISSION,
  executeDeviceAssist,
  type DeviceAssistInput,
  type DeviceAssistResult,
} from "@/lib/customers/device-assist";

/**
 * Assisted device support server action — thin Rule-15 wrapper; authorization,
 * validation, device mutation, audit, and note all live in the testable
 * executeDeviceAssist orchestrator. NEVER touches the aggregate (2b model).
 */
export async function assistDevice(
  customerId: string,
  input: DeviceAssistInput,
): Promise<DeviceAssistResult> {
  const user = await requireOpsUser();
  try {
    const result = await executeDeviceAssist(
      {
        deviceRepo: getDeviceRepository(),
        auditRepo: getAuditRepository(),
        noteRepo: getNoteRepository(),
      },
      {
        customerId,
        input,
        actor: { userId: user.userId, fullName: user.fullName, roles: user.roles },
        noteId: newNoteId(),
        now: nowIso(),
      },
    );
    if (!result.ok && result.denied) {
      reportAuthzDenial({
        userId: user.userId,
        permission: DEVICE_ACTION_PERMISSION[input.action],
        scope: "action:assistDevice",
        subjectId: customerId,
      });
    }
    return result;
  } catch (error) {
    reportError(error, { scope: "action:assistDevice", extra: { customerId } });
    return { ok: false, error: "Couldn't complete the device action — please try again." };
  }
}
