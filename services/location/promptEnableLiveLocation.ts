/**
 * Imperative post-accept prompt for Enable Live Location.
 * Renders via a host mounted in the driver shell.
 */

import {
  startDriverLiveSharing,
  stopDriverLiveSharing,
} from '@/services/location/driverLiveSharingSession';

export type LiveLocationPromptRequest = {
  orderId: string;
  driverId: string;
};

type PendingPrompt = LiveLocationPromptRequest & {
  resolve: (enabled: boolean) => void;
};

type HostApi = {
  present: (req: LiveLocationPromptRequest) => Promise<boolean>;
};

let hostApi: HostApi | null = null;
let queued: PendingPrompt | null = null;

export function registerLiveLocationPromptHost(api: HostApi | null): void {
  hostApi = api;
  if (api && queued) {
    const pending = queued;
    queued = null;
    void api.present(pending).then(pending.resolve);
  }
}

/**
 * Show Enable Live Location after Accept Delivery.
 * Resolves true when sharing started; false when declined / denied.
 */
export function promptEnableLiveLocation(
  orderId: string,
  driverId: string,
): Promise<boolean> {
  const req: LiveLocationPromptRequest = {
    orderId: orderId.trim(),
    driverId: driverId.trim(),
  };
  if (!req.orderId || !req.driverId) return Promise.resolve(false);

  if (hostApi) {
    return hostApi.present(req);
  }

  return new Promise<boolean>((resolve) => {
    queued = { ...req, resolve };
  });
}

/** Called by the host when the driver taps Enable Live Location. */
export async function confirmEnableLiveLocation(
  orderId: string,
  driverId: string,
): Promise<boolean> {
  const ok = await startDriverLiveSharing(orderId, driverId);
  if (!ok) {
    await stopDriverLiveSharing('permission_denied');
  }
  return ok;
}

/** Called by the host when the driver taps Not Now. */
export async function declineEnableLiveLocation(): Promise<void> {
  await stopDriverLiveSharing('declined');
}
