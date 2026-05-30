/**
 * Keeps `public_matchable_orders` in sync with joinable `orders` docs (safe fields only).
 *
 * Deploy: `firebase deploy --only functions:syncPublicMatchableOrder,firestore:rules`
 *
 * Existing orders: touch/save each order once, or add a one-off admin backfill script.
 */
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type DocumentData,
} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {isOrderExpired} from "./orderExpiry.js";

const db = getFirestore();

const JOIN_DISCOVERY_ORDER_STATUSES = [
  "open",
  "active",
  "waiting",
  "matched",
  "pending",
  "full",
] as const;

function joinGrowthDiscoveryStatusOk(status: unknown): boolean {
  return (
    typeof status === "string" &&
    (JOIN_DISCOVERY_ORDER_STATUSES as readonly string[]).includes(status)
  );
}

function isMarketplaceDeliveryOrderDoc(data: DocumentData): boolean {
  return data?.deliveryType === "delivery";
}

function usersAllStrings(users: unknown): users is string[] {
  return (
    Array.isArray(users) &&
    users.length <= 20 &&
    users.every((u) => typeof u === "string")
  );
}

function participantsAllStrings(participants: unknown): boolean {
  if (!Array.isArray(participants) || participants.length > 20) return false;
  for (const p of participants) {
    if (typeof p === "string") continue;
    if (
      p &&
      typeof p === "object" &&
      "userId" in p &&
      typeof (p as {userId: unknown}).userId === "string"
    ) {
      continue;
    }
    return false;
  }
  return true;
}

function participantCount(participants: unknown): number {
  return Array.isArray(participants) ? participants.length : 0;
}

function isHalfOrderJoinEligible(data: DocumentData): boolean {
  const cardId = data.cardId;
  if (typeof cardId !== "string" || cardId.length === 0) return false;
  const users = data.users;
  if (!usersAllStrings(users)) return false;
  const maxUsers = data.maxUsers;
  if (typeof maxUsers !== "number" || maxUsers < 2 || maxUsers > 20) return false;
  if (users.length < 1 || users.length >= maxUsers) return false;
  return joinGrowthDiscoveryStatusOk(data.status);
}

function isClassicSwipeJoinEligible(data: DocumentData): boolean {
  const cardId = data.cardId;
  const hasCard = typeof cardId === "string" && cardId.length > 0;
  if (hasCard) return false;
  const maxPeople = data.maxPeople;
  if (typeof maxPeople !== "number" || maxPeople < 2 || maxPeople > 50) {
    return false;
  }
  const participants = data.participants;
  if (!participantsAllStrings(participants)) return false;
  const pc = participantCount(participants);
  if (pc < 1 || pc >= maxPeople) return false;
  return joinGrowthDiscoveryStatusOk(data.status);
}

function shouldPublish(data: DocumentData): boolean {
  if (isMarketplaceDeliveryOrderDoc(data)) return false;
  if (data.expired === true || data.marketplaceArchived === true) return false;
  if (isOrderExpired(data.createdAt)) return false;
  if (!joinGrowthDiscoveryStatusOk(data.status)) return false;
  return isHalfOrderJoinEligible(data) || isClassicSwipeJoinEligible(data);
}

function anchorPoint(data: DocumentData): {lat: number; lng: number} | null {
  const latRaw =
    typeof data.latitude === "number"
      ? data.latitude
      : typeof data.lat === "number"
        ? data.lat
        : null;
  const lngRaw =
    typeof data.longitude === "number"
      ? data.longitude
      : typeof data.lng === "number"
        ? data.lng
        : null;
  if (
    latRaw != null &&
    lngRaw != null &&
    Number.isFinite(latRaw) &&
    Number.isFinite(lngRaw)
  ) {
    return {lat: latRaw, lng: lngRaw};
  }
  const loc = data.location;
  if (loc && typeof loc === "object") {
    const m = loc as Record<string, unknown>;
    const la =
      typeof m.latitude === "number"
        ? m.latitude
        : typeof m.lat === "number"
          ? m.lat
          : null;
    const ln =
      typeof m.longitude === "number"
        ? m.longitude
        : typeof m.lng === "number"
          ? m.lng
          : null;
    if (
      la != null &&
      ln != null &&
      Number.isFinite(la) &&
      Number.isFinite(ln)
    ) {
      return {lat: la, lng: ln};
    }
  }
  return null;
}

function memberIdsFromOrder(data: DocumentData): string[] {
  if (usersAllStrings(data.users)) return [...data.users];
  const parts = data.participants;
  if (!Array.isArray(parts)) return [];
  const ids: string[] = [];
  for (const p of parts) {
    if (typeof p === "string") ids.push(p);
    else if (
      p &&
      typeof p === "object" &&
      typeof (p as {userId?: string}).userId === "string"
    ) {
      ids.push((p as {userId: string}).userId);
    }
  }
  return ids;
}

function hostUserIdFromOrder(data: DocumentData): string | null {
  if (typeof data.hostId === "string" && data.hostId) return data.hostId;
  if (typeof data.createdBy === "string" && data.createdBy) {
    return data.createdBy;
  }
  if (usersAllStrings(data.users) && data.users.length > 0) return data.users[0];
  const parts = data.participants;
  if (Array.isArray(parts) && parts.length > 0) {
    const p0 = parts[0];
    if (typeof p0 === "string") return p0;
    if (
      p0 &&
      typeof p0 === "object" &&
      typeof (p0 as {userId?: string}).userId === "string"
    ) {
      return (p0 as {userId: string}).userId;
    }
  }
  return null;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function tagsFromOrder(data: DocumentData): string[] {
  const out: string[] = [];
  const ft = data.foodType;
  if (typeof ft === "string" && ft.trim()) out.push(truncate(ft.trim(), 64));
  const mt = data.mealType;
  if (typeof mt === "string" && mt.trim()) out.push(truncate(mt.trim(), 64));
  return out.slice(0, 12);
}

export const syncPublicMatchableOrder = onDocumentWritten(
  {
    document: "orders/{orderId}",
    region: "us-central1",
  },
  async (event) => {
    const orderId = event.params.orderId as string;
    const pubRef = db.collection("public_matchable_orders").doc(orderId);

    const after = event.data?.after;
    if (!after?.exists) {
      await pubRef.delete().catch(() => undefined);
      return;
    }

    const data = after.data()!;
    if (!shouldPublish(data)) {
      await pubRef.delete().catch(() => undefined);
      return;
    }

    const nowMs = Date.now();
    const exp =
      typeof data.expiresAt === "number" ? (data.expiresAt as number) : null;
    if (exp != null && exp <= nowMs) {
      await pubRef.delete().catch(() => undefined);
      return;
    }

    const point = anchorPoint(data);
    const hostUserId = hostUserIdFromOrder(data);
    const memberIds = memberIdsFromOrder(data);
    const maxSlots =
      typeof data.maxUsers === "number"
        ? data.maxUsers
        : typeof data.maxPeople === "number"
          ? data.maxPeople
          : 0;
    const joined = usersAllStrings(data.users)
      ? data.users.length
      : participantCount(data.participants);
    const slotsOpen = maxSlots > 0 ? Math.max(0, maxSlots - joined) : 0;

    const foodName =
      typeof data.foodName === "string" && data.foodName.trim()
        ? data.foodName.trim()
        : typeof data.title === "string" && data.title.trim()
          ? data.title.trim()
          : "Order";
    const restaurantName =
      typeof data.restaurantName === "string" && data.restaurantName.trim()
        ? data.restaurantName.trim()
        : typeof data.restaurant === "string" && data.restaurant.trim()
          ? data.restaurant.trim()
          : typeof data.restaurant === "object" &&
              data.restaurant != null &&
              typeof (data.restaurant as {name?: string}).name === "string" &&
              (data.restaurant as {name: string}).name.trim()
            ? (data.restaurant as {name: string}).name.trim()
            : foodName;
    let itemsSummary: string | null =
      typeof data.itemsSummary === "string" && data.itemsSummary.trim()
        ? truncate(data.itemsSummary.trim(), 200)
        : null;
    const mealType =
      typeof data.mealType === "string" && data.mealType.trim()
        ? truncate(data.mealType.trim(), 120)
        : null;
    const foodType =
      typeof data.foodType === "string" && data.foodType.trim()
        ? truncate(data.foodType.trim(), 80)
        : null;

    const priceHint =
      typeof data.pricePerPerson === "number"
        ? data.pricePerPerson
        : typeof data.pricePerPerson === "string"
          ? truncate(data.pricePerPerson, 24)
          : typeof data.totalPrice === "number"
            ? data.totalPrice
            : null;

    const city =
      typeof data.city === "string" && data.city.trim()
        ? truncate(data.city.trim(), 80)
        : typeof data.pickupCity === "string" && data.pickupCity.trim()
          ? truncate(data.pickupCity.trim(), 80)
          : null;

    const etaMinutesRaw =
      typeof data.etaMinutes === "number" && Number.isFinite(data.etaMinutes)
        ? data.etaMinutes
        : typeof data.estimatedDeliveryMinutes === "number" &&
            Number.isFinite(data.estimatedDeliveryMinutes)
          ? data.estimatedDeliveryMinutes
          : typeof data.deliveryEtaMinutes === "number" &&
              Number.isFinite(data.deliveryEtaMinutes)
            ? data.deliveryEtaMinutes
            : null;
    const etaMinutes =
      etaMinutesRaw != null
        ? Math.max(0, Math.min(240, Math.round(etaMinutesRaw)))
        : null;

    const restaurantImageRaw =
      typeof data.restaurantImage === "string"
        ? data.restaurantImage.trim()
        : typeof data.restaurantLogo === "string"
          ? data.restaurantLogo.trim()
          : typeof data.venueImage === "string"
            ? data.venueImage.trim()
            : "";
    const restaurantImageUrl =
      restaurantImageRaw &&
      (restaurantImageRaw.startsWith("https://") ||
        restaurantImageRaw.startsWith("http://"))
        ? truncate(restaurantImageRaw, 512)
        : null;

    const createdRaw = data.createdAt;
    let createdAt: Timestamp;
    if (createdRaw instanceof Timestamp) {
      createdAt = createdRaw;
    } else if (
      createdRaw &&
      typeof (createdRaw as {toMillis?: () => number}).toMillis === "function"
    ) {
      createdAt = createdRaw as Timestamp;
    } else if (typeof createdRaw === "number" && Number.isFinite(createdRaw)) {
      createdAt = Timestamp.fromMillis(createdRaw);
    } else {
      createdAt = Timestamp.fromMillis(nowMs);
    }

    const payload: Record<string, unknown> = {
      orderId,
      createdAt,
      status: typeof data.status === "string" ? data.status : "open",
      foodName: truncate(foodName, 200),
      restaurantName: truncate(restaurantName, 200),
      mealType,
      itemsSummary,
      foodType,
      etaMinutes,
      restaurantImageUrl,
      latitude: point?.lat ?? null,
      longitude: point?.lng ?? null,
      city,
      tags: tagsFromOrder(data),
      slotsOpen,
      maxSlots,
      expiresAt: exp,
      priceHint,
      hostUserId,
      memberIds: memberIds.slice(0, 24),
      updatedAt: FieldValue.serverTimestamp(),
    };

    try {
      await pubRef.set(payload, {merge: true});
    } catch (e) {
      logger.error("[syncPublicMatchableOrder] write failed", {orderId, err: e});
    }
  },
);
