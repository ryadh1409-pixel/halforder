export type DriverVehicleInfo = {
  vehiclePhoto: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: string | null;
  vehicleColor: string | null;
  licensePlate: string | null;
};

export const EMPTY_DRIVER_VEHICLE: DriverVehicleInfo = {
  vehiclePhoto: null,
  vehicleMake: null,
  vehicleModel: null,
  vehicleYear: null,
  vehicleColor: null,
  licensePlate: null,
};

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(Math.trunc(value));
    }
  }
  return null;
}

/** Read vehicle fields from users/{uid} and/or drivers/{uid} (merge, prefer driver doc). */
export function pickDriverVehicleFromDocs(
  userDoc?: Record<string, unknown> | null,
  driverDoc?: Record<string, unknown> | null,
): DriverVehicleInfo {
  const u = userDoc ?? undefined;
  const d = driverDoc ?? undefined;
  return {
    vehiclePhoto: pickString(d?.vehiclePhoto, u?.vehiclePhoto),
    vehicleMake: pickString(d?.vehicleMake, u?.vehicleMake),
    vehicleModel: pickString(d?.vehicleModel, u?.vehicleModel),
    vehicleYear: pickString(d?.vehicleYear, u?.vehicleYear),
    vehicleColor: pickString(d?.vehicleColor, u?.vehicleColor),
    licensePlate: pickString(d?.licensePlate, u?.licensePlate),
  };
}

export function formatVehicleMakeModel(info: DriverVehicleInfo): string {
  const parts = [info.vehicleMake, info.vehicleModel].filter(Boolean);
  return parts.length ? parts.join(' ') : '';
}

/** Compact label for legacy `driverVehicle` / `driver.vehicle` string fields. */
export function formatVehicleSummary(info: DriverVehicleInfo): string {
  const makeModel = formatVehicleMakeModel(info);
  if (makeModel && info.vehicleColor) return `${makeModel} · ${info.vehicleColor}`;
  if (makeModel) return makeModel;
  if (info.vehicleColor) return info.vehicleColor;
  if (info.licensePlate) return info.licensePlate;
  return '';
}

export function hasAnyVehicleInfo(info: DriverVehicleInfo): boolean {
  return Boolean(
    info.vehiclePhoto ||
      info.vehicleMake ||
      info.vehicleModel ||
      info.vehicleYear ||
      info.vehicleColor ||
      info.licensePlate,
  );
}

/** Normalize drafts before Firestore write (empty → null). */
export function normalizeVehicleForSave(input: {
  vehiclePhoto?: string | null;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleColor: string;
  licensePlate: string;
}): DriverVehicleInfo {
  const clean = (v: string) => {
    const t = v.trim();
    return t.length ? t : null;
  };
  return {
    vehiclePhoto: pickString(input.vehiclePhoto),
    vehicleMake: clean(input.vehicleMake),
    vehicleModel: clean(input.vehicleModel),
    vehicleYear: clean(input.vehicleYear),
    vehicleColor: clean(input.vehicleColor),
    licensePlate: clean(input.licensePlate)?.toUpperCase() ?? null,
  };
}
