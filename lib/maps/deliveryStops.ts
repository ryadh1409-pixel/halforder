/**
 * Canonical delivery-stop sequence for live maps.
 * Reads existing order fields only — no HalfOrder-specific branches, no schema changes.
 *
 * Supports:
 * - Single-customer marketplace delivery
 * - Food Share pickup/dropoff fields on one order
 * - Marketplace groupId siblings (shared batch)
 * - Forward-compatible arrays: deliveryStops / dropoffs / customers
 */

import { deliveryMapLegFromStatuses } from '@/lib/maps/deliveryRouteStage';
import { validMapCoord, type MapLatLng } from '@/lib/maps/liveDriverMarker';
import { isDriverActiveListTerminal } from '@/lib/driverActiveOrderFilter';
import { parseLegacyLatLng } from '@/lib/location/coordinates';

export type DeliveryMapStopKind = 'restaurant' | 'customer';

export type DeliveryMapStop = {
  id: string;
  kind: DeliveryMapStopKind;
  label: string;
  coordinate: MapLatLng;
  /** Owning order id when the stop comes from a group sibling. */
  orderId: string;
  sequence: number;
  delivered: boolean;
};

export type DeliveryStopSource = {
  id: string;
  groupId?: string | null;
  status?: unknown;
  deliveryStatus?: unknown;
  marketplaceCourierStatus?: unknown;
  firestoreDeliveryStatus?: unknown;
  restaurantName?: string | null;
  restaurantLocation?: unknown;
  customerName?: string | null;
  customerLocation?: unknown;
  deliveryAddress?: string | null;
  /** Food-share / swipe fields already on orders. */
  dropoffName?: string | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  pickupName?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  createdAtMs?: number | null;
  /** Forward-compatible stop lists (if present on the doc). */
  deliveryStops?: unknown;
  dropoffs?: unknown;
  customers?: unknown;
};

function toCoord(value: unknown): MapLatLng | null {
  try {
    const parsed = parseLegacyLatLng(value);
    if (parsed) {
      return validMapCoord({ latitude: parsed.lat, longitude: parsed.lng });
    }
  } catch {
    /* fall through */
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const lat = typeof o.latitude === 'number' ? o.latitude : Number(o.lat);
    const lng = typeof o.longitude === 'number' ? o.longitude : Number(o.lng);
    return validMapCoord({ latitude: lat, longitude: lng });
  }
  return null;
}

function latLngPair(
  lat: unknown,
  lng: unknown,
): MapLatLng | null {
  const a = typeof lat === 'number' ? lat : Number(lat);
  const b = typeof lng === 'number' ? lng : Number(lng);
  return validMapCoord({ latitude: a, longitude: b });
}

function firstName(label: string | null | undefined, fallback: string): string {
  const raw = typeof label === 'string' ? label.trim() : '';
  if (!raw) return fallback;
  const token = raw.split(/\s+/)[0];
  return token || fallback;
}

function sameCoord(a: MapLatLng, b: MapLatLng): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < 1e-5 &&
    Math.abs(a.longitude - b.longitude) < 1e-5
  );
}

function isDeliveredSource(source: DeliveryStopSource): boolean {
  return isDriverActiveListTerminal({
    status: source.status,
    deliveryStatus:
      source.firestoreDeliveryStatus ??
      source.deliveryStatus ??
      source.marketplaceCourierStatus,
  });
}

function parseStopList(
  raw: unknown,
  orderId: string,
  startSequence: number,
): DeliveryMapStop[] {
  if (!Array.isArray(raw)) return [];
  const out: DeliveryMapStop[] = [];
  let seq = startSequence;
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i];
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const coord =
      toCoord(o.location ?? o.deliveryLocation ?? o.customerLocation ?? o) ??
      latLngPair(o.lat ?? o.latitude, o.lng ?? o.longitude);
    if (!coord) continue;
    const name =
      (typeof o.name === 'string' && o.name.trim()) ||
      (typeof o.customerName === 'string' && o.customerName.trim()) ||
      (typeof o.label === 'string' && o.label.trim()) ||
      null;
    const delivered =
      o.delivered === true ||
      o.status === 'delivered' ||
      o.deliveryStatus === 'delivered';
    out.push({
      id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `${orderId}:stop:${i}`,
      kind: 'customer',
      label: firstName(name, `Customer ${seq + 1}`),
      coordinate: coord,
      orderId,
      sequence: seq,
      delivered,
    });
    seq += 1;
  }
  return out;
}

function dropoffCoordFromOrder(source: DeliveryStopSource): MapLatLng | null {
  return (
    latLngPair(source.dropoffLat, source.dropoffLng) ??
    latLngPair(source.deliveryLat, source.deliveryLng) ??
    toCoord(source.customerLocation)
  );
}

/**
 * Food-share / swipe peer pickup (a second person) when pickup coords are
 * distinct from the restaurant venue. Marketplace orders usually set pickup
 * equal to the restaurant — those are skipped so we do not invent a second customer.
 */
function peerPickupStopFromOrder(
  source: DeliveryStopSource,
  restaurant: MapLatLng | null,
  dropoff: MapLatLng | null,
  sequence: number,
  indexLabel: number,
): DeliveryMapStop | null {
  const pickup = latLngPair(source.pickupLat, source.pickupLng);
  if (!pickup) return null;
  if (restaurant && sameCoord(pickup, restaurant)) return null;
  if (dropoff && sameCoord(pickup, dropoff)) return null;
  const hasPeerName =
    typeof source.pickupName === 'string' && source.pickupName.trim().length > 0;
  // Without a peer name, treat pickup as venue fallback only (already used by restaurant resolver).
  if (!hasPeerName) return null;
  return {
    id: `${source.id}:pickup_peer`,
    kind: 'customer',
    label: firstName(source.pickupName, `Customer ${indexLabel}`),
    coordinate: pickup,
    orderId: source.id,
    sequence,
    delivered: false,
  };
}

function customerStopsFromOrder(
  source: DeliveryStopSource,
  startSequence: number,
): DeliveryMapStop[] {
  const restaurant =
    toCoord(source.restaurantLocation) ??
    latLngPair(source.restaurantLat, source.restaurantLng);
  const dropoff = dropoffCoordFromOrder(source);
  const out: DeliveryMapStop[] = [];
  let seq = startSequence;
  const peer = peerPickupStopFromOrder(
    source,
    restaurant,
    dropoff,
    seq,
    seq + 1,
  );
  if (peer) {
    out.push(peer);
    seq += 1;
  }
  if (dropoff) {
    out.push({
      id: `${source.id}:customer`,
      kind: 'customer',
      label: firstName(
        source.dropoffName ?? source.customerName,
        `Customer ${seq + 1}`,
      ),
      coordinate: dropoff,
      orderId: source.id,
      sequence: seq,
      delivered: isDeliveredSource(source),
    });
  }
  return out;
}

/** Restaurant / venue stop for the trip. */
export function resolveDeliveryRestaurantStop(
  source: DeliveryStopSource,
): DeliveryMapStop | null {
  const coord =
    toCoord(source.restaurantLocation) ??
    latLngPair(source.restaurantLat, source.restaurantLng) ??
    latLngPair(source.pickupLat, source.pickupLng);
  if (!coord) return null;
  return {
    id: `${source.id}:restaurant`,
    kind: 'restaurant',
    label: source.restaurantName?.trim() || 'Restaurant',
    coordinate: coord,
    orderId: source.id,
    sequence: -1,
    delivered: false,
  };
}

/**
 * All customer dropoff stops for the live map, in delivery sequence.
 * Merges primary order + same-group siblings + optional stop arrays.
 */
export function resolveDeliveryCustomerStops(
  primary: DeliveryStopSource,
  siblings: DeliveryStopSource[] = [],
): DeliveryMapStop[] {
  const byKey = new Map<string, DeliveryMapStop>();
  const push = (stop: DeliveryMapStop | null) => {
    if (!stop) return;
    for (const existing of byKey.values()) {
      if (sameCoord(existing.coordinate, stop.coordinate)) {
        // Prefer a non-delivered / named stop when coords collide.
        if (existing.delivered && !stop.delivered) {
          byKey.set(existing.id, { ...stop, id: existing.id, sequence: existing.sequence });
        }
        return;
      }
    }
    byKey.set(stop.id, stop);
  };

  const related = [
    primary,
    ...siblings.filter(
      (s) =>
        s.id !== primary.id &&
        Boolean(primary.groupId) &&
        s.groupId === primary.groupId,
    ),
  ];

  // Stable sequence: createdAt then id.
  related.sort((a, b) => {
    const ca = a.createdAtMs ?? 0;
    const cb = b.createdAtMs ?? 0;
    if (ca !== cb) return ca - cb;
    return a.id.localeCompare(b.id);
  });

  let seq = 0;
  for (const source of related) {
    const fromArrays = [
      ...parseStopList(source.deliveryStops, source.id, seq),
      ...parseStopList(source.dropoffs, source.id, seq),
      ...parseStopList(source.customers, source.id, seq),
    ];
    if (fromArrays.length > 0) {
      for (const stop of fromArrays) {
        push({ ...stop, sequence: seq });
        seq += 1;
      }
      continue;
    }
    for (const stop of customerStopsFromOrder(source, seq)) {
      const before = byKey.size;
      push(stop);
      if (byKey.size > before) seq += 1;
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.sequence - b.sequence);
}

export function resolveActiveCustomerStop(
  customers: DeliveryMapStop[],
  deliveryStatus: unknown,
  kitchenStatus?: unknown,
): DeliveryMapStop | null {
  const leg = deliveryMapLegFromStatuses(deliveryStatus, kitchenStatus);
  if (leg === 'to_restaurant') return null;
  const pending = customers.filter((c) => !c.delivered);
  return pending[0] ?? customers[customers.length - 1] ?? null;
}

export function activeDeliveryToStopSource(
  order: {
    id: string;
    groupId?: string | null;
    status?: unknown;
    deliveryStatus?: unknown;
    marketplaceCourierStatus?: unknown;
    firestoreDeliveryStatus?: unknown;
    restaurantName?: string | null;
    restaurantLocation?: unknown;
    customerName?: string | null;
    customerLocation?: unknown;
    deliveryAddress?: string | null;
    dropoffName?: string | null;
    dropoffLat?: number | null;
    dropoffLng?: number | null;
    pickupName?: string | null;
    pickupLat?: number | null;
    pickupLng?: number | null;
    restaurantLat?: number | null;
    restaurantLng?: number | null;
    deliveryLat?: number | null;
    deliveryLng?: number | null;
    createdAtMs?: number | null;
    deliveryStops?: unknown;
    dropoffs?: unknown;
    customers?: unknown;
  },
): DeliveryStopSource {
  return {
    id: order.id,
    groupId: order.groupId ?? null,
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    marketplaceCourierStatus: order.marketplaceCourierStatus,
    firestoreDeliveryStatus: order.firestoreDeliveryStatus,
    restaurantName: order.restaurantName ?? null,
    restaurantLocation: order.restaurantLocation,
    customerName: order.customerName ?? null,
    customerLocation: order.customerLocation,
    deliveryAddress: order.deliveryAddress ?? null,
    dropoffName: order.dropoffName ?? null,
    dropoffLat: order.dropoffLat ?? null,
    dropoffLng: order.dropoffLng ?? null,
    pickupName: order.pickupName ?? null,
    pickupLat: order.pickupLat ?? null,
    pickupLng: order.pickupLng ?? null,
    restaurantLat: order.restaurantLat ?? null,
    restaurantLng: order.restaurantLng ?? null,
    deliveryLat: order.deliveryLat ?? null,
    deliveryLng: order.deliveryLng ?? null,
    createdAtMs: order.createdAtMs ?? null,
    deliveryStops: order.deliveryStops,
    dropoffs: order.dropoffs,
    customers: order.customers,
  };
}
