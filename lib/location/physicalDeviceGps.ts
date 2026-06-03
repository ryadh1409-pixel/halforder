import * as Device from 'expo-device';

/** Shown when production builds block simulator GPS. */
export const PRODUCTION_GPS_SIMULATOR_MESSAGE =
  'Live GPS requires a physical iPhone. Search for your address instead.';

/** Release / TestFlight / App Store builds — stricter than dev. */
export function isProductionGpsBuild(): boolean {
  return !__DEV__;
}

/** Live GPS is only trusted on a physical device in production. */
export function isPhysicalDeviceForGps(): boolean {
  return Device.isDevice === true;
}

/** True when production must not use simulator/emulator coordinates. */
export function shouldBlockSimulatorGps(): boolean {
  return isProductionGpsBuild() && !isPhysicalDeviceForGps();
}
