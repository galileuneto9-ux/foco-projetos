import QRCode from "qrcode";
import type { WhatsappStatus } from "@/domain/types";

export type VolumeState = {
  status: WhatsappStatus;
  number: string | null;
  session: boolean;
};

export class FakeEvolutionConnection {
  constructor(private readonly volume: Map<string, VolumeState>) {}

  async requestQr(instance: string): Promise<{ status: WhatsappStatus; qrDataUrl: string | null; reconnected: boolean }> {
    const current = this.volume.get(instance);
    if (current?.status === "open" && current.session) {
      return { status: "open", qrDataUrl: null, reconnected: true };
    }
    this.volume.set(instance, { status: "qr", number: null, session: false });
    const qrDataUrl = await QRCode.toDataURL(`foco-dev-qr:${instance}`, { margin: 1, width: 280 });
    return { status: "qr", qrDataUrl, reconnected: false };
  }

  async markScanned(instance: string, number: string): Promise<void> {
    this.volume.set(instance, { status: "open", number, session: true });
  }

  restart(instance: string): { status: WhatsappStatus; needsQr: boolean } {
    const current = this.volume.get(instance);
    if (current?.session && current.status === "open") {
      return { status: "open", needsQr: false };
    }
    return { status: current?.status ?? "disconnected", needsQr: true };
  }
}
