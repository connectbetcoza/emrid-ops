import type { Device } from "@/lib/data/entities";
import type { DeviceRepository } from "@/lib/data/types";
import { mockStore } from "@/lib/data/mock/store";
import { nowIso } from "@/lib/data/ids";

/** In-memory DeviceRepository over the shared mock store. */
export class MockDeviceRepository implements DeviceRepository {
  async listForCustomer(customerId: string): Promise<Device[]> {
    return [...mockStore.devices.values()]
      .filter((d) => d.profileId === customerId)
      .map((d) => ({ ...d }));
  }

  async getByToken(token: string): Promise<Device | null> {
    const d = [...mockStore.devices.values()].find((x) => x.token === token);
    return d ? { ...d } : null;
  }

  async markCardActive(customerId: string): Promise<Device> {
    const ts = nowIso();
    const existing = [...mockStore.devices.values()].find(
      (d) => d.profileId === customerId,
    );
    const device: Device = existing
      ? { ...existing, status: "ACTIVE", activatedAt: ts, updatedAt: ts }
      : {
          deviceId: `dev-${customerId}-${crypto.randomUUID().slice(0, 8)}`,
          profileId: customerId,
          status: "ACTIVE",
          token: crypto.randomUUID(),
          issuedAt: ts,
          activatedAt: ts,
          updatedAt: ts,
        };
    mockStore.devices.set(device.deviceId, device);
    return { ...device };
  }
}
