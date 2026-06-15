import * as admin from "firebase-admin";
import type {
  DocumentSnapshot,
  Transaction,
} from "firebase-admin/firestore";

export type FoodSharePricing = {
  sharedPrice: number;
  deliveryShare: number;
};

export type FoodShareUserDispatchProfile = {
  userId: string;
  name: string;
  phone: string;
  address: string;
  lat: number | null;
  lng: number | null;
};

export type FoodShareDispatchContext = {
  share: Record<string, unknown> | null;
  usersById: Record<string, Record<string, unknown>>;
  pickupUserId: string;
  dropoffUserId: string;
};

type LatLng = { lat: number; lng: number };

export function isPaidStatus(value: unknown): boolean {
  return String(value ?? "").trim().toUpperCase() === "PAID";
}

export function resolveFoodShareOrderId(
  matchId: string,
  match: Record<string, unknown>,
): string {
  const existing =
    typeof match.orderId === "string" ? match.orderId.trim() : "";
  return existing || matchId;
}

export function resolveFoodSharePricing(
  match: Record<string, unknown>,
  shareRaw?: Record<string, unknown> | null,
): FoodSharePricing {
  const breakdown = (match.costBreakdown ?? {}) as Record<string, unknown>;
  const fromBreakdown = {
    sharedPrice:
      typeof breakdown.sharedPrice === "number" ? breakdown.sharedPrice : 0,
    deliveryShare:
      typeof breakdown.deliveryShare === "number" ? breakdown.deliveryShare : 0,
  };
  if (fromBreakdown.sharedPrice > 0 || fromBreakdown.deliveryShare > 0) {
    return fromBreakdown;
  }
  const share = shareRaw ?? {};
  return {
    sharedPrice:
      typeof share.sharedPrice === "number"
        ? share.sharedPrice
        : typeof share.sharingPrice === "number"
          ? share.sharingPrice
          : typeof share.splitPrice === "number"
            ? share.splitPrice
            : 0,
    deliveryShare:
      typeof share.deliveryShare === "number"
        ? share.deliveryShare
        : typeof share.deliveryCost === "number"
          ? share.deliveryCost
          : 0,
  };
}

function parseLatLng(raw: Record<string, unknown>): LatLng | null {
  const lat =
    typeof raw.lat === "number"
      ? raw.lat
      : typeof raw.latitude === "number"
        ? raw.latitude
        : null;
  const lng =
    typeof raw.lng === "number"
      ? raw.lng
      : typeof raw.longitude === "number"
        ? raw.longitude
        : null;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

function readNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function parseUserSavedLocation(
  user: Record<string, unknown> | null | undefined,
): { address: string; latLng: LatLng | null } {
  if (!user) return {address: "", latLng: null};

  const location =
    user.location && typeof user.location === "object"
      ? (user.location as Record<string, unknown>)
      : null;
  const address = readNonEmptyString(
    location?.formattedAddress,
    location?.address,
    user.formattedAddress,
    user.address,
  );
  const latLng = location ? parseLatLng(location) : parseLatLng(user);
  return {address, latLng};
}

export function resolveUserPhone(
  user: Record<string, unknown> | null | undefined,
): string {
  if (!user) return "";
  return readNonEmptyString(
    user.phone,
    user.phoneNumber,
    user.whatsapp,
    user.customerPhone,
  );
}

function timestampMs(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as {toDate: () => Date}).toDate === "function"
  ) {
    return (value as {toDate: () => Date}).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "_seconds" in value &&
    typeof (value as {_seconds: number})._seconds === "number"
  ) {
    return (value as {_seconds: number})._seconds * 1000;
  }
  return null;
}

export function resolveShareVenueAddress(
  share: Record<string, unknown> | null | undefined,
): { restaurantAddress: string; restaurantLocation: Record<string, unknown> | null } {
  if (!share) {
    return {restaurantAddress: "", restaurantLocation: null};
  }
  const restaurantAddress = readNonEmptyString(
    share.pickupAddress,
    share.venueLocation,
    typeof share.location === "string" ? share.location : "",
  );
  const geo =
    share.location && typeof share.location === "object"
      ? parseLatLng(share.location as Record<string, unknown>)
      : parseLatLng(share);
  const restaurantLocation = restaurantAddress
    ? {
        address: restaurantAddress,
        ...(geo ? {lat: geo.lat, lng: geo.lng, latitude: geo.lat, longitude: geo.lng} : {}),
      }
    : null;
  return {restaurantAddress, restaurantLocation};
}

export function resolveShareCatalogFields(
  match: Record<string, unknown>,
  share: Record<string, unknown> | null | undefined,
): {
  foodName: string;
  restaurantName: string;
  foodImageUrl: string | null;
  restaurantAddress: string;
  restaurantLocation: Record<string, unknown> | null;
} {
  const foodName = readNonEmptyString(
    match.foodName,
    share?.foodName,
    share?.title,
    "Shared meal",
  );
  const restaurantName = readNonEmptyString(
    match.restaurantName,
    share?.restaurantName,
    "Restaurant",
  );
  const foodImageUrl =
    readNonEmptyString(match.foodImageUrl, share?.image, share?.foodImageUrl) ||
    null;
  const venue = resolveShareVenueAddress(share);
  return {
    foodName,
    restaurantName,
    foodImageUrl,
    restaurantAddress:
      venue.restaurantAddress ||
      (restaurantName ? `${restaurantName} pickup` : "Pickup location in chat"),
    restaurantLocation: venue.restaurantLocation,
  };
}

function resolveMatchParticipantName(
  match: Record<string, unknown>,
  uid: string,
  user: Record<string, unknown> | null | undefined,
): string {
  const userA = (match.userA ?? {}) as Record<string, unknown>;
  const userB = (match.userB ?? {}) as Record<string, unknown>;
  if (userA.uid === uid && typeof userA.firstName === "string") {
    return userA.firstName;
  }
  if (userB.uid === uid && typeof userB.firstName === "string") {
    return userB.firstName;
  }
  return readNonEmptyString(
    user?.firstName,
    user?.displayName,
    user?.name,
    "User",
  );
}

export function resolveUserDispatchProfile(
  uid: string,
  match: Record<string, unknown>,
  user: Record<string, unknown> | null | undefined,
): FoodShareUserDispatchProfile {
  const saved = parseUserSavedLocation(user);
  return {
    userId: uid,
    name: resolveMatchParticipantName(match, uid, user),
    phone: resolveUserPhone(user),
    address: saved.address,
    lat: saved.latLng?.lat ?? null,
    lng: saved.latLng?.lng ?? null,
  };
}

export function resolvePickupDropoffUserIds(
  users: string[],
  requestsById: Record<string, Record<string, unknown> | null>,
): { pickupUserId: string; dropoffUserId: string } {
  const [u0, u1] = users;
  if (!u0 || !u1) {
    return {pickupUserId: u0 ?? "", dropoffUserId: u1 ?? ""};
  }
  const t0 = timestampMs(requestsById[u0]?.createdAt);
  const t1 = timestampMs(requestsById[u1]?.createdAt);
  if (t0 != null && t1 != null && t0 !== t1) {
    return t0 < t1
      ? {pickupUserId: u0, dropoffUserId: u1}
      : {pickupUserId: u1, dropoffUserId: u0};
  }
  return {pickupUserId: u0, dropoffUserId: u1};
}

function buildLocationRecord(
  profile: FoodShareUserDispatchProfile,
): Record<string, unknown> | null {
  if (!profile.address && profile.lat == null && profile.lng == null) return null;
  return {
    address: profile.address,
    ...(profile.lat != null && profile.lng != null
      ? {lat: profile.lat, lng: profile.lng, latitude: profile.lat, longitude: profile.lng}
      : {}),
  };
}

export function buildFoodShareDispatchOrderPayload(
  matchId: string,
  match: Record<string, unknown>,
  users: string[],
  pricing: FoodSharePricing,
  context: FoodShareDispatchContext,
): Record<string, unknown> {
  const adminFoodShareId =
    typeof match.adminFoodShareId === "string"
      ? match.adminFoodShareId
      : typeof match.foodShareId === "string"
        ? match.foodShareId
        : "";
  const matchChatId =
    typeof match.matchChatId === "string" ? match.matchChatId : matchId;
  const catalog = resolveShareCatalogFields(match, context.share);
  const {sharedPrice, deliveryShare} = pricing;
  const totalPrice = Math.round((sharedPrice + deliveryShare) * 100) / 100;

  const pickup = resolveUserDispatchProfile(
    context.pickupUserId,
    match,
    context.usersById[context.pickupUserId],
  );
  const dropoff = resolveUserDispatchProfile(
    context.dropoffUserId,
    match,
    context.usersById[context.dropoffUserId],
  );
  const pickupLocation = buildLocationRecord(pickup);
  const dropoffLocation = buildLocationRecord(dropoff);
  const restaurantPhone = readNonEmptyString(
    context.share?.restaurantPhone,
    context.share?.restaurantContactPhone,
    context.share?.phone,
    pickup.phone,
  );

  const pickupAddress =
    pickup.address ||
    catalog.restaurantAddress ||
    `Pickup with ${pickup.name}`;
  const dropoffAddress =
    dropoff.address || `Drop-off for ${dropoff.name} — confirm in chat`;

  console.log("[FOOD SHARE PICKUP DATA]", {
    matchId,
    pickupUserId: pickup.userId,
    pickupName: pickup.name,
    pickupPhone: pickup.phone || null,
    pickupAddress,
    pickupLat: pickup.lat,
    pickupLng: pickup.lng,
  });
  console.log("[FOOD SHARE DROPOFF DATA]", {
    matchId,
    dropoffUserId: dropoff.userId,
    dropoffName: dropoff.name,
    dropoffPhone: dropoff.phone || null,
    dropoffAddress,
    dropoffLat: dropoff.lat,
    dropoffLng: dropoff.lng,
  });

  const payload = {
    orderId: matchId,
    userId: context.dropoffUserId,
    customerId: context.dropoffUserId,
    restaurantId: adminFoodShareId,
    venueId: adminFoodShareId,
    restaurantName: catalog.restaurantName,
    restaurantImage: catalog.foodImageUrl,
    deliveryType: "delivery",
    paymentStatus: "paid",
    status: "payment_confirmed",
    deliveryStatus: "pending",
    totalPrice,
    total: totalPrice,
    subtotal: sharedPrice,
    deliveryFee: deliveryShare,
    items: [
      {
        name: catalog.foodName,
        title: catalog.foodName,
        quantity: 1,
        qty: 1,
        image: catalog.foodImageUrl,
        price: sharedPrice,
      },
    ],
    matchId,
    matchChatId,
    adminFoodShareId,
    foodShareId: adminFoodShareId,
    orderSource: "food_share",
    type: "food_share",
    participantIds: users,
    pickupUserId: pickup.userId,
    pickupName: pickup.name,
    pickupPhone: pickup.phone || null,
    pickupAddress,
    pickupLat: pickup.lat,
    pickupLng: pickup.lng,
    pickupLocation,
    dropoffUserId: dropoff.userId,
    dropoffName: dropoff.name,
    dropoffPhone: dropoff.phone || null,
    dropoffAddress,
    dropoffLat: dropoff.lat,
    dropoffLng: dropoff.lng,
    dropoffLocation,
    driverId: null,
    assignedDriverId: null,
    driverName: null,
    driverPhone: null,
    customerName: dropoff.name,
    customerPhone: dropoff.phone || null,
    customerPhoneNumber: dropoff.phone || null,
    deliveryAddress: dropoffAddress,
    deliveryLocation: dropoffLocation,
    userLocation: dropoffLocation,
    restaurantAddress: catalog.restaurantAddress,
    restaurantLocation: catalog.restaurantLocation,
    restaurantPhone: restaurantPhone || null,
    restaurantContactPhone: restaurantPhone || null,
    restaurant: {
      name: catalog.restaurantName,
      image: catalog.foodImageUrl,
      address: catalog.restaurantAddress,
      phone: restaurantPhone || null,
    },
    customer: {
      name: dropoff.name,
      phone: dropoff.phone || null,
    },
    driver: {
      id: null,
      name: null,
      phone: null,
      vehicle: null,
      avatar: null,
    },
    groupId: `fs_${matchId}`,
    estimatedDeliveryTime: 35,
    estimatedDeliveryMinutes: 35,
    estimatedPrepTime: 35,
    etaMinutes: 35,
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    expired: false,
    marketplaceArchived: false,
    hiddenForRestaurant: false,
    archivedByRestaurant: false,
  };

  console.log("[FOOD SHARE ORDER ENRICHED]", {
    matchId,
    orderId: matchId,
    restaurantName: payload.restaurantName,
    restaurantAddress: payload.restaurantAddress,
    pickupName: payload.pickupName,
    pickupAddress: payload.pickupAddress,
    dropoffName: payload.dropoffName,
    dropoffAddress: payload.dropoffAddress,
    items: payload.items,
    totalPrice: payload.totalPrice,
  });

  return payload;
}

async function loadDispatchContextInTxn(
  tx: Transaction,
  adminFoodShareId: string,
  userIds: string[],
): Promise<FoodShareDispatchContext> {
  const usersById: Record<string, Record<string, unknown>> = {};
  const requestsById: Record<string, Record<string, unknown> | null> = {};
  const reads: Promise<void>[] = [];

  let share: Record<string, unknown> | null = null;
  if (adminFoodShareId) {
    reads.push(
      tx.get(admin.firestore().doc(`adminFoodShares/${adminFoodShareId}`)).then(
        (snap) => {
          share = snap.exists ? (snap.data() ?? {}) : null;
        },
      ),
    );
  }

  for (const uid of userIds) {
    reads.push(
      tx.get(admin.firestore().doc(`users/${uid}`)).then((snap) => {
        usersById[uid] = snap.exists ? (snap.data() ?? {}) : {};
      }),
    );
    if (adminFoodShareId) {
      reads.push(
        tx
          .get(
            admin
              .firestore()
              .doc(`matchRequests/${adminFoodShareId}_${uid}`),
          )
          .then((snap) => {
            requestsById[uid] = snap.exists ? (snap.data() ?? {}) : null;
          }),
      );
    }
  }

  await Promise.all(reads);
  const {pickupUserId, dropoffUserId} = resolvePickupDropoffUserIds(
    userIds,
    requestsById,
  );
  return {share, usersById, pickupUserId, dropoffUserId};
}

export async function repairFoodShareOrderDetailsIfNeeded(
  matchId: string,
): Promise<{ repaired: boolean; orderId: string } | null> {
  const db = admin.firestore();
  const matchSnap = await db.doc(`matches/${matchId}`).get();
  if (!matchSnap.exists) return null;

  const match = matchSnap.data() ?? {};
  const users = matchUsersFullyPaid(match);
  if (users.length !== 2) return null;

  const orderId = resolveFoodShareOrderId(matchId, match);
  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) return null;

  const adminFoodShareId =
    typeof match.adminFoodShareId === "string"
      ? match.adminFoodShareId
      : typeof match.foodShareId === "string"
        ? match.foodShareId
        : "";

  let repaired = false;
  await db.runTransaction(async (tx) => {
    const [freshMatchSnap, freshOrderSnap, context] = await Promise.all([
      tx.get(matchSnap.ref),
      tx.get(orderRef),
      loadDispatchContextInTxn(tx, adminFoodShareId, users),
    ]);
    if (!freshMatchSnap.exists || !freshOrderSnap.exists) return;

    const freshMatch = freshMatchSnap.data() ?? {};
    const existing = freshOrderSnap.data() ?? {};
    const pricing = resolveFoodSharePricing(freshMatch, context.share);
    const payload = buildFoodShareDispatchOrderPayload(
      matchId,
      freshMatch,
      users,
      pricing,
      context,
    );

    const patch: Record<string, unknown> = {};
    const copyKeys = [
      "deliveryAddress",
      "deliveryLocation",
      "userLocation",
      "restaurantAddress",
      "restaurantLocation",
      "customerPhone",
      "customerPhoneNumber",
      "restaurantPhone",
      "restaurantContactPhone",
      "items",
      "customerName",
      "restaurant",
      "customer",
      "restaurantName",
      "restaurantImage",
      "pickupUserId",
      "pickupName",
      "pickupPhone",
      "pickupAddress",
      "pickupLat",
      "pickupLng",
      "pickupLocation",
      "dropoffUserId",
      "dropoffName",
      "dropoffPhone",
      "dropoffAddress",
      "dropoffLat",
      "dropoffLng",
      "dropoffLocation",
      "orderSource",
      "type",
      "matchId",
    ] as const;

    for (const key of copyKeys) {
      const next = payload[key];
      const prev = existing[key];
      const missing =
        prev == null ||
        prev === "" ||
        (key === "items" &&
          (!Array.isArray(prev) ||
            prev.length === 0 ||
            JSON.stringify(prev) !== JSON.stringify(next))) ||
        (key === "pickupLat" && typeof prev !== "number") ||
        (key === "pickupLng" && typeof prev !== "number") ||
        (key === "dropoffLat" && typeof prev !== "number") ||
        (key === "dropoffLng" && typeof prev !== "number");
      if (missing && next != null && next !== "") {
        patch[key] = next;
        repaired = true;
      }
    }

    if (!repaired) return;

    patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    tx.set(orderRef, patch, {merge: true});
    console.log("[FOOD SHARE ORDER DATA]", {
      matchId,
      orderId,
      repaired: true,
      patch,
    });
  });

  return {repaired, orderId};
}

export async function createFoodShareDispatchOrderInTxn(
  tx: Transaction,
  matchId: string,
  match: Record<string, unknown>,
  users: string[],
): Promise<{orderId: string; created: boolean}> {
  const orderId = resolveFoodShareOrderId(matchId, match);
  const existingOrderId =
    typeof match.orderId === "string" ? match.orderId.trim() : "";

  if (existingOrderId) {
    const existingOrderSnap = await tx.get(
      admin.firestore().doc(`orders/${existingOrderId}`),
    );
    if (existingOrderSnap.exists) {
      return {orderId: existingOrderId, created: false};
    }
  }

  const adminFoodShareId =
    typeof match.adminFoodShareId === "string"
      ? match.adminFoodShareId
      : typeof match.foodShareId === "string"
        ? match.foodShareId
        : "";
  const context = await loadDispatchContextInTxn(tx, adminFoodShareId, users);
  const pricing = resolveFoodSharePricing(match, context.share);

  const orderRef = admin.firestore().doc(`orders/${orderId}`);
  const payload = buildFoodShareDispatchOrderPayload(
    matchId,
    match,
    users,
    pricing,
    context,
  );

  try {
    tx.set(orderRef, payload);
  } catch (error) {
    console.error("[FOOD SHARE ORDER ERROR]", {
      matchId,
      orderId,
      path: `orders/${orderId}`,
      message: error instanceof Error ? error.message : String(error),
      error,
    });
    throw error;
  }

  console.log("[FOOD SHARE ORDER CREATED]", {
    orderId,
    matchId,
    path: `orders/${orderId}`,
    deliveryType: payload.deliveryType,
    paymentStatus: payload.paymentStatus,
    status: payload.status,
    deliveryStatus: payload.deliveryStatus,
    totalPrice: payload.totalPrice,
    deliveryAddress: payload.deliveryAddress,
    restaurantAddress: payload.restaurantAddress,
    customerPhone: payload.customerPhone,
    items: payload.items,
    driverId: payload.driverId,
    assignedDriverId: payload.assignedDriverId,
  });

  console.log("[FOOD SHARE ORDER DATA]", {
    orderId,
    matchId,
    adminFoodShareId,
    customerId: payload.customerId,
    restaurantId: payload.restaurantId,
    deliveryAddress: payload.deliveryAddress,
    restaurantAddress: payload.restaurantAddress,
    customerPhone: payload.customerPhone,
    items: payload.items,
    pricing,
  });

  console.log("[FOOD SHARE DRIVER POOL]", {
    orderId,
    matchId,
    expectedPoolPath: `driver_marketplace_pool/${orderId}`,
    trigger: "syncDriverMarketplacePool on orders/{orderId} write",
  });

  return {orderId, created: true};
}

function matchUsersFullyPaid(
  match: Record<string, unknown>,
  userPayments?: Record<string, {paymentStatus?: string}>,
): string[] {
  const users = Array.isArray(match.users)
    ? match.users.filter((x): x is string => typeof x === "string")
    : [];
  if (users.length !== 2) return [];

  const payments =
    userPayments ??
    ((match.userPayments ?? {}) as Record<string, {paymentStatus?: string}>);
  const allPaid = users.every((u) => isPaidStatus(payments[u]?.paymentStatus));
  return allPaid ? users : [];
}

/** Idempotent — creates orders/{matchId} for fully-paid matches missing dispatch. */
export async function backfillFoodShareDispatchOrderIfNeeded(
  matchId: string,
): Promise<{orderId: string; created: boolean; poolExists: boolean; repaired?: boolean} | null> {
  const db = admin.firestore();
  const matchRef = db.doc(`matches/${matchId}`);

  try {
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) {
      console.log("[FOOD SHARE ORDER ERROR]", {
        matchId,
        reason: "match_not_found",
      });
      return null;
    }

    const match = matchSnap.data() ?? {};
    const users = matchUsersFullyPaid(match);
    if (users.length !== 2) {
      console.log("[FOOD SHARE ORDER ERROR]", {
        matchId,
        reason: "not_fully_paid",
        lifecycle: match.lifecycle ?? null,
        userPayments: match.userPayments ?? null,
      });
      return null;
    }

    const orderId = resolveFoodShareOrderId(matchId, match);
    const orderSnap = await db.doc(`orders/${orderId}`).get();
    if (orderSnap.exists) {
      const repair = await repairFoodShareOrderDetailsIfNeeded(matchId);
      const lifecycle = String(match.lifecycle ?? "").toUpperCase();
      if (lifecycle !== "ORDER_PLACED" || match.orderId !== orderId) {
        await matchRef.set(
          {
            orderId,
            lifecycle: "ORDER_PLACED",
            orderStatus: "order_placed",
            deliveryStatus: "pending",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
      }
      const poolSnap = await db.doc(`driver_marketplace_pool/${orderId}`).get();
      console.log("[FOOD SHARE DRIVER POOL]", {
        orderId,
        matchId,
        poolPath: `driver_marketplace_pool/${orderId}`,
        poolExists: poolSnap.exists,
        repaired: repair?.repaired ?? false,
      });
      return {
        orderId,
        created: false,
        poolExists: poolSnap.exists,
        repaired: repair?.repaired ?? false,
      };
    }

    let created = false;
    let resolvedOrderId = orderId;

    await db.runTransaction(async (tx) => {
      const freshMatchSnap = await tx.get(matchRef);
      if (!freshMatchSnap.exists) return;
      const freshMatch = freshMatchSnap.data() ?? {};
      const freshUsers = matchUsersFullyPaid(freshMatch);
      if (freshUsers.length !== 2) return;

      const result = await createFoodShareDispatchOrderInTxn(
        tx,
        matchId,
        freshMatch,
        freshUsers,
      );
      resolvedOrderId = result.orderId;
      created = result.created;

      tx.set(
        matchRef,
        {
          status: "matched",
          orderId: resolvedOrderId,
          lifecycle: "ORDER_PLACED",
          orderStatus: "order_placed",
          deliveryStatus: "pending",
          paymentStatus: "paid",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    });

    const poolSnap = await db.doc(`driver_marketplace_pool/${resolvedOrderId}`).get();
    if (created) {
      console.log("[FOOD SHARE ORDER_PLACED]", {
        matchId,
        orderId: resolvedOrderId,
        orderCreated: true,
        lifecycle: "ORDER_PLACED",
        matchPath: `matches/${matchId}`,
        orderPath: `orders/${resolvedOrderId}`,
        poolExists: poolSnap.exists,
        note: "backfill",
      });
    }

    console.log("[FOOD SHARE DRIVER POOL]", {
      orderId: resolvedOrderId,
      matchId,
      poolPath: `driver_marketplace_pool/${resolvedOrderId}`,
      poolExists: poolSnap.exists,
    });

    return {orderId: resolvedOrderId, created, poolExists: poolSnap.exists};
  } catch (error) {
    console.error("[FOOD SHARE ORDER ERROR]", {
      matchId,
      message: error instanceof Error ? error.message : String(error),
      error,
    });
    throw error;
  }
}

export function isMatchReadyForDispatch(matchSnap: DocumentSnapshot): boolean {
  if (!matchSnap.exists) return false;
  const match = matchSnap.data() ?? {};
  return matchUsersFullyPaid(match).length === 2;
}
