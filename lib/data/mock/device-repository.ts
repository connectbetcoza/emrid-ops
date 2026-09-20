import { isPhysicalDevice, type Device } from "@/lib/data/entities";
import type { DeviceRepository } from "@/lib/data/types";
import {
  generateActivationCode,
  generateDeviceToken,
} from "@/lib/devices/token";
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
    // PHYSICAL devices only, preferring the one being fulfilled — mirrors
    // DynamoDeviceRepository.markCardActive so mock and AWS cannot disagree
    // about which device "activate the card" acts on.
    const physical = [...mockStore.devices.values()].filter(
      (d) => d.profileId === customerId && isPhysicalDevice(d),
    );
    const existing =
      physical.find((d) => d.status === "PENDING") ??
      physical.find((d) => d.status === "SUSPENDED") ??
      physical[0];
    const device: Device = existing
      ? { ...existing, status: "ACTIVE", activatedAt: ts, updatedAt: ts }
      : {
          deviceId: `device_${crypto.randomUUID()}`,
          profileId: customerId,
          deviceType: "CARD",
          status: "ACTIVE",
          token: generateDeviceToken(),
          issuedAt: ts,
          activatedAt: ts,
          updatedAt: ts,
        };
    mockStore.devices.set(device.deviceId, device);
    return { ...device };
  }

  private transitionStatus(
    customerId: string,
    deviceId: string,
    to: "SUSPENDED" | "ACTIVE" | "REVOKED",
    allowedFrom: readonly string[],
  ): Device {
    const existing = mockStore.devices.get(deviceId);
    if (!existing || existing.profileId !== customerId) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    if (!allowedFrom.includes(existing.status)) {
      throw new Error(
        `Device is ${existing.status} — this action requires ${allowedFrom.join("/")}.`,
      );
    }
    const updated: Device = {
      ...existing,
      status: to,
      updatedAt: new Date().toISOString(),
    };
    mockStore.devices.set(deviceId, updated);
    return { ...updated };
  }

  async suspendDevice(customerId: string, deviceId: string): Promise<Device> {
    return this.transitionStatus(customerId, deviceId, "SUSPENDED", ["ACTIVE"]);
  }

  async reactivateDevice(customerId: string, deviceId: string): Promise<Device> {
    return this.transitionStatus(customerId, deviceId, "ACTIVE", ["SUSPENDED"]);
  }

  async revokeDevice(customerId: string, deviceId: string): Promise<Device> {
    return this.transitionStatus(customerId, deviceId, "REVOKED", [
      "PENDING",
      "ACTIVE",
      "SUSPENDED",
    ]);
  }

  async issueReplacementDevice(customerId: string): Promise<Device> {
    const ts = new Date().toISOString();
    const device: Device = {
      deviceId: `device_${crypto.randomUUID()}`,
      profileId: customerId,
      // A replacement is always a physical card — see the AWS repository.
      deviceType: "CARD",
      status: "PENDING",
      token: generateDeviceToken(),
      activationCode: generateActivationCode(),
      issuedAt: ts,
      updatedAt: ts,
    };
    mockStore.devices.set(device.deviceId, device);
    return { ...device };
  }
}
